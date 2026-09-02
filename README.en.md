# ArchSight Solver

[中文](README.md) | English

ArchSight Solver is an Apache-2.0, web-native structural mechanics workbench for deterministic, transparent, and reproducible analysis. It is built for structural engineers, educators, advanced learners, developers, and agent runtimes.

[Try the public workbench](https://solver.archsight.cn/) · [Five-minute quickstart](docs/en/quickstart.md) · [Capabilities and limits](docs/en/capabilities.md) · [Verification packages](docs/en/verification-package.md)

## What it solves

- Beam systems: simply supported, continuous, and cantilever beams.
- Two-dimensional plane trusses.
- Two-dimensional plane frames.
- Linear-elastic, deterministic 2D static analysis: first-order by default, with optional corotational P-Delta geometric nonlinear analysis (GNA/GNIA) and linear eigenvalue buckling for frames.

The workbench reports reactions, displacements, member forces, shear, bending moment, deflection, diagnostics, and result provenance as appropriate for each system. It also supports load cases and combinations, public benchmark projects, DOCX/XLSX reports, ASMS-JSON, REST, CLI, MCP, and Host Protocol 1.0.

## Why v1.9.1 matters

v1.9.1 is a patch release that stabilizes the v1.9.0 embedded-workbench integration: first Host handshake, host theme synchronization, Cloud file actions, saved-state feedback, and focused parameter panels. Solver owns the single Host Portal header and its real version, examples, validation submission, theme, and settings, while a host such as ArchSight Cloud owns negotiated new, open, save, save-as, project, revision, and sharing workflows plus identity and remote storage.

Screen results, standard or detailed DOCX, XLSX, and the portable verification package reuse the same canonical evidence. Failed validation, singular systems, and incomplete nonlinear paths preserve explicit review evidence without fabricating final displacements or forces. Corotational GNA/GNIA and linear buckling remain separate verified gates. The legacy initial-stress iteration remains available only for v1.8.0 replay compatibility. v1.8 does not add accounts, cloud project storage, code design, or another analysis domain.

The verification package introduced in v1.7 remains shared by the Web workbench, REST API, CLI, and MCP. It can be replayed with the current solver and returns one of three states:

- `pass`: integrity is valid and replay matches under the published tolerance.
- `review`: replay matches, but a version difference requires human review.
- `fail`: format, integrity, or replay comparison failed.

A digest is not a digital signature, identity proof, engineering certification, or safety approval. Solver results still require review by a qualified professional for their intended use.

## Run from source

Requirements: Python `>=3.13`, [uv](https://docs.astral.sh/uv/), and Node.js `>=22.22.0`.

```bash
git clone https://github.com/ArchSightLabs/archsight-solver.git
cd archsight-solver
uv sync --frozen
npm --prefix frontend ci --include=optional
```

Start the backend and frontend in separate terminals:

```bash
uv run python app.py
npm --prefix frontend run dev
```

- API: `http://127.0.0.1:6240`
- Web: `http://127.0.0.1:6241`

Run the main local gates:

```bash
uv run python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
```

See the [English quickstart](docs/en/quickstart.md) for GitHub Release installation, Docker, CLI/MCP verification, and the framework-free Host Client package.

## Open distribution

The v1.9.1 release provides the following public assets:

- Python wheel `archsight_solver-1.9.1-py3-none-any.whl` and source distribution for the CLI and MCP server.
- `archsight-solver-host-client-1.9.1.tgz` with zero runtime dependencies.
- A public offline Docker image archive, plus the immutable workflow image `ghcr.io/archsightlabs/archsight-solver:v1.9.1` for callers with GitHub Packages access.
- SPDX SBOM, Trivy report, and `SHA256SUMS`.

PyPI and npm registry publication are not required. The versioned assets attached to the GitHub Release are the direct distribution path.

## Trust and responsibility boundary

ArchSight Solver does not provide:

- 3D frames or spatial structures.
- Dynamic or response-spectrum analysis; material nonlinearity, plasticity, contact, arc-length/post-buckling path tracing, or code stability design. Frame GNA/GNIA is limited to 2D Euler-Bernoulli members, linear-elastic material, conservative static loading, and load control; linear buckling is limited to a generalized eigenvalue analysis about a prestressed state.
- Code-based member design, reinforcement design, construction safety approval, or engineering sign-off.
- Accounts, organizations, subscriptions, cloud project storage, or a multi-tenant platform.
- Digital signatures, certificates, third-party certification, or replacement of licensed engineering judgment.

The public demonstration may optionally enable privacy-bounded aggregate milestone analytics. Analytics are disabled by default and never include structural models, parameters, project or file names, results, error text, user identity, or device fingerprints. See [Analytics and privacy](docs/analytics-and-privacy.md) (Chinese source of truth).

## Documentation

- [English quickstart](docs/en/quickstart.md)
- [English capabilities](docs/en/capabilities.md)
- [English verification package guide](docs/en/verification-package.md)
- [Chinese documentation index](README.md#文档入口)
- [REST API reference](docs/api-reference.md)
- [ASMS-JSON](docs/asms-json-schema.md)
- [Host Protocol 1.0](docs/host-protocol-1.md)
- [Public benchmark methodology](docs/verification/benchmark-methodology.md)

The Chinese technical documentation remains the semantic source of truth. The English entry is intentionally bounded to installation, public capabilities, verification, and responsibility limits so the two surfaces remain maintainable.

## License and trademarks

The repository code, documentation, and test samples are licensed under [Apache-2.0](LICENSE). Keep [NOTICE.md](NOTICE.md) when redistributing.

Apache-2.0 does not grant rights to the ArchSight, ArchSight Solver, ArchSightLabs, logo, or official-domain trademarks. Forks and commercial services must use a clearly distinct product identity and must not imply official certification, partnership, or endorsement. See [TRADEMARKS.md](TRADEMARKS.md).
