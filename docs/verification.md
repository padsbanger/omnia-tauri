# Verification record

Executed locally on 2026-10-19: Windows 11 build 26200 x64, WebView2 155.0.4283.62, Node 24.15, npm 11.12, Rust 1.98 MSVC. Reference commit: 4c76ff5bd8d574448ec2c99d890373a64059c287. Linux/macOS CI definitions are provided, but neither their builds nor native behavior ran here.

Initial migration baseline (the Gmail follow-up is recorded below):

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


## Gmail login popup correction ? 2026-10-19

The user reported a Gmail route waiting indefinitely after a login window opened. The runtime only preserved Google OAuth popups for X/TradingView and rejected initially blank popups; other internal popups replaced the originating view. Generic link-wrapper detection could also prematurely open OAuth continuation/callback parameters in the system browser.

Google sign-in/account windows now preserve the opener and the originating profile for routes that already authorize those Google hosts. Initially blank login popups are supported under the same route policy; their later navigation is still checked. Authentication query parameters remain intact until actual navigation occurs. Other external links retain their existing behavior, and remote management privileges remain denied. The fixture-only popup bypass was removed so the regression exercises the production popup decision.

Passed: lint, typecheck, 90 frontend tests, CRAP threshold 8 (existing callback-mapping warnings), cargo fmt/clippy with warnings denied, 18 Rust tests, full Windows native smoke (exit 0), and MSI/NSIS build (exit 0). Latest coverage: 92.64% statements, 86.95% branches, 89.15% functions, 93.86% lines.

[Native regression evidence](evidence/windows-gmail-popup.json) confirms an initially blank popup shares cookies/localStorage, inherits the opener's temporary sessionStorage nonce, retains window.opener, and delivers an auth-complete postMessage without replacing the waiting route. A second route's identity stays independent, and popup privileged commands remain rejected. Rust/TypeScript tests cover Google sign-in URLs, callback parameters, unauthorized routes and spoofed/insecure hosts. This does not establish successful login with a real Gmail account; that user/provider check remains unverified. Windows artifact hashes were refreshed for the rebuilt packages.
# Gmail failure follow-up: navigation diagnostics

The user reports that Gmail still fails after the popup-context change. No successful Google account login has been observed. Added a bounded local trace of native navigation decisions and popup creation/denial; raw query strings, fragments, credentials and arbitrary paths are omitted. This is diagnostic instrumentation, not a confirmed Gmail fix.

- `npm.cmd run native:test`: 20 Rust tests passed, including URL redaction and bounded trace storage.
- `npm.cmd run native:lint`: fmt and clippy with warnings denied passed.
- `npm.cmd run native:build` with explicit propagation of `$LASTEXITCODE`: exit 0; Windows executable, MSI and NSIS rebuilt. Artifact hashes refreshed; no installer run.
- `npm.cmd run smoke`: frontend/native build completed and all native assertions passed; the PowerShell redirection wrapper reported exit 1, so the already-built driver was rerun explicitly.
- `node scripts/native-smoke.mjs` with explicit propagation of `$LASTEXITCODE`: exit 0. Actual native callbacks recorded popup creation and an external target; full lifecycle, isolation, security and mock OIDC/API checks passed. Evidence: `docs/evidence/windows-navigation-trace.json`.

The next trace identified the missing account host; see the follow-up below. Account login and Linux/macOS remain unverified.

## Gmail account-session continuation fix

The user's Windows trace records a mail.google.com navigation being cancelled while Omnia opens a query-parameter destination at accounts.youtube.com externally. Added accounts.youtube.com to the shared Google host list and the corresponding native navigation rules. This retains the session continuation in the existing profile without allowing general YouTube video links internally. Startup rederives cached route policy, so existing sessions do not need clearing.

The real WebView2 regression uses synthetic intercepted HTTPS pages with the production Gmail host policy. [Before the change](evidence/windows-gmail-continuation-before.json), initial Gmail navigation fails with ERR_ABORTED. [After the change](evidence/windows-gmail-continuation-after.json), the Gmail/account-host/Gmail sequence finishes in the originating view, retains its synthetic cookie, makes no external handoff or popup, and leaves the duplicate profile signed out. No real Google account was used. Unit tests additionally reject hostname lookalikes and keep ordinary YouTube links external.

Executed: lint, typecheck, coverage (91 frontend tests; 92.64% statements / 86.95% branches / 89.15% functions / 93.86% lines), CRAP 8 (the same four callback-mapping warnings), 21 Rust tests, fmt/clippy with warnings denied, `npm.cmd run smoke` (exit 0) and `npm.cmd run native:build` (exit 0). Windows executable/MSI/NSIS rebuilt; not installed. Real Gmail login awaits user retry; native regression success does not establish account/provider verification.

## Regional Google account follow-up

