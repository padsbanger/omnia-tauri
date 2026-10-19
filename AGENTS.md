You are working in a new, empty repository. Rebuild my application Omnia from Electron to Tauri 2. Implement the application, test it, and leave a runnable project. Do not stop after writing a migration plan or scaffolding a demo.

SOURCE OF TRUTH

Reference repository: https://github.com/padsbanger/omnia
At prompt preparation, the inspected HEAD was 4c76ff5bd8d574448ec2c99d890373a64059c287, version 0.11.0. Fetch the current default branch, record the exact commit you use, and reconcile any changes. The actual source takes precedence over this prompt's descriptive inventory.

Clone the reference into a separate temporary/sibling directory outside this target repository. Read it there and selectively port suitable code/assets. Preserve this repository's Git identity, remotes, and any existing files. Do not import the old .git, node_modules, build outputs, or Electron tooling. Keep MIT attribution for reused code.

First inspect applicable AGENTS.md instructions in the target and reference. Read README.md, DESIGN.md, CASE_STUDY.md, package.json, build/release workflows, and the implementation and tests. In particular inspect:
- src/main.ts, src/main/windows/index.ts
- src/main/ipc/registerIpcHandlers.ts and src/preload.ts
- src/main/authApi.ts, routeApi.ts, settings.ts, notifications.ts
- src/main/windows/unreadTracker.ts, appUnreadBadge.ts, routeFaviconDiscovery.ts
- src/common/routeMapping.ts, routes.ts, drawer.ts, settings.ts and URL/auth utilities
- src/renderer/components/, api/, store/, sessionVerification.ts and hooks.

If the source cannot be fetched, request a local checkout/archive instead of inventing its behavior. Never modify or push to the reference repository.

PRODUCT GOAL AND SCOPE

Omnia is a desktop workspace hosting third-party websites in isolated persistent browser sessions. It is not an API-based replacement for those websites.

Preserve the existing product, branding, visual style, interactions, and useful React code. This is a native-runtime migration, not a redesign. Reuse compatible frontend components, styles, domain logic, assets, and behavioral tests. Replace Electron-specific boundaries deliberately.

Default platform priority: Windows first, while retaining Linux and macOS support wherever feasible. Identify the host OS at startup and distinguish what you actually test locally from what only compiles in CI. Do not silently remove cross-platform features to simplify the implementation.

The inspected application includes:
- React 19, TypeScript, React Router, Zustand, HeroUI 3 and Tailwind CSS 4.
- A sidebar, route picker, route management/settings drawers, and single/spread/matrix workspace layouts.
- Presets for Gmail, Slack, Discord, Telegram, WhatsApp, Teams, Messenger, Spotify, TradingView, X, ChatGPT, Claude, and custom HTTP(S) websites.
- Route creation, renaming, ordering, deletion, activation, refresh, zoom, session clearing, and hibernation/restoration.
- Persistent per-route browser sessions, including independent accounts for duplicate services.
- Authentik OIDC Authorization Code + PKCE and the existing Omnia route API.
- Cached workspace startup during temporary backend failure, followed by bounded recovery/reconciliation.
- Best-effort unread counts from page titles/DOM/provider-specific signals; sidebar/title/OS badges.
- Custom-site favicon discovery, native notifications and audio-related behavior where implemented.
- Per-route approximate process-memory reporting.
- Start-at-login settings: yes/no/minimized.
- Castlabs Electron for DRM-dependent hosted media.

Audit the code for additional behaviors. Create docs/parity.md with source paths, observed behavior, Tauri replacement, platform support, status, and verification evidence. Use explicit statuses such as implemented-and-tested, implemented-unverified, blocked, or unsupported. Do not mark a feature done because its button renders.

PHASE 1: PROVE THE NATIVE ARCHITECTURE

Before porting the whole UI, implement and run a small real Tauri vertical slice with a trusted local shell and at least two independently controlled native child webviews in one window.

