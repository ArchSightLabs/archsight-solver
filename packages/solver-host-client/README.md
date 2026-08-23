# @archsight/solver-host-client

Framework-free, zero-runtime-dependency browser client for ArchSight Solver Host Protocol 1.0. It manages exact-origin checks, capability negotiation, session and nonce binding, launch retries, save correlation, timeouts, and disposal.

The package stays Apache-2.0 licensed and free. ArchSight Solver attaches the npm tarball to GitHub Releases, so a public npm registry is not required:

```bash
npm install ./archsight-solver-host-client-1.8.0.tgz
```

```ts
import { SolverHostClient } from "@archsight/solver-host-client";

const iframe = document.querySelector<HTMLIFrameElement>("#solver")!;
const client = new SolverHostClient({
  getSolverWindow: () => iframe.contentWindow,
  solverOrigin: "https://solver.example.com",
  onProjectChanged(projectDocument) {
    console.log(projectDocument);
  },
});

await client.launch({ projectDocument, mode: "editable" });
```

Call `client.dispose()` when the iframe or host page is torn down. The package does not provide authentication, persistence, multi-tenancy, or engineering approval. See the repository's [Host Client guide](https://github.com/ArchSight/archsight-solver/blob/main/docs/host-client.md) and [Host Protocol 1.0](https://github.com/ArchSight/archsight-solver/blob/main/docs/host-protocol-1.md) for the complete contract.

中文说明：该包是现有 Host Protocol 1.0 客户端的独立发行物，不改变 Solver 开源、免费和无账号依赖的边界；GitHub Release tarball 可直接安装。
