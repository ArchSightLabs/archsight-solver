# Five-minute quickstart

[中文快速开始](../quickstart.md) | English

Choose one path. The Web path needs no installation. The GitHub Release wheel provides the CLI and MCP server. Docker provides the complete Web/API runtime. A source checkout is for development and contribution.

## 1. Try the workbench

Open [solver.archsight.cn](https://solver.archsight.cn/), select a built-in template or public benchmark, run the analysis, and inspect diagnostics plus the current result source. From **成果导出** you can download a DOCX/XLSX result or a verification package.

No account is required. The public site is a demonstration environment; save important work as a local `.slv` project file.

## 2. Install the CLI and MCP server from a GitHub Release

Requirements: Python `>=3.13`.

Download `archsight_solver-1.7.0-py3-none-any.whl` from the [v1.7.0 GitHub Release](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.7.0), then install it into a virtual environment:

```bash
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
python -m pip install ./archsight_solver-1.7.0-py3-none-any.whl
```

Create `create-request.json` (a source checkout also includes `examples/verification-package/create-request.json`):

```json
{
  "payload": {
    "analysisType": "beam",
    "beamType": "simply_supported",
    "loadType": "uniform",
    "spans": [6],
    "q": 12,
    "E": 206,
    "I": 85000
  },
  "evidence": {
    "source": "five-minute-quickstart"
  }
}
```

Create and replay a verification package:

```bash
archsight-solver-tool verification_package_create --input create-request.json --pretty > created.json
python -c "import json; d=json.load(open('created.json',encoding='utf-8')); json.dump({'package':d['package']},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

Success means the second command returns `status: "pass"`, `integrityValid: true`, and `replayMatched: true`.

Start the MCP server with:

```bash
archsight-solver-mcp
```

The installed distribution includes runtime schemas, benchmark data, templates, materials, supports, sections, and MCP documentation. It does not depend on a repository checkout or current working directory.

## 3. Run the complete Web/API image

```bash
docker run --rm -p 127.0.0.1:6240:6240 ghcr.io/archsightlabs/archsight-solver:v1.7.0
```

Open `http://127.0.0.1:6240`. The single image serves the frontend and `/api`. Use an immutable `v1.7.0` tag or recorded digest for reproducible deployment; do not use `latest` as release evidence.

If GHCR is unavailable, download `archsight-solver-v1.7.0.tar.gz` from the GitHub Release and load it:

```bash
docker load --input archsight-solver-v1.7.0.tar.gz
docker run --rm -p 127.0.0.1:6240:6240 archsight-solver:release
```

Verify downloaded assets against `SHA256SUMS` from the same Release before use.

## 4. Install the framework-free Host Client

Download `archsight-solver-host-client-1.7.0.tgz` from the GitHub Release:

```bash
npm install ./archsight-solver-host-client-1.7.0.tgz
```

```ts
import { SolverHostClient } from "@archsight/solver-host-client";

const client = new SolverHostClient({
  iframe: document.querySelector("#solver") as HTMLIFrameElement,
  solverOrigin: "https://solver.example.com",
});
```

The package has zero runtime dependencies and implements Host Protocol 1.0. Exact-origin allowlists, session ID, nonce, parent-window checks, CSP `frame-ancestors`, save ownership, and read-only behavior remain the host's responsibility. See the [Host Client guide](../host-client.md).

## 5. Run from source

Requirements: Python `>=3.13`, [uv](https://docs.astral.sh/uv/), and Node.js `>=22.22.0`.

```bash
git clone https://github.com/ArchSightLabs/archsight-solver.git
cd archsight-solver
uv sync --frozen
npm --prefix frontend ci --include=optional
```

Start two terminals:

```bash
uv run python app.py
npm --prefix frontend run dev
```

- API: `http://127.0.0.1:6240`
- Web: `http://127.0.0.1:6241`

Main local gates:

```bash
uv run python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
```

## Next

- [Capabilities and limits](capabilities.md)
- [Verification package guide](verification-package.md)
- [REST API reference](../api-reference.md)
- [ASMS-JSON model contract](../asms-json-schema.md)
- [Host Protocol 1.0](../host-protocol-1.md)
- [Chinese golden flows](../golden-flows.md)
