from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOST_DIRECTORY = ROOT / "examples" / "host-iframe-demo"


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="启动 ArchSight Solver 与双 origin Host iframe Reference。")
    parser.add_argument("--solver-host", default="127.0.0.1")
    parser.add_argument("--solver-port", type=int, default=6241)
    parser.add_argument("--solver-url", help="连接已有 Solver 时使用的完整 http/https URL。")
    parser.add_argument("--host-host", default="127.0.0.1")
    parser.add_argument("--host-port", type=int, default=6250)
    parser.add_argument("--host-only", action="store_true", help="只启动 Reference Host，不管理 Vite 子进程。")
    return parser


def validate_http_url(value: str, label: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{label} 必须是完整的 http/https URL：{value}")
    if parsed.username or parsed.password:
        raise ValueError(f"{label} 不允许包含用户名或密码。")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", ""))


def build_urls(args: argparse.Namespace) -> tuple[str, str, str]:
    solver_url = validate_http_url(
        args.solver_url or f"http://{args.solver_host}:{args.solver_port}",
        "Solver URL",
    )
    host_origin = f"http://{args.host_host}:{args.host_port}"
    host_url = f"{host_origin}/?{urllib.parse.urlencode({'solverUrl': solver_url})}"
    return solver_url, host_origin, host_url


def build_solver_command(args: argparse.Namespace) -> tuple[list[str], dict[str, str]]:
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise RuntimeError("未找到 npm，请先安装 Node.js 并完成 frontend 依赖安装。")
    command = [
        npm,
        "run",
        "dev",
        "--",
        "--host",
        args.solver_host,
        "--port",
        str(args.solver_port),
        "--strictPort",
    ]
    env = os.environ.copy()
    env["VITE_SOLVER_HOST_ALLOWED_ORIGINS"] = f"http://{args.host_host}:{args.host_port}"
    return command, env


def wait_for_solver(url: str, process: subprocess.Popen[str] | None, timeout_seconds: float = 120.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"Solver 子进程提前退出，退出码 {process.returncode}。")
        try:
            with urllib.request.urlopen(url, timeout=1.0) as response:
                if response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise RuntimeError(f"等待 Solver 就绪超时：{url}")


def stop_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    solver_url, host_origin, host_url = build_urls(args)
    solver_process: subprocess.Popen[str] | None = None
    server: ThreadingHTTPServer | None = None
    try:
        if not args.host_only:
            command, env = build_solver_command(args)
            solver_process = subprocess.Popen(command, cwd=ROOT / "frontend", env=env, text=True)

        handler = partial(QuietStaticHandler, directory=str(HOST_DIRECTORY))
        server = ThreadingHTTPServer((args.host_host, args.host_port), handler)
        server_thread = threading.Thread(target=server.serve_forever, name="solver-reference-host", daemon=True)
        server_thread.start()

        if not args.host_only:
            wait_for_solver(solver_url, solver_process)

        print(f"Solver: {solver_url}", flush=True)
        print(f"Reference Host: {host_url}", flush=True)
        print("按 Ctrl+C 停止。", flush=True)

        while solver_process is None or solver_process.poll() is None:
            time.sleep(0.25)
        raise RuntimeError(f"Solver 子进程已退出，退出码 {solver_process.returncode}。")
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Host iframe demo 启动失败：{exc}", file=sys.stderr)
        return 1
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
        stop_process(solver_process)


if __name__ == "__main__":
    raise SystemExit(main())
