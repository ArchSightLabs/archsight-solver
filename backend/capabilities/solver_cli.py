from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

from backend.capabilities.solver_tools import TOOL_HANDLERS


def _read_payload(input_path: str | None) -> Dict[str, Any]:
    raw = sys.stdin.read() if input_path in (None, "-") else Path(input_path).read_text(encoding="utf-8")
    try:
        payload = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"输入不是合法 JSON: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise ValueError("输入必须是 JSON object")
    return payload


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Run ArchSight Solver capability tools locally.")
    parser.add_argument("tool", choices=sorted(TOOL_HANDLERS), help="能力工具名称。")
    parser.add_argument("--input", "-i", help="输入 JSON 文件路径；省略或使用 - 时从 stdin 读取。")
    parser.add_argument("--pretty", action="store_true", help="格式化输出 JSON，便于人工查看。")
    args = parser.parse_args(argv)

    try:
        result = TOOL_HANDLERS[args.tool](_read_payload(args.input))
    except Exception as exc:  # pragma: no cover - process boundary safety
        result = {
            "capabilityId": f"solver.{args.tool}",
            "capabilityVersion": "cli",
            "status": "invalid_input",
            "inputValidated": False,
            "warnings": [str(exc)],
        }

    indent = 2 if args.pretty else None
    print(json.dumps(result, ensure_ascii=False, indent=indent, sort_keys=bool(indent)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
