from __future__ import annotations

import argparse
import json
import os
import site
import subprocess
import sys
import tempfile
import venv
from pathlib import Path


SMOKE_CODE = r'''
import json
import os
import subprocess
import sys
from importlib import metadata
from pathlib import Path

import backend
from backend.benchmarks.catalog import load_benchmark_catalog
from backend.capabilities import mcp_server
from backend.common.material_catalog import material_catalog
from backend.normalizers.section_library import load_section_library
from backend.runtime_resources import PACKAGED_RESOURCE_FILES, packaged_resource_path
from backend.template_registry import list_builtin_template_registry


def run_json(command, payload):
    completed = subprocess.run(
        command,
        input=json.dumps(payload, ensure_ascii=False) + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )
    return json.loads(completed.stdout)


environment_root = Path(sys.prefix).resolve()
backend_path = Path(backend.__file__).resolve()
assert environment_root in backend_path.parents, backend_path

for relative_path in PACKAGED_RESOURCE_FILES:
    path = packaged_resource_path(relative_path).resolve()
    assert path.is_file(), path
    assert environment_root in path.parents, path

assert material_catalog()
assert load_section_library()
catalog = load_benchmark_catalog()
registry = list_builtin_template_registry()
assert catalog["cases"]
assert registry["templates"]
for uri in mcp_server.FILE_RESOURCE_PATHS:
    assert mcp_server._read_resource(uri)["contents"][0]["text"].strip(), uri

scripts_dir = Path(sys.executable).resolve().parent
cli_name = "archsight-solver-tool.exe" if os.name == "nt" else "archsight-solver-tool"
mcp_name = "archsight-solver-mcp.exe" if os.name == "nt" else "archsight-solver-mcp"
cli = scripts_dir / cli_name
mcp = scripts_dir / mcp_name
assert cli.is_file(), cli
assert mcp.is_file(), mcp

created = run_json(
    [str(cli), "verification_package_create"],
    {
        "payload": {
            "beamType": "simply_supported",
            "loadType": "uniform",
            "q": 12,
            "E": 206,
            "I": 85000,
            "spans": [6],
        }
    },
)
verified = run_json(
    [str(cli), "verification_package_verify"],
    {"package": created["package"]},
)
assert created["status"] == "pass", created
assert verified["status"] == "pass", verified
assert verified["verification"]["replayMatched"] is True

mcp_messages = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    {"jsonrpc": "2.0", "id": 3, "method": "resources/read", "params": {"uri": "archsight://docs/mcp-resources"}},
]
mcp_completed = subprocess.run(
    [str(mcp)],
    input="\n".join(json.dumps(message, ensure_ascii=False) for message in mcp_messages) + "\n",
    text=True,
    encoding="utf-8",
    capture_output=True,
    check=True,
)
mcp_responses = [json.loads(line) for line in mcp_completed.stdout.splitlines()]
tool_names = {tool["name"] for tool in mcp_responses[1]["result"]["tools"]}
assert {"verification_package_create", "verification_package_verify"} <= tool_names
assert mcp_responses[2]["result"]["contents"][0]["text"].strip()

print(json.dumps({
    "backendPath": str(backend_path),
    "version": metadata.version("archsight-solver"),
    "resourceCount": len(PACKAGED_RESOURCE_FILES),
    "benchmarkCount": len(catalog["cases"]),
    "templateCount": registry["templateCount"],
    "verificationStatus": verified["status"],
    "mcpToolCount": len(tool_names),
}, ensure_ascii=False, indent=2))
'''


def _environment_python(environment_root: Path) -> Path:
    return environment_root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def check_distribution(wheel: Path, *, no_deps: bool = False) -> dict:
    wheel = wheel.resolve()
    if not wheel.is_file() or wheel.suffix != ".whl":
        raise FileNotFoundError(f"未找到 wheel: {wheel}")

    with tempfile.TemporaryDirectory(prefix="archsight-solver-wheel-") as temporary_directory:
        environment_root = Path(temporary_directory) / ".venv"
        venv.EnvBuilder(with_pip=True).create(environment_root)
        environment_python = _environment_python(environment_root)
        install_command = [str(environment_python), "-m", "pip", "install"]
        if no_deps:
            install_command.append("--no-deps")
        install_command.append(str(wheel))
        subprocess.run(install_command, check=True)

        environment = os.environ.copy()
        if no_deps:
            dependency_paths = [path for path in site.getsitepackages() if Path(path).is_dir()]
            if not dependency_paths:
                raise RuntimeError("--no-deps 模式需要调用方环境提供依赖 site-packages")
            existing = environment.get("PYTHONPATH")
            if existing:
                dependency_paths.append(existing)
            environment["PYTHONPATH"] = os.pathsep.join(dependency_paths)

        completed = subprocess.run(
            [str(environment_python), "-c", SMOKE_CODE],
            cwd=temporary_directory,
            env=environment,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        )
        result = json.loads(completed.stdout)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return result


def main() -> int:
    parser = argparse.ArgumentParser(description="在临时虚拟环境安装并校验 ArchSight Solver wheel。")
    parser.add_argument("wheel", type=Path, help="待验证的 .whl 文件。")
    parser.add_argument(
        "--no-deps",
        action="store_true",
        help="只安装 wheel，并从当前 Python 环境借用依赖；用于离线验证包内容。正式发布门禁不应使用此参数。",
    )
    args = parser.parse_args()
    check_distribution(args.wheel, no_deps=args.no_deps)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
