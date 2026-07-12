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


def _first_release(path: str) -> tuple[str | None, str | None]:
    text = (ROOT / path).read_text(encoding="utf-8")
    match = re.search(
        r"^## v([^\s（]+)(?:（[^）]+）)?\s*$\s*^发布时间：([^\s]+)\s*$",
        text,
        flags=re.MULTILINE,
    )
    return match.groups() if match else (None, None)


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
    changelog_version, changelog_date = _first_release("CHANGELOG.md")
    notes_version, notes_date = _first_release("frontend/public/docs/release-notes.md")

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
    if changelog_date in {None, "未发布"}:
        mismatches.append(f"CHANGELOG.md 发布时间: {changelog_date!r}")
    if notes_date != changelog_date:
        mismatches.append(
            f"frontend/public/docs/release-notes.md 发布时间: {notes_date!r}，应为 {changelog_date!r}"
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
