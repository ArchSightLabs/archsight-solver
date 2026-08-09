# Verification Package 1.0

[中文](../verification-package.md) | English

A verification package is a portable UTF-8 JSON record of one deterministic structural analysis. The Web workbench, REST API, CLI, and MCP share the public format `archsight-solver-verification-package@1.0.0`.

It answers: which input, solver version, result, evidence, and replay policy produced this record; whether the package content changed; and whether the current solver can reproduce it. It does not authenticate the publisher or approve an engineering design.

## Package sections

| Section | Contents |
|---|---|
| `solver` | Solver, product, response-envelope, and storage-contract versions |
| `analysis.input` | Original structural analysis input |
| `analysis.request` | Solver request echo and, when available, `normalizedRequest` |
| `analysis.model` | Normalized structural model |
| `analysis.recordedResult` | Full stable recorded result |
| `analysis.diagnostics` | Solver diagnostics and applicable-boundary evidence |
| `evidence` | Workbench provenance, result source, benchmark, job ID, or caller evidence |
| `replayPolicy` | Absolute tolerance `1e-8`, relative tolerance `1e-6`, and no ignored result paths |
| `integrity` | SHA-256 digests for input, request, model, result, and the complete package |

The package format version is independent of the product version. A solver upgrade does not automatically change `formatVersion`.

## Export from the Web workbench

1. Open a template, public benchmark project, or `.slv` project and run the active analysis object.
2. Confirm that the result is current and choose the intended primary, load-case, or combination result source.
3. Open **成果导出** (Deliverables) and select **导出可信计算包** (Export verification package).
4. The browser downloads `archsight-solver-<beam|frame|truss>.solver-verification.json`.

The workbench blocks stale results. If the project revision or active analysis object changes while the request is in flight, the returned file is discarded. DOCX images and report layout settings are not part of this path.

## REST

Create a package and immediately replay it:

```http
POST /api/verification-packages
Content-Type: application/json
```

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
    "source": "rest-quickstart"
  }
}
```

Replay an existing package:

```http
POST /api/verification-packages/verify
Content-Type: application/json
```

The request body is `{ "package": <complete-package-object> }`. Machine-readable contracts are available from `GET /api/contracts/schemas/solver-verification-package` and `GET /api/contracts/openapi`.

## CLI

After installing the GitHub Release wheel:

```bash
archsight-solver-tool verification_package_create --input create-request.json --pretty > created.json
python -c "import json; d=json.load(open('created.json',encoding='utf-8')); json.dump({'package':d['package']},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

`create-request.json` uses the same `{ "payload": ..., "evidence": ... }` structure as the REST example. From a source checkout, replace `archsight-solver-tool` with `uv run python -m backend.capabilities.solver_cli`.

To replay a raw package downloaded from the workbench:

```bash
python -c "import json; p=json.load(open('archsight-solver-beam.solver-verification.json',encoding='utf-8')); json.dump({'package':p},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

Keep the downloaded package as raw UTF-8 JSON. A tool that parses and rewrites high-precision numbers may legitimately change the package digest; wrap the package without rounding numeric values.

## MCP

Start the installed MCP server with `archsight-solver-mcp`.

- `verification_package_create` accepts `{ "payload": <ASMS-JSON>, "evidence": {} }`.
- `verification_package_verify` accepts `{ "package": <complete-package-object> }`.

Both tools reuse the same capability handlers and JSON Schemas as the CLI.

## Status model

| Status | Meaning | Action |
|---|---|---|
| `pass` | Format, integrity, and same-version replay passed | Continue professional review with the package as software evidence |
| `review` | Integrity and replay match, but the solver version differs | Review version changes and warnings before accepting |
| `fail` | Format, integrity, or replay comparison failed | Do not treat the package as an unchanged record; inspect `mismatches` |

Numeric fields use the published absolute and relative tolerances. Non-numeric fields require exact equality. Mismatches include a JSON Path, detail, expected value, and actual value, capped at 100 entries.

## Responsibility boundary

- SHA-256 detects content changes; it does not identify the author or publisher.
- `pass` means replay consistency under the public contract and tolerance, not correctness of model assumptions or engineering input.
- A package is not a digital signature, certificate, third-party certification, code-based design check, engineering sign-off, or structural safety conclusion.
- Real projects still require qualified review of loads, units, supports, stiffness, combinations, applicable codes, and intended use.

See [Capabilities and limits](capabilities.md) and the [English quickstart](quickstart.md).
