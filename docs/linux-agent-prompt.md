# Omnia Tauri: Linux implementation and native verification

You are working in the existing `omnia-tauri` repository on a Linux machine. Continue the migration, fix Linux issues, implement feasible Linux integrations, test the actual native application, and leave a runnable project. Do not stop after a plan or a compilation report.

## Read first and preserve the existing work

Read all applicable `AGENTS.md` instructions, then:

- `README.md`
- `docs/progress.md`
- `docs/parity.md`
- `docs/platform-support.md`
- `docs/migration.md`
- `docs/verification.md`
- `.github/workflows/verify.yml`

The root instructions describe an initially empty repository, but that migration has already been implemented. Do not scaffold over it or restart the project. Preserve existing files, Git identity/remotes, MIT attribution, branding, retained React components, backend contracts, and Windows/macOS code.

The implementation baseline is local commit `f3fc07d` (`Port Omnia workspace to Tauri 2 with isolated native sessions`). It was **not pushed** during the Windows work. Confirm that this checkout contains that implementation or a descendant before proceeding. A fresh clone of the remote may not contain it. If the implementation is missing, request transfer of the checkout/commit instead of inventing or rebuilding it from this prompt.

Electron reference: <https://github.com/padsbanger/omnia>, inspected default-branch commit `4c76ff5bd8d574448ec2c99d890373a64059c287`, v0.11.0. Any reference checkout must be outside this repository and remain read-only. Fetch/compare the current default branch as required by AGENTS.md, record the exact commit, and distinguish newer upstream changes from Linux migration fixes. Do not silently change the product baseline.

## Current implementation and evidence

- Tauri `2.12.4` with explicit `unstable` multiwebview support, tauri-build `2.7.3`, Wry `0.57.0`; exact dependencies are locked in `src-tauri/Cargo.lock`.
- React 19, TypeScript, Vite, HeroUI 3, Tailwind 4 and Zustand. Use npm and preserve `package-lock.json`.
- Rust owns real native child webviews, route lifecycle, profiles, authentication, API access, persistence, unread state and platform integration. React owns presentation and submits validated layout/actions through `src/renderer/native.ts`.
- Only the trusted local `shell` view receives management capabilities. Hosted routes receive only narrow unread/favicon hint permissions. Rust also checks custom-command callers. Keep these boundaries intact.
- Windows verified: 82 frontend tests, 17 Rust tests, lint/typecheck/CRAP threshold 8, fmt/clippy, real WebView2 native smoke tests, MSI/NSIS builds. See the saved Windows evidence; these numbers are a baseline, not a substitute for running the Linux checks.
- **No Linux build or native runtime was verified during that work.** The Linux CI job is configuration, not evidence of success. macOS is also unverified.
- Linux profile isolation is implemented through separate Wry data directories/contexts but unverified. Popup inheritance, cleanup, badges, notifications, audio and autostart need Linux-specific evidence.
- Linux camera/microphone/notification permission requests currently default to denial. `src-tauri/src/permissions.rs` implements an origin-aware Windows adapter only. The UI truthfully reports the Linux limitation.
- Per-route process memory remains unavailable. Real provider login, production Authentik and Spotify protected playback remain unverified. Windows EME negotiation results do not establish Linux DRM support or provider playback.

## 1. Establish the Linux environment and build

Record the repository HEAD and working-tree state, distro/version, architecture, kernel, desktop/compositor, X11 versus Wayland, monitor scale, Node/npm/Rust versions, and installed GTK/WebKitGTK versions. Determine whether a usable graphical session and a session D-Bus/Secret Service are available. Do not overwrite unrelated user changes.

The existing baseline uses Node 24 and Rust 1.98. Verify the exact dependency requirements against current official Tauri/Wry/WebKitGTK documentation and downloaded crate APIs. Do not invent native methods or unnecessarily upgrade dependencies. If a version change is necessary, explain it, update lockfiles and assess Windows/macOS impact.

For Ubuntu/Debian, the current CI prerequisite list is:

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf libssl-dev libdbus-1-dev libxdo-dev \
  build-essential pkg-config
