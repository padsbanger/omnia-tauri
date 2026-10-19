# Platform feasibility and provider verification

Evidence date: 2026-10-19. Local host: Windows 11 build 26200, x64, WebView2 Evergreen 155.0.4283.62, current monitor scale 1.0. Tauri 2.12.4 / tauri-build 2.7.3 / tauri-runtime-wry 2.12.2 / Wry 0.57.0; exact resolved versions are in Cargo.lock. Node 24.15 and Rust 1.98 were used. No memory or performance advantage has been measured.

## Native architecture findings

The phase-1 test was performed before the UI port. It created a trusted local shell and two independently controlled native child webviews in one window, with a fixture sending `X-Frame-Options: DENY`. Both used the same origin but separate storage directories. LocalStorage/cookies, popup profile inheritance, lifecycle, restart persistence, targeted clear and command rejection were verified against WebView2. The expanded test additionally exercises the retained UI and Rust OIDC/API services. See [initial evidence](evidence/phase1-windows.json) and [final native evidence](evidence/native-windows.json).

The [Tauri WebviewBuilder API](https://docs.rs/tauri/2.12.4/tauri/webview/struct.WebviewBuilder.html) and downloaded sources were inspected. `Window::add_child` needs `unstable`, explicitly enabled here. Creation happens from async commands, avoiding the documented Windows synchronous-command creation deadlock. `window_features` carries the opener environment/configuration/related view into a popup. Rust owns view labels, generations, profile paths and lifecycle; the shell submits validated logical rectangles. Native measurements confirmed conversion at the local monitor's scale 1.0. Mixed-DPI monitors remain unverified.

Drawers are shown after hiding hosted webviews; native controller visibility was checked. This differs from Electron's floating drawer window but retains its React UI and avoids CSS/native z-order assumptions. Switching tabs hides existing views; hibernation destroys them. The app creates all non-hibernated routes, so previously visited and background routes remain alive. Engines may still throttle background execution.

## Engine matrix

| Area | Windows / WebView2 | Linux / WebKitGTK | macOS / WKWebView |
| --- | --- | --- | --- |
| Build/runtime evidence | Native debug fixture and release MSI/NSIS built locally | CI job supplied; not run here | CI job supplied; not run here |
| Baseline | Windows 10/11 with current Evergreen runtime; only Windows 11 tested | WebKitGTK 4.1 / GTK 3; CI Ubuntu 24.04 | macOS 14+; bundle minimum and runtime guard |
| Route stores | Separate internally hashed data directories; verified independent cookies/localStorage across restart | Separate Wry WebContexts keyed by data directories; implemented-unverified | Stable 16-byte `data_store_identifier`, account/route/epoch-derived; implemented-unverified |
| Older engines | No shared-profile fallback; creation/clear errors surface | No shared-profile fallback | Below 14 rejected because named persistent stores are unavailable |
| Popups | Opener environment and route data directory; blank-login popup, sessionStorage and completion postMessage fixture verified | `window_features` supplies related view; unverified | `window_features` supplies WKWebView configuration; unverified |
| Clear/delete | Close resources, rotate session epoch, atomic persistence and cleanup journals; targeted clear verified | Implemented-unverified | WebKit data clear is asynchronous; physical removal of old named stores remains unverified and may require a native store-removal adapter |
| Camera/microphone | WebView2 COM permission callback validates requester **and** top-level origin against the route/Gmail media origins; hardware unverified | Denied: portable Tauri callback omits requesting origin; native WebKitGTK adapter still needed | Denied: portable callback omits requesting origin; WKUIDelegate adapter and usage descriptions still needed |
| Website notifications | Same per-origin policy; actual OS delivery/click behavior unverified | Denied pending origin-aware native adapter | Unavailable in current Wry notification permission backend |
| OS unread badge | Native taskbar overlay bitmap implemented; runtime setter exercised, visual taskbar rendering unverified | Badge API depends on desktop launcher; unverified | Dock badge API; unverified |
| Per-route process memory | Unavailable; no equivalent fabricated | Unavailable | Unavailable |
| Autostart | yes/no/minimized implemented with separate Omnia Tauri entry; intentionally not enabled during tests | Plugin path supplied; unverified | Plugin path supplied; unverified |
| Audio/background | Normal engine playback; hidden views retained; no forced autoplay or Chromium process flags | Engine-dependent | Engine-dependent |
| DRM / Spotify | Capability probe recorded separately; playback and provider compatibility unverified | Codec/CDM availability is distro-dependent; unverified | WKWebView/FairPlay is not Castlabs Widevine parity; unverified |

Windows requirements follow [Microsoft's WebView2 supported platforms](https://learn.microsoft.com/en-us/microsoft-edge/webview2/) and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). This project does not promise compatibility with every historical Tauri-supported OS. WebView2's asynchronous `ClearBrowsingDataAll` is called through `ICoreWebView2Profile2`; unsupported runtimes return an error. Use Evergreen rather than relying on an obsolete minimum runtime.

Wry's named WebKit store support requires macOS 14/iOS 17; see the pinned [data_store_identifier API](https://docs.rs/tauri/2.12.4/tauri/webview/struct.WebviewBuilder.html#method.data_store_identifier). Linux clears a whole WebContext, which is why separate per-route directories are mandatory. Tauri's [clear_all_browsing_data contract](https://docs.rs/tauri/2.12.4/tauri/webview/struct.Webview.html#method.clear_all_browsing_data) explicitly says deletion is asynchronous. Epoch rotation ensures a cleared route cannot reopen the old store while physical cleanup is pending.

The portable permission callback only supplies a webview and permission kind, not requesting/embedding origins. Windows has a dedicated COM adapter; Linux/macOS deny rather than grant media to arbitrary child frames. Native origin-aware adapters are the concrete next implementation step. These are explicit gaps, not a claim that those engines can never support the feature.

## DRM

Castlabs Electron is not included. No bundled Chromium, Node sidecar or header/security bypass is used. Microsoft's [Widevine feature request](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4828) remains open at inspection; that alone does not establish every provider's playback outcome. `scripts/native-smoke.mjs` probes EME key-system negotiation on the installed WebView2 and records results in the evidence JSON. On this host, both `com.widevine.alpha` and `com.microsoft.playready.recommendation` accepted the tested AAC/H.264 configuration. Successful negotiation is not a license exchange or playback test. Spotify must be tested with a consenting user's existing account after the migration; no credentials were requested or fabricated.

If required playback cannot work on the target engine, the smallest alternatives are opening that service in the system browser or retaining the Electron app for that service. Neither fallback is silently enabled. A product decision is needed only after the required provider test establishes the actual failure.

## Manual native/provider checklist

Every unchecked case is **implemented-unverified** unless the engine matrix marks it unsupported. Use ordinary test accounts you control; never put credentials in repository files or test reports.

- [x] Windows deterministic fixture: two same-origin identities, native visibility and geometry, refresh/zoom, close/recreate, restart persistence, targeted clearing, popup profile inheritance, navigation rejection and privileged-command denial.
- [x] Windows mock OIDC/API: PKCE, native credential store, route CRUD, offline cache/recovery, invalid-session rejection, cold callback and replay rejection. This does **not** verify production Authentik login.
- [ ] Move between monitors at 100%, 125%, 150% and 200%; resize while opening/closing all drawers. Check focus and background route persistence.
- [ ] Linux X11 and Wayland: repeat the same-origin/native checklist; confirm no shared data store, popup opener behavior and keyring errors.
- [ ] macOS 14+: repeat the native checklist, verify persistent named stores, targeted clear and physical data removal; reject pre-14 startup.
- [ ] Production Omnia Authentik: sign in, cancel, restart, refresh rotation, logout, temporary outage, revoked refresh token, two Omnia users and route ownership.
- [ ] Gmail/Google: traces identified missing `accounts.youtube.com`, followed by `accounts.google.pl`. Regional account support uses exact HTTPS hosts from a pinned [official Google domain list](https://www.google.com/supported_domains), scoped to Google-enabled routes. Unit checks pass for the entire account list; the extended Polish/UK/German native fixture passed with no external handoff and with duplicate-profile isolation ([evidence](evidence/windows-gmail-regional-after.json)). Actual login including MFA, duplicate-account isolation, unread title/DOM, mail links and Meet permissions remain unverified.
- [ ] Discord: full login, duplicate accounts, voice/video consent and notification delivery.
- [ ] Telegram: QR/login, app-badge interception, duplicate sessions, unread reconciliation after hibernation.
- [ ] Teams: Microsoft redirects/login, calls, microphone/camera, cross-origin permission rejection and popups.
- [ ] Custom HTTP(S): safe favicon/fallback, redirects, mailto/tel, localhost, malicious scheme rejection and popup policy.
- [ ] Spotify: login, full protected-track playback, seek, pause/resume, next track and background audio. A homepage or a short preview is not sufficient.
- [ ] Other presets: Slack, WhatsApp, Messenger, TradingView, X, ChatGPT and Claude login/navigation.
- [ ] OS notification click/activation, OS taskbar/dock badge rendering and autostart yes/no/minimized in an installed test environment.
- [ ] Signed/notarized installers, installed system-browser protocol association and updater design, if distribution requires them.
