import dataclasses
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import unittest

from packages.core.intake import diagnose, parse_intake
from packages.core.policies import (
    Action, ApprovalLedger, BudgetLedger, Principal, authorize,
)


ROOT = Path(__file__).resolve().parents[1]


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / "examples" / "intake.json").read_text())

    def test_example_has_no_external_permission_or_invented_estimate(self):
        result = diagnose(parse_intake(self.data))
        self.assertEqual(result["service_track"], "document_search")
        self.assertEqual(result["external_processing"], "blocked")
        self.assertTrue(result["human_review"])
        self.assertIsNone(result["estimated_cost_brl"])

    def test_restricted_egress_remains_blocked_even_with_generic_flag(self):
        self.data.update(sensitivity="restricted", external_processing_allowed=True)
        self.assertEqual(diagnose(parse_intake(self.data))["external_processing"], "blocked")

    def test_normal_with_explicit_permission(self):
        self.data["external_processing_allowed"] = True
        self.assertEqual(diagnose(parse_intake(self.data))["external_processing"], "permitted")

    def test_rejects_secret_fields_and_missing_fields(self):
        for data in (dict(self.data, api_key="dummy"),
                     {key: value for key, value in self.data.items() if key != "users"}):
            with self.assertRaises(ValueError):
                parse_intake(data)

    def test_no_implicit_coercion_or_invalid_values(self):
        bad = {"goal": "shell", "sensitivity": "public",
               "external_processing_allowed": "true", "existing_tools": [3],
               "users": True, "monthly_budget_brl": -1}
        for key, value in bad.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                parse_intake(dict(self.data, **{key: value}))


class AuthorizationTests(unittest.TestCase):
    def test_cross_tenant_and_unknown_resources_are_denied(self):
        principal = Principal("a-user", "A", frozenset({"client"}))
        ownership = {"a-document": "A", "b-document": "B"}
        authorize(principal, "A", "a-document", ownership)
        for tenant, resource in (("B", "b-document"), ("A", "b-document"),
                                 ("A", "unknown")):
            with self.subTest(tenant=tenant, resource=resource), self.assertRaises(PermissionError):
                authorize(principal, tenant, resource, ownership)


class BudgetTests(unittest.TestCase):
    def test_idempotent_retry_and_failed_unknown_keep_ceiling(self):
        ledger = BudgetLedger(30, {"A": 30})
        first = ledger.reserve("A", "request-1", 20)
        self.assertEqual(first, ledger.reserve("A", "request-1", 20))
        for outcome in ("failed", "unknown"):
            ledger.settle("A", "request-1", outcome)
            with self.assertRaises(PermissionError):
                ledger.reserve("A", "request-2", 20)
        with self.assertRaises(ValueError):
            ledger.reserve("A", "request-1", 21)

    def test_success_reconciles_only_within_ceiling_and_is_final(self):
        ledger = BudgetLedger(30, {"A": 30})
        ledger.reserve("A", "one", 20)
        with self.assertRaises(ValueError):
            ledger.settle("A", "one", "success", 21)
        ledger.settle("A", "one", "success", 10)
        ledger.reserve("A", "two", 20)
        with self.assertRaises(ValueError):
            ledger.settle("A", "one", "success", 0)

    def test_global_budget_race_cannot_overbook(self):
        ledger = BudgetLedger(50, {"A": 500, "B": 500})
        def attempt(index):
            try:
                ledger.reserve("A" if index % 2 else "B", str(index), 10)
                return 1
            except PermissionError:
                return 0
        with ThreadPoolExecutor(max_workers=20) as pool:
            self.assertEqual(sum(pool.map(attempt, range(40))), 5)

    def test_tenant_limit_and_parallel_retry(self):
        ledger = BudgetLedger(100, {"A": 10, "B": 90})
        with ThreadPoolExecutor(max_workers=10) as pool:
            records = list(pool.map(lambda _: ledger.reserve("A", "same", 10), range(20)))
        self.assertTrue(all(record == records[0] for record in records))
        with self.assertRaises(PermissionError):
            ledger.reserve("A", "different", 1)
        ledger.reserve("B", "one", 90)


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.action = Action.snapshot("A", "prepare_proposal", "proposal-1", 1, 20, {"service": "RAG"})
        self.reviewer = Principal("human-1", "A", frozenset({"human_reviewer"}), True)
        self.operator = Principal("operator-1", "A", frozenset({"operator"}))
        self.ledger = ApprovalLedger()
        self.ledger.issue("approval-1", self.action, self.reviewer,
                          self.now + timedelta(hours=1), now=self.now)

    def test_snapshot_does_not_share_mutable_payload(self):
        payload = {"service": "RAG"}
        action = Action.snapshot("A", "prepare_proposal", "proposal-1", 1, 20, payload)
        before = action.digest
        payload["service"] = "GPU"
        self.assertEqual(action.digest, before)
        with self.assertRaises(dataclasses.FrozenInstanceError):
            action.target = "changed"

    def test_every_bound_field_change_invalidates_approval(self):
        changes = {"tenant": "B", "operation": "send_proposal", "target": "proposal-2",
                   "version": 2, "ceiling": 30, "payload_json": '{"service":"GPU"}'}
        for field, value in changes.items():
            with self.subTest(field=field), self.assertRaises(PermissionError):
                self.ledger.consume("approval-1", dataclasses.replace(self.action, **{field: value}),
                                    self.operator, now=self.now)
        self.ledger.consume("approval-1", self.action, self.operator, now=self.now)

    def test_expiry_and_replay(self):
        with self.assertRaises(PermissionError):
            self.ledger.consume("approval-1", self.action, self.operator,
                                now=self.now + timedelta(hours=1))
        self.ledger.consume("approval-1", self.action, self.operator, now=self.now)
        with self.assertRaises(PermissionError):
            self.ledger.consume("approval-1", self.action, self.operator, now=self.now)

    def test_cross_tenant_consumption_and_nonhuman_review(self):
        outsider = Principal("b-operator", "B", frozenset({"operator"}))
        with self.assertRaises(PermissionError):
            self.ledger.consume("approval-1", self.action, outsider, now=self.now)
        for reviewer in (dataclasses.replace(self.reviewer, human=False),
                         dataclasses.replace(self.reviewer, tenant="B")):
            with self.assertRaises(PermissionError):
                self.ledger.issue("other", self.action, reviewer,
                                  self.now + timedelta(hours=1), now=self.now)

    def test_parallel_consumption_succeeds_once(self):
        def consume(_):
            try:
                self.ledger.consume("approval-1", self.action, self.operator, now=self.now)
                return 1
            except PermissionError:
                return 0
        with ThreadPoolExecutor(max_workers=10) as pool:
            self.assertEqual(sum(pool.map(consume, range(20))), 1)


if __name__ == "__main__":
    unittest.main()
