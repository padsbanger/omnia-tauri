# Omnia Tauri

Omnia hosts third-party websites in independent persistent native webviews. This repository ports the React interface from [padsbanger/omnia](https://github.com/padsbanger/omnia/tree/4c76ff5bd8d574448ec2c99d890373a64059c287) v0.11.0 to Tauri 2 and Rust. It is not an API replacement for those websites.

Windows and Linux have separate native fixture evidence. Linux was exercised on Hyprland Wayland and its Xwayland server; macOS remains unverified. This is a runnable migration with explicit remaining provider/platform gaps, not a claim of full Electron/Castlabs parity. See [parity](docs/parity.md) and [platform support](docs/platform-support.md).

## Run

Install Node.js 24, Rust 1.98, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows select the MSVC Rust toolchain, install Visual Studio C++ Build Tools and WebView2 Evergreen. On Linux install WebKitGTK 4.1, GTK 3, OpenSSL/DBus development packages and build tools. macOS requires Xcode command-line tools; this app requires macOS 14 or newer for independent persistent data stores.

```powershell
npm.cmd ci
npm.cmd start
```

On shells without PowerShell's execution-policy restriction, use `npm` instead of `npm.cmd`. `npm run dev` starts only Vite; use `npm start` for the functional desktop application.

```powershell
npm.cmd run build
npm.cmd run native:build
```

Native outputs are under `src-tauri/target/release/`; Windows bundles are in `bundle/msi/` and `bundle/nsis/`. Builds do not install the app, register the `omnia:` protocol, change autostart, or publish anything. Unsigned packages require normal platform trust handling. Signing/notarization and updater infrastructure are optional and are not configured.

## Verify

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:coverage
npm.cmd run crap
npm.cmd run native:check
npm.cmd run native:test
npm.cmd run native:lint
npm.cmd run smoke
```

Run coverage before CRAP; CRAP reuses that coverage. Threshold is 8; normal application code is included. The current analyzer warns about a few ambiguous nested callback coverage mappings; the warnings are recorded in the verification evidence. `npm run smoke` builds an embedded-assets debug executable and drives actual Windows WebView2 instances with Playwright over CDP. No separate Chromium is launched. The Node fixture is test tooling, never an application sidecar. Ports 7890, 9222–9226 and 9323–9326 must be free. It uses a separate smoke profile root and synthetic credentials in a fixture-specific credential-store namespace. It logs out at the end, does not alter autostart or protocol registration, and writes `reports/native-smoke.json`.

## Architecture

- `src/renderer/`: retained HeroUI/Tailwind/React components, presentation-only Zustand stores, coordinated native layout and a typed `native.ts` bridge. No tokens or workspace ownership are persisted in the frontend.
- `src/common/`: retained domain models, route mappings, URL/favicon utilities and behavioral tests. MIT attribution is in `LICENSE`.
- `src-tauri/src/runtime.rs`: serialized route lifecycle, stable native labels, view generations and logical bounds. Hidden views remain alive; hibernation destroys a view.
- `profiles.rs`, `persistence.rs`, `workspace.rs`: account-scoped profile identifiers, versioned atomic JSON caches and cleanup recovery.
- `auth.rs`, `api.rs`, `config.rs`: OIDC/PKCE, native secret ownership, single-flight refresh, exact callbacks, unchanged `/routes` CRUD contract, runtime configuration.
- `security.rs`, `permissions.rs`, `unread.rs`, `platform.rs`: navigation, caller checks, Windows per-origin media/notification policy, unread arbitration, badges and autostart.

Tauri `2.12.4` explicitly enables its `unstable` multiwebview feature; `tauri-build 2.7.3`, Wry `0.57.0` and the resolved graph are locked. Child views are genuine native webviews, not iframes. The trusted shell alone receives management permissions, and every custom management command additionally validates its native caller label and local origin. Remote route capabilities expose only bounded unread/favicon hints whose identity is derived from the native view. Popups receive no management permissions. Authentication responses are processed in Rust, not globally broadcast as URL events.

On Windows, drawers render in the transparent trusted shell, raised above the native route views. Websites remain visible and live beneath the translucent backdrop; closing the drawer restores website focus without recreating views. Linux/macOS retain the hide/show drawer path pending native compositing verification. All non-hibernated routes are retained, including background routes. Memory displays are omitted; no performance advantage is asserted.

Drag a service in the sidebar, or its grip in Manage routes, to reorder it. The blue line marks insertion before/after a route. Alt+Up/Down also moves a focused route or grip. Order is saved locally and to the backend when online; offline changes stay local without a queued server sync.

## Configuration

Runtime environment overrides `config.json` in the app data root, which overrides hosted defaults. `.env` is not automatically read or shipped. Use an explicit launch environment for development or place the JSON file beside the application's caches for packaged deployments.

| Environment | JSON field | Default |
| --- | --- | --- |
| `OMNIA_API_BASE_URL` | `api_base_url` | `https://omnia.pripyat.cloud` |
| `AUTHENTIK_CLIENT_ID` | `client_id` | Source's public Omnia client ID |
| `AUTHENTIK_REDIRECT_URI` | `redirect_uri` | `omnia://auth/callback` |
| `AUTHENTIK_DISCOVERY_URL` | `discovery_url` | `https://auth.pripyat.cloud/application/o/omnia/.well-known/openid-configuration` |
| — | `system_browser` | `false` |

Example `config.json`:

```json
{
  "api_base_url": "https://omnia.pripyat.cloud",
  "discovery_url": "https://auth.pripyat.cloud/application/o/omnia/.well-known/openid-configuration",
  "redirect_uri": "omnia://auth/callback",
  "system_browser": false
}
```

Endpoints require HTTPS except loopback fixtures. The exact source callback is retained. Default login uses an isolated ephemeral native window so development can coexist with Electron's protocol handler. System-browser mode requires the installed Tauri app to be explicitly registered for `omnia:`; see [migration](docs/migration.md). Raw access tokens remain in Rust memory; refresh tokens and pending PKCE state are in the OS credential store. A missing/locked credential store is an explicit error, never a plaintext fallback. Credentials are scoped to build mode and configured backend/client/discovery URLs.

App identity is `com.strielok.omnia.tauri`. On Windows the data root is `%LOCALAPPDATA%/com.strielok.omnia.tauri`; development appends `/development`, and smoke tests append `/development/smoke`. Other platforms use Tauri's app-local-data directory. Changing Omnia accounts or configured identity/backend namespaces selects a different cache/profile namespace. Electron website sessions cannot transfer; sign in to each hosted service again.

## Troubleshooting

- Hosted-site browser handoffs can be diagnosed with `diagnostics/navigation.jsonl` under the app data root. Development builds enable this bounded local trace by default; set `OMNIA_NAVIGATION_TRACE=0` to disable it, or `OMNIA_NAVIGATION_TRACE=1` to enable it in a packaged build. It records native view identifiers, destination hosts, a few known Google login paths and navigation/popup decisions. Query strings, fragments, credentials and other paths are omitted. No trace is uploaded. On Windows development the file is `%LOCALAPPDATA%/com.strielok.omnia.tauri/development/diagnostics/navigation.jsonl`.
- Gmail opening an external browser during sign-in: native traces identified missing YouTube and regional Google account hosts (`accounts.google.pl` in the reported flow). This build keeps verified Google account steps inside Google-enabled routes using a pinned list in `src/common/google_account_hosts.json`, derived from Google's official supported-domains list. Regional exceptions require exact hosts, HTTPS, port 443 and no embedded credentials; arbitrary `google.*` matches are not accepted. Actual Google account login still requires a user retry. Restart the app to reload the policy; clearing your route's session is unnecessary.
- A bare browser cannot invoke native operations. Launch via `npm start`.
- If PowerShell rejects `npm.ps1`, use `npm.cmd`; no execution-policy change is needed.
- A locked credential store prevents sign-in or session restoration. Unlock the platform store (Windows Credential Manager, macOS Keychain, Linux Secret Service) and retry.
- A temporary route API outage retains the last authenticated owner's cached workspace. The UI retries up to eight times at 15-second intervals, plus a network-online or manual retry. Invalid authentication clears the active session instead.
- Server mutations are not queued offline. A partially completed reorder is reported and reconciled on reconnect.
- Locked profile cleanup stays in an internal journal and is retried on restart. Never manually copy Electron profile directories into this app.
- Real provider login, media hardware, Spotify playback and cross-platform native smoke tests require the [provider checklist](docs/platform-support.md). Opening a provider page does not verify those features.

## Linux development and verification

Use the existing project, with Node 24+ and Rust 1.98+. The Linux work was run on Omarchy/Arch with Node 26.8.1, Rust 1.98.1, GTK 3.24.52 and WebKitGTK 2.52.6. The native smoke helper requires WebKitGTK ≥2.40. On Arch, the corresponding build packages are `webkit2gtk-4.1 gtk3 base-devel openssl dbus librsvg libxdo patchelf`; install distro prerequisites from the [official guide](https://v2.tauri.app/start/prerequisites/) as needed. Debian/Ubuntu prerequisites are in `.github/workflows/verify.yml`.

```sh
npm ci
npm start
npm run lint
npm run typecheck
npm run test:coverage
npm run crap
npm run native:check
npm run native:test
npm run native:lint
npm run smoke:linux
npm run native:build
```

On this host, the strict default-renderer smoke run completes its 22 functional checks but fails during WebKit/NVIDIA subprocess shutdown. Treat clean shutdown as an open platform issue; details and reproducible evidence are in [verification](docs/verification.md). The explicit rendering workaround below passed the same native suite including clean exits:

```sh
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm start
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run smoke:linux
```

This bypasses WebKit's faster DMABUF rendering path; the application does not enable it automatically. It is a tested option on this host, not a universal fix or a performance claim.

Close any other Omnia Tauri process before smoke testing. `smoke:linux` builds an embedded-assets debug executable and drives the actual native WebKitGTK shell/child views on the available display. It requires a session D-Bus, an unlocked Secret Service and free fixture port 7890. It creates private temporary XDG data/config/cache storage and a fixture-specific keyring namespace, removes fixture credentials on logout, and writes `reports/native-linux.json`. It never changes your real autostart or protocol registration. The Windows command remains `npm run smoke`.

To select the existing X11 server explicitly, run `GDK_BACKEND=x11 npm run smoke:linux`; under Hyprland that is Xwayland, not a standalone Xorg session. Keep the actual backend and monitor scales with evidence. The CI smoke job uses Xvfb and a disposable D-Bus/keyring session; CI configuration is not local evidence.

Linux routes are native WebKitGTK views placed by `geometry_linux.rs`; drawers hide route widgets while the trusted shell handles management. Clearing a session immediately rotates its profile; physical removal waits for next-startup recovery because this Tauri version retains Linux WebContexts. See [platform findings](docs/platform-support.md) and [verification](docs/verification.md) for tested scope, artifact results and remaining limitations.


Linux artifacts are `src-tauri/target/release/omnia-tauri` and DEB/RPM/AppImage files in `src-tauri/target/release/bundle/`. All three bundles were produced locally; none was installed or verified as an installed application. The host lacks a system `patchelf`; this run used an isolated extracted copy via `PATH=/tmp/omnia-build-tools/usr/bin:$PATH npm run native:build`. For a persistent build environment, provide `patchelf` on PATH. [Artifact hashes and launch scope](docs/evidence/linux-artifacts.json).
