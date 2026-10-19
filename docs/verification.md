# Verification record

Executed locally on 2026-10-19: Windows 11 build 26200 x64, WebView2 155.0.4283.62, Node 24.15, npm 11.12, Rust 1.98 MSVC. Reference commit: 4c76ff5bd8d574448ec2c99d890373a64059c287. Linux/macOS CI definitions are provided, but neither their builds nor native behavior ran here.

| Command | Actual result |
| --- | --- |
| `npm.cmd run lint` | Passed, no ESLint errors. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run test:coverage` | 12 files, 82 tests passed. Statements 92.58%, branches 86.75%, functions 89.04%, lines 93.81%. |
| `npm.cmd run crap` | Passed threshold 8 using that coverage run. Four warnings: analyzer could not unambiguously map handleRouteZoom, replaceRoutes, updateRoute and setUser callbacks. Their coverage is reported N/A by this analyzer, not manually excluded. |
| `npm.cmd audit --audit-level=high` | Zero vulnerabilities reported in the installed npm graph. This is not a complete security audit. |
| `npm.cmd run native:check` | Passed, locked dependency graph. |
| `npm.cmd run native:lint` | cargo fmt --check and cargo clippy --locked --all-targets -- -D warnings passed. |
| `npm.cmd run native:test` | 17 Rust tests passed: auth callback/PKCE, API contract/path safety, bounds, permissions, unread, badge bitmap, atomic persistence, profile identity, account/backend cache isolation, invalid cache/journal rejection. |
| `npm.cmd run build` | TypeScript and Vite production build passed. HeroUI/React Router emit benign ignored module-level use-client directive warnings in Vite 6. |
| `npm.cmd run smoke` | Built embedded-assets debug app and completed real Windows WebView2 assertions. Final direct `node scripts/native-smoke.mjs` repeat returned exit 0; evidence copied below. |
| `npm.cmd run native:build` | Built release executable plus unsigned MSI and NSIS packages. No installation or publication. |

The [native evidence JSON](evidence/native-windows.json) records the final fixture assertions and synthetic API request types. The [initial phase-1 evidence](evidence/phase1-windows.json) predates the retained UI port. No customer credentials were used. Tests invoke Tauri/Rust and real native child webviews; Playwright only connects to WebView2's debug endpoints. The production runtime has no Node sidecar.

Native cases include independent same-origin cookie/localStorage identities; physical bounds/visibility at monitor scale 1.0; focus, hide/show, all layouts and drawers; refresh and zoom; shared-origin popup profile and privilege denial; hibernate/restore; full-process persistence; targeted clearing; hostname redirect rejection; native favicon discovery and invalid hint rejection; mock OIDC PKCE/credential storage/cancellation; retained drawer CRUD; offline recovery; credential refresh; invalid-auth rejection; cold callback and warm replay rejection. EME negotiation accepted Widevine and PlayReady configurations, but no protected provider playback was tested.

Two regressions found by repeat native tests were fixed before final evidence: a nullable native favicon crashed a retained React component (bridge normalization plus regression test), and the original hint capability URL patterns omitted non-default ports (explicit port wildcards limited to the two narrow hint commands). Management commands remained denied. PowerShell treats redirected native stderr as an error stream even when tools succeed, so final process exit codes were captured explicitly; no compiler/test failure is accepted on the basis of a rendered UI.

Artifacts: `src-tauri/target/release/omnia-tauri.exe`, `src-tauri/target/release/bundle/msi/Omnia Tauri_0.11.0_x64_en-US.msi`, `src-tauri/target/release/bundle/nsis/Omnia Tauri_0.11.0_x64-setup.exe`. Hashes are recorded in [artifact hashes](evidence/windows-artifacts.json). Generated binaries, dependencies and reports remain ignored by Git; lockfiles and deterministic test drivers are included.

Not verified: real Omnia/Authentik or hosted-provider accounts, Spotify protected playback, hardware media, OS notification/badge rendering, installed autostart/protocol registration, mixed-DPI monitors, signing/notarization, Linux/macOS builds or native behavior. See the concrete [platform/provider checklist](platform-support.md) and per-feature [parity report](parity.md). No performance or memory reduction claim is made.
