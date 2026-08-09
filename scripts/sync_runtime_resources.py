from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.runtime_resources import PACKAGED_RESOURCE_FILES, packaged_resource_path


def sync_runtime_resources(*, check: bool = False) -> list[str]:
    stale: list[str] = []
    for relative_path in PACKAGED_RESOURCE_FILES:
        source = ROOT / relative_path
        target = packaged_resource_path(relative_path)
        if not source.is_file():
            raise FileNotFoundError(f"缺少运行时资源事实源: {relative_path}")
        if target.is_file() and target.read_bytes() == source.read_bytes():
            continue
        stale.append(relative_path)
        if not check:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    return stale


def main() -> int:
    parser = argparse.ArgumentParser(description="同步 Python wheel 运行时资源副本。")
    parser.add_argument("--check", action="store_true", help="只检查，不写文件。")
    args = parser.parse_args()
    stale = sync_runtime_resources(check=args.check)
    if args.check and stale:
        print("以下运行时资源副本缺失或过期：", file=sys.stderr)
        for relative_path in stale:
            print(f"- {relative_path}", file=sys.stderr)
        return 1
    if stale:
        print(f"已同步 {len(stale)} 个 Python 发行包运行时资源。")
    else:
        print("Python 发行包运行时资源已是最新。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
