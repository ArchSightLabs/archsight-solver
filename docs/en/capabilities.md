# Capabilities and limits

[中文](../capabilities.md) | English

ArchSight Solver is a deterministic structural mechanics workbench and integration runtime. It supports three two-dimensional, linear-elastic static analysis families. First-order analysis uses the small-displacement assumption; plane frames can additionally run the bounded P-Delta GNA/GNIA described below.

## Intended users

- Structural engineers performing transparent checks of bounded beam, plane-truss, and plane-frame models.
- Educators and learners teaching or verifying structural mechanics examples.
- Developers integrating deterministic analysis through REST, CLI, MCP, ASMS-JSON, or Host Protocol 1.0.
- Open-source contributors adding benchmarks, tests, interaction improvements, and evidence quality.

## Analysis families

### Beam systems

- Simply supported, continuous, and cantilever beams.
- Uniform, point, linearly varying, and superposed loads.
- Reactions, shear, bending moment, deflection, and controlling positions.
- Beam kinematics use transverse displacement and rotation (`v`, `rz`).

### Two-dimensional plane trusses

- Roof, bridge-type, cantilever, and teaching trusses.
- Nodal loads, member self-weight converted to equivalent nodal loads, and uniform member temperature loads under linear-elastic static assumptions.
- Node displacement, support reaction, member axial force, and axial stress.
- Truss nodes use translation only (`ux`, `uy`); truss members do not carry bending moment.

### Two-dimensional plane frames

- Portal frames, explicit 2D frames, and frame-beam degradation checks.
- Nodal, distributed member, concentrated member, and uniform member temperature loads, plus basic load cases and combinations.
- Node displacement, support reaction, member-end axial/shear/moment, and controlling member values.
- Optional 2D elastic P-Delta geometric nonlinear analysis and global linear eigenvalue buckling. `corotational_newton_v1` runs an independent full-Newton load path per case or combination with multiple convergence criteria, residual line search, adaptive cutback, separate equilibrium/stability states, last-converged recovery, and explicit failure evidence. Explicit or linear-buckling-mode imperfections enter the reference geometry for GNIA. `initial_stress_v1` remains only for v1.8.0 replay compatibility. Member Euler K=1 values are only a review-target screen, not the global buckling conclusion or a code design check.
- Frame nodes use `ux`, `uy`, and `rz`.

Temperature support is limited to uniform temperature change on 2D linear-elastic frame and truss members. It does not include through-section gradients, transient heat transfer, creep, or bridge-specific thermal fields.

## Workbench and evidence

- Built-in templates, quick model generation, public benchmark projects, and local `.slv` project files.
- Explicit model, load, support, material, section, and result-source editing.
- Model diagrams, load diagrams, force diagrams, deflection/displacement views, result summaries, and structured diagnostics.
- Single-factor sensitivity analysis for bounded trend exploration.
- DOCX/XLSX report export.
- Portable verification packages containing input, recorded result, provenance, diagnostics, version, SHA-256 integrity, and replay rules.
- Stale-result blocking based on the active analysis object and model provenance.

## Integration surfaces

- REST: synchronous calculation, local asynchronous jobs, preview, sensitivity, export, public examples, and verification packages.
- ASMS-JSON: common model input for Web, REST, CLI, MCP, benchmarks, and reports.
- CLI: local automation, batch processing, and CI replay.
- MCP: tool discovery, schemas/resources, calculation, benchmark replay, project inspection, and verification packages.
- Host Protocol 1.0 plus a framework-free, zero-runtime-dependency Host Client tarball.
- Public benchmark catalog with expected values, tolerances, sources, and reproducible reports.

The local asynchronous job endpoint uses SQLite plus per-worker thread pools. It is useful for local batching and agent calls, but it is not a distributed, multi-host, high-throughput task queue.

## Identity and deployment boundary

The open-source core has no built-in login, account, organization, subscription, remote project store, or multi-tenant authorization layer. A private deployment must provide identity, authorization, rate limits, audit context, TLS, and network policy through its gateway or host system.

The public demonstration may enable allowlisted aggregate milestone events. Analytics are disabled by default and do not contain models, parameters, project or file data, results, error text, identity, IP fields, user agent fields, or device fingerprints.

## Explicit non-goals

- 3D frames, spatial structures, shells, solids, or BIM authoring.
- Dynamic or response-spectrum analysis; material nonlinearity, plasticity, contact, code stability design, or arc-length/displacement-controlled post-buckling paths. Frame GNA/GNIA is limited to 2D Euler-Bernoulli members, linear-elastic material, conservative static loading, and load control. It supports explicit and linear-buckling-mode imperfections, but not plasticity, local/lateral-torsional buckling, GMNIA, or the full equilibrium branch beyond a limit point.
- Code-based member design, reinforcement design, construction safety approval, or engineering sign-off.
- OpenSeesPy or another external solver as the runtime kernel.
- Accounts, organizations, subscriptions, cloud collaboration, or a plugin marketplace.
- Digital signatures, certificates, publisher identity proof, or third-party product certification.

Verification-package `pass` means integrity and deterministic replay consistency under the published contract and tolerance. It does not prove that the model, assumptions, loads, design, or intended use is correct. Qualified professional review remains required.

See the [five-minute quickstart](quickstart.md), [verification package guide](verification-package.md), and [Chinese capability source](../capabilities.md).