```

Check the distro and installed packages first; adapt this list when necessary. Use the existing unlocked desktop Secret Service where available. A missing/locked keyring must produce an explicit error, never plaintext storage or a silent in-memory substitute presented as persistence. Do not change the user's login/keyring configuration just to make tests pass.

Run and fix applicable checks:

```sh
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run crap
npm run build
npm run native:check
npm run native:test
npm run native:lint
npm start
```

CRAP must consume coverage from that test run at threshold 8. Do not exclude normal application code, add vacuous tests, or impose the TypeScript metric on Rust. Existing analyzer warnings about ambiguous callback mappings are documented; report their actual status rather than claiming complete mapping coverage.

## 2. Build and run a genuine Linux native smoke test

Inspect `scripts/native-smoke.mjs` and `scripts/mock-backend.mjs`. The existing driver explicitly requires Windows, launches an `.exe`, and connects to WebView2 CDP ports. **Do not simply remove its OS guard or claim that Playwright's bundled WebKit browser verifies Tauri's WebKitGTK runtime.**

Reuse/extract the deterministic HTTP and mock OIDC/API fixtures. Add a reproducible Linux native driver and an explicit npm script, such as `smoke:linux`. Verify what the installed Tauri/WebKitGTK automation stack can actually control, including child webviews. Use supported native automation or narrowly scoped test instrumentation in the real Tauri process. Any test hooks must require a debug build plus an explicit smoke flag, use isolated test storage, and remain unavailable to production or untrusted pages. Do not ship a test server or Node sidecar with the app.

Keep the Windows driver functional. Factor shared fixtures when useful; do not replace its existing evidence with Linux results.

Exercise and record actual results for:

1. A trusted local shell plus two native child webviews in one window. Use two instances of the **same HTTP origin** serving `X-Frame-Options: DENY` to rule out an iframe substitute.
2. Independent cookies and localStorage identities, retained after full application restart. Confirm actual WebKit contexts/data managers and persistence directories are isolated; never silently fall back to one shared profile.
3. Create, position, resize, focus, hide/show, close and recreate. Switching tabs must retain existing views; hibernation must destroy a view while retaining its session.
4. Single/spread/matrix layouts, drawer interaction, native z-order, refresh and source-equivalent zoom. Measure native bounds/visibility when possible. Test the available display scale; do not claim other scales or Wayland/X11 sessions were tested unless they were.
5. Targeted clear of route A without affecting B; route deletion; cleanup of popups and resources; restart recovery for pending profile cleanup. Verify asynchronous WebKit clearing cannot reopen the old session.
6. Popup inheritance of the opener's profile, permitted navigation, rejected redirects/unsafe schemes, and privileged-command rejection from both route and popup. Include invalid payloads and the allowed narrow unread/favicon path on a non-default localhost port.
7. Stale view-generation events, unread source priority/revisions, safe custom favicon discovery/fallback, and cleanup after hibernation/removal.
8. Mock native OIDC PKCE, exact callback/state validation, cancellation, OS credential persistence, cold-start refresh, replay rejection, and single-instance callbacks. Passing a URI as an argument does not prove installed OS protocol registration.
9. Existing route API CRUD/metadata contracts, account/backend-scoped cache, temporary outage/reconciliation, invalid-session rejection, and partial mutation errors. Do not introduce an offline mutation queue.
10. Logout and shutdown without orphan windows or views, with website-session reset behavior preserved and raw tokens absent from frontend storage/events.

Use only synthetic fixture identities/credentials. Do not request customer credentials. Do not modify real workspace data, the installed Electron app, its profiles, protocol registration or autostart.

If no desktop/display/automation access is available, complete compilation, logic tests, instrumentation and packaging that remain feasible. Provide exact reproduction commands and identify the specific missing prerequisite. Xvfb evidence, if used, must be labeled as such and must not be presented as Wayland, hardware-media or real-desktop integration evidence. Do not disable the WebKit sandbox or web security to manufacture a pass.

## 3. Implement and verify Linux integrations where feasible

Inspect `src-tauri/src/{runtime,profiles,permissions,platform,auth,workspace,security}.rs` and the exact pinned native APIs.

- Investigate an origin-aware WebKitGTK camera/microphone/notification permission adapter. Verify whether the API exposes the requesting origin and enough embedding context to enforce the policy. The top-level URL alone must not authorize arbitrary embedded frames. Keep least privilege and required localhost support. If the engine cannot expose the needed context, retain denial, document the precise API limitation and smallest viable next step; do not grant globally.
- Verify Secret Service persistence and failure handling. Keep raw credentials in Rust and the OS store. Ownership includes issuer/backend/client namespace as well as OIDC subject; do not regress to subject-only isolation.
- Verify audio/background behavior, native notification delivery/click handling and desktop badge support where the environment permits. Separate implemented policy from hardware or OS-delivery evidence.
- Verify autostart yes/no/minimized through isolated configuration or a dedicated disposable test environment. Do not enable login startup on the user's real desktop merely to test it.
- Investigate installed codec/EME capabilities and record actual results. A capability probe or loaded Spotify homepage is not a protected playback test. Do not bundle Chromium, Electron, Castlabs or a Node runtime as a workaround.
- Keep truthful unavailable states where no portable per-route process-memory measurement exists. Do not relabel application-wide memory or claim performance improvements without measurements.

Preserve Windows/macOS paths through platform-specific modules and conditional dependencies. Add focused regression tests for issues found. Do not redesign the UI or remove existing behavior to simplify Linux support.

## 4. Package, record evidence and finish

Run:

```sh
npm run native:build
```

Fix feasible Linux bundle failures and record exactly which artifacts were produced. Distinguish bundle creation from successful launch/installation, and note runtime dependencies or AppImage/FUSE restrictions actually encountered. Do not publish, push, deploy, install globally, register protocols, or alter login settings without separate explicit authorization.

Update Linux CI dependencies/checks when supported by findings. A job you only edited is not a job you ran. Preserve the other platform jobs.

Deliver:

- Working Linux implementation and reproducible native smoke command, preserving the existing Windows driver.
- `docs/evidence/native-linux.json` or equivalent structured evidence with date, exact source commit, distro/architecture, engine versions, display backend/scale, verification method, and individual pass/fail/unverified results. Include expected versus observed behavior for failures; redact secrets and authorization URLs/codes.
- Updated `docs/parity.md`, `docs/platform-support.md`, `docs/verification.md`, `README.md` and a compact `docs/progress.md` with commands run, outcomes, blockers and next actions. Retain historical Windows evidence and keep platform claims separate.
- Current lockfiles and appropriate tests. Commit your task changes locally if repository instructions permit, without including unrelated user edits; never push automatically.

Continue through implementation and verification while useful independent work is feasible. Ask only for a genuine product decision or missing prerequisite that prevents further work. Finish by reporting what changed, exact run/test/build commands, checks actually executed, artifact paths, and precise remaining gaps with concrete next steps. Do not claim full parity, successful real-provider authentication, cross-platform native success or performance gains without evidence.
