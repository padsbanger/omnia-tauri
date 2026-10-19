# Progress record

Reference: padsbanger/omnia main at 4c76ff5bd8d574448ec2c99d890373a64059c287 (0.11.0), fetched 2026-10-19 into read-only ../omnia-reference-tauri. Matches supplied HEAD. Target origin/Git identity and original AGENTS instructions preserved. MIT license retained.

Host: Windows 11 26200 x64, Rust 1.98 MSVC, Node 24.15, npm 11.12, WebView2 155. Use npm.cmd because PowerShell blocks npm.ps1.

Completed:
- Audited source instructions/docs, main/IPC/preload, auth/API/settings, windows/unread/favicon/badge, renderer/domain/tests and workflows.
- Phase-1 real Tauri multiwebview fixture passed before UI port; preserved in docs/evidence/phase1-windows.json.
- Ported retained React components/styles/assets; native lifecycle/profile/layout, permissions, authentication/API/cache, unread/favicon, settings and packaging implemented.
- Actual Windows native fixture passed isolated storage, persistence, popup identity/denial, lifecycle/layout/drawers, targeted clear, mock OIDC/API, offline recovery, cold/warm callbacks and replay rejection.
- Fixed repeat-run regression caused by native null favicon at retained UI boundary; added regression test.
- Extended narrow hint test exposed non-default-port URL capability matching; added explicit port wildcards only to the two untrusted hint permissions. Management authority remains shell-only.
- README, parity/platform/migration docs and three-platform CI supplied. Final Windows release MSI/NSIS built; expanded native hints smoke passed with exit 0.

Latest checks: TypeScript 82 tests, 92.58% statements / 86.75% branches; lint/typecheck and CRAP threshold 8 pass (four analyzer callback-mapping warnings). Rust fmt/clippy/check and all 17 tests passed. Windows EME negotiation accepted Widevine and PlayReady configurations; provider playback remains unverified.

Implementation and local verification complete for the documented Windows scope. Final smoke and native build returned exit 0; artifact hashes recorded. Both lockfiles and the implementation are included in the local commit; no push. Final evidence: docs/evidence/native-windows.json. Commands/results: docs/verification.md. Next work is the explicit platform/provider checklist, not additional mocked parity claims.

Open gaps: real provider/production Authentik accounts, hardware/OS notification delivery, mixed DPI; Linux/macOS CI and native tests have not run. Linux/macOS origin-aware media adapters and macOS physical named-store cleanup remain gaps. Per-route memory, Castlabs-specific behavior and original Electron native menu/splash are unavailable. No credentials requested, autostart/protocol settings changed, installer installed, release published or reference files modified.