Consult current official Tauri 2/Wry documentation and the exact dependency APIs. Child multiwebview APIs may still require Tauri's unstable Cargo feature; verify and enable it explicitly if needed, pin compatible versions/lockfiles, and document the dependency. Do not invent Electron-like Tauri methods.

The spike must exercise:
1. Create, position, resize, focus, hide/show, close, and recreate route views.
2. Independent storage for two instances of the same origin; persistence after restart.
3. Hibernation that destroys a view while retaining its session; deletion/clear-session that targets only that route.
4. Single/spread/matrix geometry, DPI scaling, and usable management controls above/beside native content.
5. Navigation interception, popup handling, and a narrow page-to-native unread signal.
6. Denial of privileged commands when invoked from an untrusted route or its popup.

Use a deterministic local HTTP fixture for browser-state and popup tests, not real customer accounts. Confirm relevant behavior on the native runtime, not just mocked JavaScript. If GUI access or system dependencies prevent running it, report the exact limitation, retain a reproducible smoke test, and do not claim the spike passed.

A normal iframe cannot replace route webviews: third-party CSP/X-Frame-Options and browser-session behavior make that unsuitable. Do not globally disable web security or modify providers' framing headers.

Document feasibility in docs/platform-support.md. Investigate Windows WebView2, Linux WebKitGTK and macOS WKWebView differences, including per-route data stores, popups sharing the originating profile, media/camera/microphone, notifications, background execution, and DRM. Verify SDK and minimum-OS restrictions. Never fall back silently to a shared persistent profile.

The reference uses Castlabs Chromium: Tauri does not automatically reproduce its DRM capability. Treat Spotify playback and provider login compatibility as explicit test cases. Opening a page is not proof playback/login works. Do not promise parity or a memory reduction without evidence. Do not add bundled Chromium, Electron, or a Node sidecar to disguise a feasibility failure.

If a core requirement proves impossible, complete independent work, preserve the test evidence, explain the precise blocker and smallest viable alternatives, and ask only for the product decision that is actually necessary. For peripheral unsupported APIs, show a truthful unavailable state and record the gap.

PHASE 2: BUILD THE APPLICATION

Use Tauri 2 + Rust for native/backend behavior and React + TypeScript + Vite for the local frontend. Keep npm and compatible existing frontend libraries unless a concrete issue requires a change. Commit package-lock.json and Cargo.lock. Remove Electron/Forge/Castlabs dependencies, preload bridges and obsolete packaging configuration from the new application.

Organize the Rust implementation into focused services for route lifecycle/layout, profiles, authentication, API access, persistence, navigation/permissions, unread state, and platform integration. Keep frontend UI/state/domain logic separate from a small typed native bridge. Avoid a single giant Rust module or a generic invoke-anything API.

Native lifecycle and layout:
- Rust owns live webviews and their lifecycle. React owns presentation and expresses desired layout/actions through validated contracts.
- Use stable route IDs and safe internal labels/profile identifiers. Never derive filesystem paths directly from arbitrary URLs or labels.
- Keep hidden and hibernated states distinct. Switching routes must not recreate all webviews.
- Make lifecycle operations idempotent and serialize/reconcile competing operations per route.
- Ignore stale title, favicon, unread, and geometry updates from destroyed view generations.
- Implement bounds in a consistent coordinate system with explicit DPI conversion, resize coalescing, and validation.
- Solve native z-order deliberately. CSS z-index cannot place a React drawer above a separate native webview. Use verified geometry/visibility coordination or a properly scoped local child window, preserving the existing drawer experience.
- Clean up timers, listeners, popups and view resources on removal, logout and shutdown.
- Translate Electron zoom semantics to the new engine's scale correctly; preserve user-visible zoom behavior.