The user's next development trace accepts mail.google.com and accounts.youtube.com, then opens accounts.google.pl externally. Rust and TypeScript now share `src/common/google_account_hosts.json`, pinned on 2026-10-19 from [Google's supported domains](https://www.google.com/supported_domains), plus the observed YouTube account host. Exact regional account hosts require HTTPS/443 without URL credentials and a route policy already authorizing Google accounts. Authentication continuation parameters are preserved. Regional search sites, extra subdomains and lookalikes remain outside this exception.

Executed: 102 frontend tests (92.69% statements / 87.31% branches / 89.25% functions / 93.89% lines), 22 Rust tests, lint/typecheck, CRAP 8 with the same four warnings, and fmt/clippy. Tests check all 188 listed account hosts, context scoping, nested continuation parameters, hostname spoofing, insecure origins and nonstandard ports. The native fixture now chains Polish, UK and German account hosts. Its first launch could not attach to the old dev-mode executable; the subsequent smoke build was blocked by the running user's dev process locking the executable. Native regional evidence is still pending; these failures are not successful native tests.

`npm.cmd run native:build` completed with exit 0; Windows executable/MSI/NSIS rebuilt and artifact hashes refreshed. No installer was run.

After the user stopped the development process, `npm.cmd run smoke` completed with exit 0. The embedded-assets debug executable was rebuilt. [Regional native evidence](evidence/windows-gmail-regional-after.json) confirms that the synthetic Gmail flow traverses YouTube and Polish/UK/German account hosts in the originating WebView2 profile, with no popup/external handoff and with the second profile signed out. The full lifecycle, storage, authority, UI and mock OIDC/API suite also passed. This resolves the native test blocker; actual Gmail account login still needs the user's retry.

## Unread badge delivery

Fixed silent loss of rate-limited unread updates: native rejects a dropped update instead of acknowledging it, and the injected collector records successful acknowledgements only. Pending values coalesce by source, wait for bridge readiness and retry with bounded backoff. Tests cover unchanged counts after rejection, late bridge initialization and rapid Telegram updates.

Executed: 104 frontend tests (92.69% statements / 87.31% branches / 89.25% functions / 93.89% lines), 22 Rust tests, lint/typecheck, CRAP 8 with the existing four callback warnings, fmt/clippy. Native debug/frontend build succeeded. The first driver attempt used an incorrect fixed CDP port after fixture profile rotation; corrected it to use the persisted epoch. The complete driver rerun returned exit 0. [Native evidence](evidence/windows-unread-delivery.json) verifies actual injected HTTPS Gmail DOM hints, zero-count clearing, a visible sidebar badge and native window total appearing/clearing through real events. The Windows taskbar overlay is driven by that same total but its visual rendering was not observed; this test does not establish real provider unread behavior or notification delivery.

`npm.cmd run native:build` returned exit 0. Windows executable/MSI/NSIS rebuilt and artifact hashes refreshed; no installer run.

## Telegram collector follow-up

The user's saved Telegram route uses Web A. Its [Tauri badge branch](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/util/appBadge.ts) bypasses navigator.setAppBadge and calls window.tauri.setNotificationsCount. Omnia now supplies only that bounded count callback. Added independent DOM fallbacks based on Web A's Chat/ChatBadge/AnimatedCounter structure at that commit and [Web K's dedicated chat counters](https://github.com/TelegramOrg/Telegram-web-k/blob/ed0b0def153959ed9f96eff078469837bfc30e0f/src/lib/appDialogsManager.ts). These selectors/structures were inspected, not copied as provider implementation code. DOM fallback is best effort over rendered chats, including muted counters; the provider's API total retains priority.

Executed successfully: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:coverage` (109 tests), `npm.cmd run crap` (threshold 8; four existing mapping warnings), `npm.cmd run native:test` (22 tests), `npm.cmd run native:lint`, and `npm.cmd run native:build` (frontend, executable, MSI, NSIS). Coverage remains 92.69% statements / 87.31% branches. New tests cover Web A hashed/legacy counters, animated digits, duplicate rows, Web K counters, removed counters and the Tauri callback.

After the user stopped development, `npm.cmd run smoke` rebuilt the frontend/native debug executable and completed with exit 0. [Native Telegram evidence](evidence/windows-telegram-unread.json) verifies synthetic HTTPS Web A DOM counts 1 -> 4 -> 0 and Tauri callback counts 1 -> 0, including visible sidebar and native title updates. The full lifecycle/profile/security/UI/mock OIDC suite also passed. Actual Telegram account counts remain unverified. Attempted taskbar inspection using the Windows computer-use helper, but `list_windows` failed with "Computer Use native pipe is unavailable: failed to connect native pipe: The system cannot find the file specified. (os error 2)". Visual Windows taskbar overlay verification remains pending; successful native title updates do not prove taskbar rendering.

## Live drawer backdrop on Windows

The existing shell is transparent at the native layer and raised/lowered among Wry's child HWNDs by `drawer_layer.rs`. CSS becomes transparent only after native layout acknowledgement. Route views stay live and retain their generation; only unplaced routes are hidden. Opening focuses the trusted shell; closing returns focus to the active route. Command permissions and origins are unchanged. Linux/macOS retain the hide/show fallback rather than claiming untested compositing.

Executed successfully: lint, typecheck, coverage (111 frontend tests, 92.90% statements / 87.61% branches), CRAP 8 (same four analyzer warnings), 22 Rust tests, fmt/clippy, and Windows native build (executable/MSI/NSIS). `npm.cmd run smoke` passed all 30 checks. [Evidence](evidence/windows-live-drawer.json) includes actual composited screen pixels: blue website (40,160,240) becomes (32,129,197) beneath the backdrop; changing the live website to red (240,80,40) while the drawer stays open changes the sampled pixel to (192,65,37). This is not a CDP screenshot or frozen page image. The native view remains visible with the same generation. Native resize to 1000x700, click-outside dismissal, Settings/Escape, and restored website keyboard focus pass. The complete profile/lifecycle/security/OIDC/unread suite also passes. Pixel tests require the fixture window to remain unobscured; mixed-monitor DPI and Linux/macOS live compositing remain unverified.
