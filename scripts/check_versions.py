from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")


def _read_json(path: str) -> dict[str, object]:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def _uv_project_version() -> str | None:
    text = (ROOT / "uv.lock").read_text(encoding="utf-8")
    match = re.search(
        r'\[\[package\]\]\s+name = "archsight-solver"\s+version = "([^"]+)"',
        text,
    )
    return match.group(1) if match else None


def _first_release_from_text(text: str) -> tuple[str | None, str | None, str | None]:
    match = re.search(
        r"^## v([^\s（]+)(?:（[^）]+）)?\s*$\s*^(发布时间|状态)：([^\r\n]+)\s*$",
        text,
        flags=re.MULTILINE,
    )
    return match.groups() if match else (None, None, None)


def _first_release(path: str) -> tuple[str | None, str | None, str | None]:
    return _first_release_from_text((ROOT / path).read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 ArchSight Solver 发布版本是否一致。")
    parser.add_argument("--expected-version", help="额外要求的版本号，例如 tag v1.6.0 对应 1.6.0。")
    args = parser.parse_args()

    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    expected = str(pyproject["project"]["version"])
    if not VERSION_PATTERN.fullmatch(expected):
        print(f"版本检查失败: pyproject.toml 版本不是稳定 SemVer: {expected}")
        return 1

    frontend_package = _read_json("frontend/package.json")
    frontend_lock = _read_json("frontend/package-lock.json")
    lock_root = frontend_lock.get("packages", {}).get("", {})  # type: ignore[union-attr]
    changelog_version, changelog_state, changelog_state_value = _first_release("CHANGELOG.md")
    notes_version, notes_state, notes_state_value = _first_release("frontend/public/docs/release-notes.md")

    observed = {
        "frontend/package.json": frontend_package.get("version"),
        "frontend/package-lock.json": frontend_lock.get("version"),
        "frontend/package-lock.json packages['']": lock_root.get("version"),
        "uv.lock": _uv_project_version(),
        "CHANGELOG.md": changelog_version,
        "frontend/public/docs/release-notes.md": notes_version,
    }
    mismatches = [f"{path}: {value!r}" for path, value in observed.items() if value != expected]
    if args.expected_version and args.expected_version != expected:
        mismatches.append(f"发布 tag: {args.expected_version!r}")
    if changelog_state == "发布时间":
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", changelog_state_value or ""):
            mismatches.append(f"CHANGELOG.md 发布时间: {changelog_state_value!r}")
    elif changelog_state == "状态" and (changelog_state_value or "").startswith("发布候选"):
        if args.expected_version:
            mismatches.append("发布 tag 不允许使用发布候选状态，必须先写入正式发布日期")
    else:
        mismatches.append(
            f"CHANGELOG.md 发布状态: {changelog_state!r} / {changelog_state_value!r}"
        )
    if (notes_state, notes_state_value) != (changelog_state, changelog_state_value):
        mismatches.append(
            "frontend/public/docs/release-notes.md 发布状态与 CHANGELOG.md 不一致: "
            f"{notes_state!r} / {notes_state_value!r}"
        )

    if mismatches:
        print(f"版本检查失败: 期望所有发布入口均为 {expected}")
        for mismatch in mismatches:
            print(f"- {mismatch}")
        return 1

    print(f"版本检查通过: {expected}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