Sessions and persistence:
- Implement a platform-aware profile abstraction with stable per-route isolation and lifecycle.
- Destroying/hibernating a view preserves cookies and website state. Clearing a session removes only that route's data. Route deletion closes resources before profile cleanup.
- Handle locked profile directories, interrupted cleanup and restart recovery safely. Never recursively delete user-supplied paths.
- Keep UI/preferences/cache schemas versioned, validate loaded state, and use atomic persistence.
- Scope cached workspace/profile ownership to the signed-in user; prevent a different Omnia account from inheriting another account's workspace accidentally.
- Do not copy Electron Chromium profile directories into WebView2/WebKit or claim existing website logins transfer. Document re-login requirements.
- Do not alter the installed Electron application's data, protocol registration or autostart as a development side effect. Make coexistence and eventual migration explicit.

Authentication and API:
- Preserve the existing backend request/response contracts and route metadata. Do not build a replacement server or substitute mock data for production functionality.
- Port API access and OIDC to Rust, including discovery, PKCE S256, secure state generation/verification, exact callback validation, token refresh/rotation, timeouts, cancellation and bounded retries.
- Prefer the system browser for Omnia's OIDC login where compatible with the registered client and callback. Preserve the configured callback contract (currently omnia://auth/callback) unless an explicit documented backend/client configuration change is necessary.
- Handle callbacks for already-running and cold-started instances without accepting unsolicited, stale or replayed responses. Keep hosted-service login/popups distinct from Omnia account login.
- Keep raw access/refresh tokens out of Zustand, localStorage and frontend events. Rust owns tokens; use the OS credential store for persisted secrets and handle a missing/locked keyring explicitly rather than silently storing plaintext.
- Use single-flight refresh, avoid logging tokens/authorization codes, and avoid replaying non-idempotent requests blindly.
- Preserve backend-offline cache behavior without treating invalid authentication as an ordinary offline condition.
- Keep offline mutations consistent with observed behavior: no invented sync queue. Handle optimistic failures and partial server/local operations explicitly.
- Preserve configuration compatibility where practical. Support API base URL, client ID, redirect URI and configurable OIDC discovery. Document precedence and how packaged applications receive configuration; do not assume a development .env ships with the installer.

Security boundary:
- Only local trusted shell/drawer webviews receive necessary Tauri capabilities.
- Scope capabilities to the actual webview/origin, not a broad parent window that also hosts remote pages.
- Explicitly restrict custom Rust commands as well as plugin commands; do not assume plugin permissions alone protect application invoke handlers.
- Validate callers and payloads at the Rust boundary. Route actions must operate on known authorized route IDs.
- Untrusted hosted pages/popups must not receive filesystem, shell, process, auth, route-management or arbitrary HTTP capabilities.
- Retain source navigation rules using parsed URLs and boundary-safe hostname matching. Check redirects, new-window requests and external protocols. Reject javascript:, file: and unexpected custom schemes.
- Apply least-privilege per-origin permissions for media/notifications. Preserve required localhost support without allowing broad insecure origins.
- Never interpolate untrusted strings into executable JavaScript.
- Add an appropriate CSP for the local shell without pretending it controls third-party content.
- If injected unread/favicon code requires a return channel, expose only that narrow path. Derive route identity from the originating native view; validate shape, size, rate and view generation. Treat page-derived values as untrusted hints, never authorization.
- Do not globally broadcast secrets or privileged application state to hosted webviews.

Unread, icons and native features:
- Port source-priority arbitration, normalization, revisions, snapshots, stale-update rejection and cleanup.
- Preserve provider-specific unread logic where engines support it; document DOM heuristics as best effort.
- Preserve safe custom favicon handling and generic fallback.
- Implement supported OS badge/notification behavior and the source's audio behavior with truthful capability reporting.
- Chromium process-memory APIs have no guaranteed portable equivalent. Report measured values with their scope and units; otherwise show unavailable. Never label total application memory as per-route memory or fill the UI with fabricated numbers.
- Implement autostart yes/no/minimized using supported platform mechanisms. Do not change the developer's login settings just to run tests.

PHASE 3: VERIFY, PACKAGE, AND DOCUMENT

