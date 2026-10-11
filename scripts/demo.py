"""Offline example: python scripts/demo.py [path-to-intake.json]."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from packages.core.intake import diagnose, parse_intake


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "examples" / "intake.json"
    print(json.dumps(diagnose(parse_intake(json.loads(path.read_text()))), indent=2))
