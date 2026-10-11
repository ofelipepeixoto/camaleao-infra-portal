"""In-memory reference gates, not authentication, persistence or an executor.

Principal and resource ownership must come from a trusted server outside the
model. Budget units are arbitrary integers, not measured OpenAI costs.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from threading import RLock
from typing import Mapping


@dataclass(frozen=True)
class Principal:
    subject: str
    tenant: str
    roles: frozenset[str]
    human: bool = False


def authorize(principal: Principal, tenant: str, resource: str,
              ownership: Mapping[str, str], role: str = "client") -> None:
    if (not principal.subject or principal.tenant != tenant
            or ownership.get(resource) != tenant or role not in principal.roles):
        raise PermissionError("Unauthorized tenant or resource")


def require_units(value: int) -> None:
    if type(value) is not int or value < 0:
        raise ValueError("Units must be a nonnegative integer")


@dataclass(frozen=True)
class Reservation:
    tenant: str
    key: str
    ceiling: int
    outcome: str = "pending"
    charged: int | None = None


class BudgetLedger:
    """One process only; global+tenant check and reservation use one lock.

Failed or unknown attempts retain their full reservation. A retry reuses its
key; it never allocates a second reservation. No external work is executed.
"""
    def __init__(self, global_limit: int, tenant_limits: Mapping[str, int]):
        require_units(global_limit)
        for limit in tenant_limits.values():
            require_units(limit)
        self._limit = global_limit
        self._limits = dict(tenant_limits)
        self._records: dict[tuple[str, str], Reservation] = {}
        self._lock = RLock()

    def reserve(self, tenant: str, key: str, ceiling: int) -> Reservation:
        require_units(ceiling)
        if tenant not in self._limits or not key:
            raise ValueError("Known tenant and nonempty idempotency key required")
        with self._lock:
            previous = self._records.get((tenant, key))
            if previous:
                if previous.ceiling != ceiling:
                    raise ValueError("Retry ceiling differs from original reservation")
                return previous
            total, own = 0, 0
            for record in self._records.values():
                amount = record.charged if record.outcome == "success" else record.ceiling
                total += amount
                if record.tenant == tenant:
                    own += amount
            if total + ceiling > self._limit or own + ceiling > self._limits[tenant]:
                raise PermissionError("Budget ceiling exhausted")
            record = Reservation(tenant, key, ceiling)
            self._records[tenant, key] = record
            return record

    def settle(self, tenant: str, key: str, outcome: str,
               actual_units: int | None = None) -> Reservation:
        if outcome not in ("success", "failed", "unknown"):
            raise ValueError("Invalid outcome")
        with self._lock:
            record = self._records[tenant, key]
            if outcome == "success":
                require_units(actual_units)
                if actual_units > record.ceiling:
                    raise ValueError("Actual units exceed reservation")
            elif actual_units is not None:
                raise ValueError("Only success can settle measured units")
            if record.outcome == "success":
                if outcome != "success" or record.charged != actual_units:
                    raise ValueError("Final settlement cannot be changed")
                return record
            updated = Reservation(tenant, key, record.ceiling, outcome, actual_units)
            self._records[tenant, key] = updated
            return updated


@dataclass(frozen=True)
class Action:
    tenant: str
    operation: str
    target: str
    version: int
    ceiling: int
    payload_json: str

    @classmethod
    def snapshot(cls, tenant: str, operation: str, target: str, version: int,
                 ceiling: int, payload: Mapping) -> "Action":
        if not tenant or not operation or not target or type(version) is not int or version < 1:
            raise ValueError("Action identity and positive integer version required")
        require_units(ceiling)
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
        return cls(tenant, operation, target, version, ceiling, encoded)

    @property
    def digest(self) -> str:
        encoded = json.dumps([self.tenant, self.operation, self.target, self.version,
                              self.ceiling, self.payload_json], separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Approval:
    identifier: str
    tenant: str
    action_hash: str
    version: int
    target: str
    ceiling: int
    expires_at: datetime
    reviewer: str


class ApprovalLedger:
    """Approval validates a snapshot and is consumed once. No dispatch method."""
    def __init__(self):
        self._records: dict[str, Approval] = {}
        self._consumed: set[str] = set()
        self._lock = RLock()

    def issue(self, identifier: str, action: Action, reviewer: Principal,
              expires_at: datetime, now: datetime | None = None) -> Approval:
        now = now or datetime.now(timezone.utc)
        if (not reviewer.human or "human_reviewer" not in reviewer.roles
                or not reviewer.subject or reviewer.tenant != action.tenant):
            raise PermissionError("Trusted human reviewer required for this tenant")
        if not identifier or expires_at.tzinfo is None or expires_at <= now:
            raise ValueError("Approval must have an identifier and future aware expiry")
        with self._lock:
            if identifier in self._records:
                raise ValueError("Approval identifier already exists")
            approval = Approval(identifier, action.tenant, action.digest, action.version,
                                action.target, action.ceiling, expires_at, reviewer.subject)
            self._records[identifier] = approval
            return approval

    def consume(self, identifier: str, action: Action, requester: Principal,
                now: datetime | None = None) -> Approval:
        now = now or datetime.now(timezone.utc)
        with self._lock:
            approval = self._records[identifier]
            if (not requester.subject or requester.tenant != action.tenant
                    or not ({"operator", "human_reviewer"} & requester.roles)):
                raise PermissionError("Trusted tenant operator required")
            if (identifier in self._consumed or approval.expires_at <= now
                    or approval.tenant != action.tenant or approval.action_hash != action.digest
                    or approval.version != action.version or approval.target != action.target
                    or approval.ceiling != action.ceiling):
                raise PermissionError("Expired, replayed or mismatched approval")
            self._consumed.add(identifier)
            return approval