Port valuable existing behavioral tests and add focused coverage for migration risks:
- Hostname/scheme rules, redirects and popup policy.
- IPC/custom-command authorization and invalid payloads.
- Route identity/profile isolation, hibernate/restore/delete, and stale events.
- OAuth state/callback rejection, refresh races and failure handling.
- Cached startup, invalid sessions, offline recovery and partial route mutations.
- Unread precedence/revisions, favicon validation and layout geometry.
- UI route workflows and drawer synchronization.

Use Vitest/Testing Library for frontend/domain behavior and Rust tests for native logic. Use deterministic mock HTTP services for contract tests. Preserve the useful TypeScript CRAP threshold of 8 with coverage from the same test run if applicable; do not exclude normal code or write vacuous tests to satisfy it. Do not impose that TypeScript tool on Rust.

Provide reproducible scripts for dev, lint, typecheck, frontend tests/coverage, Rust checks/tests, frontend build, and native build. Run applicable checks, including cargo fmt --check and cargo clippy, and fix failures.

Perform a native smoke test where the environment permits: two same-origin profiles with different stored identities, restart persistence, all three layouts, drawer interaction, refresh/zoom, hibernation/restoration, targeted storage clearing, and untrusted command rejection. Browser-only React tests are not native end-to-end evidence.

Create a platform/provider smoke-test checklist covering Gmail/Google login, Discord, Telegram, Teams, custom sites, and Spotify DRM playback. Mark tests requiring accounts/hardware as unverified until actually exercised. Never request or fabricate account credentials.

Add CI for frontend/Rust checks and native build validation on Windows, Linux and macOS. Use appropriate Tauri bundles and required OS dependencies, not Electron makers. Keep signed releases/updater/signing credentials optional and document requirements. Do not publish a release, push, deploy or change account settings.

Deliver:
- A functional Tauri application with the retained Omnia frontend and real native route webviews.
- README.md with architecture, prerequisites, exact run/test/build commands, configuration and troubleshooting.
- docs/parity.md with honest per-feature evidence.
- docs/platform-support.md with engine/OS/provider limitations and feasibility findings.
- docs/migration.md covering old data, website re-login, application identity/callback/autostart coexistence and safe migration.
- A short AGENTS.md explaining the new architecture and verification workflow without overwriting existing instructions.

EXECUTION STYLE AND COMPLETION

Start with a short source-grounded plan, then implement in runnable increments. Make routine technical decisions autonomously. Keep documentation proportional to the work; the application is the deliverable.

Maintain a compact progress record with completed work, open blockers, commands run and next actions so work can resume after context limits. Continue through implementation and verification while feasible; do not end merely because one phase is complete.

Success means the new app uses Tauri/Rust, retains Omnia's real user flows and backend compatibility, isolates route sessions, and has evidence for its native behavior. A screenshot, attractive mockup, iframe demo or passing mocked test suite is not sufficient.

Finish by reporting:
1. What was implemented and any intentional behavior changes.
2. Exact commands to run and build it.
3. Checks actually executed and their outcomes.
4. Remaining platform/provider gaps with evidence and concrete next steps.
Never state full parity, successful authentication, cross-platform support, native test success or performance gains without verification.

## Implemented repository architecture and verification

Keep the migration requirements above. The local React shell and typed bridge are in `src/renderer`; Rust services in `src-tauri/src` own credentials, API requests, account-scoped profiles, native view lifecycle and permission boundaries. Never grant a route/popup the shell's capability. Tauri child views require the pinned `unstable` feature. Preserve reference attribution in LICENSE.

Read `docs/progress.md` before resuming. Run lint, typecheck, one coverage run followed by CRAP, Rust tests/fmt/clippy, frontend build and native build for relevant changes. `npm run smoke` verifies real Windows WebView2 using deterministic OIDC/API and website fixtures. Do not describe Linux/macOS/provider behavior as verified unless its checklist has evidence. Reference checkout remains outside this repository and must not be modified.
