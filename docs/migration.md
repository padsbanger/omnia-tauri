# Migration and coexistence

The source is Omnia v0.11.0 at `4c76ff5bd8d574448ec2c99d890373a64059c287`, fetched from its default branch on 2026-10-19 into `../omnia-reference-tauri`. The commit matches the prompt's inspected HEAD. The reference checkout was not modified or pushed. Compatible React components, CSS, icons, domain utilities and tests were selectively reused with the original MIT license. Electron, Forge, Castlabs, preload code and old packaging configuration are absent from the target.

## Identity and data

The Tauri app uses `com.strielok.omnia.tauri`, product name `Omnia Tauri`, a separate autostart name and independent app data. Development and native fixture roots are separated from packaged app data. The source Electron identity `com.strielok.omnia` and its development storage are untouched. No source Git metadata, dependencies or build outputs were imported; the target remote remains `https://github.com/padsbanger/omnia-tauri.git`.

Website cookies/profiles cannot be copied from Electron's Chromium into WebView2 or WebKit. Users must sign into hosted services again. Route metadata is retrieved from the existing Omnia API after Omnia account login. There is no automatic import of Electron localStorage, plaintext tokens or browser profiles.

Rust owns credentials. Access tokens live only in process memory; refresh tokens and pending PKCE requests use the OS credential store. The credential namespace includes backend/client/discovery identity and development/release mode. Workspace and route stores are scoped to the authenticated OIDC subject plus the configured issuer/backend/client namespace; the API's `userId` is retained as an API contract field, not assumed to equal the OIDC subject. A different user cannot select the prior user's cached workspace. Explicit logout closes route views/popups, rotates the cached session epochs, queues the old stores for cleanup and removes active credentials. The same user must sign into hosted services again, matching the source logout intent; locked files may remain pending physical cleanup until restart.

Caches/settings are schema-versioned JSON written via temporary file, sync and atomic replacement. Profile paths derive from SHA-256 of owner and route IDs, never URLs/labels. Hibernation retains a profile. Clear-session advances a persisted epoch before creating a new store and journals the old epoch for cleanup. Delete closes resources, removes the workspace route and journals its hashed profile directory. Locked files remain pending for restart cleanup. On macOS, named-store physical deletion still needs native verification; see platform support.

## Callback and login

The callback remains exactly `omnia://auth/callback`. Default login uses an ephemeral native auth window with no shell capability and intercepts that exact callback in Rust. This avoids taking the installed Electron app's custom-protocol registration during development or installation of the default package.

`system_browser: true` is supported in runtime configuration for an installation that intentionally owns `omnia:`. For an explicit migration build, `npm run native:build -- --config src-tauri/tauri.protocol.conf.json` supplies Tauri's desktop protocol-association configuration. Do not install that optional build alongside Electron expecting both apps to receive the same callback: the OS selects one handler. The optional installed registration has not been tested locally. No `register_all` or registry cleanup runs at application startup.

Callbacks arrive through native command-line/single-instance handling on Windows/Linux and `RunEvent::Opened` on macOS. Raw callback URLs/codes are not emitted to frontend listeners. Pending state/verifier are time-bounded in the OS vault so a genuine cold-start callback can complete. Exact URI, state, duplicate parameters, expiry and single consumption are checked before exchange. Replay and cold callback were tested with a synthetic OIDC fixture by passing URI arguments directly; that does not verify an installed OS association.

## Intentional behavior changes

- Tokens and workspace caches moved out of renderer localStorage; corrupt/locked state is reported explicitly.
- Native webviews hide before a drawer appears in the trusted shell. The original drawer components/style remain; the Electron floating child drawer window does not.
- Hostname suffixes now require a label boundary. Unsafe executable/file/custom schemes are rejected.
- Memory reads show unavailable. No total-process number is mislabeled as per-route memory.
- Windows media/notification permission requests validate request and embedder origins. Linux/macOS permissions currently deny with a visible unavailable notice pending engine-specific adapters.
- No forced autoplay, Chromium WebAuthn-disabling flags or Castlabs DRM distribution. Provider compatibility is a separate verification requirement.
- Offline mutations are not queued. Create/rename/delete require the backend. Local reorder remains local when offline; partial online reorder failures are displayed and a reconnect reconciles server order.
- Autostart is disabled as a development capability and never applied merely by launching/testing the app. Installed users can select yes/no/minimized.
- A workspace limit of 64 routes bounds native resources and payload sizes.
- Closing the main workspace quits its owned windows on all platforms. The original Electron native menu and standalone splash are not ported; settings remain available through the sidebar and the shell keyboard shortcut.

## Safe adoption

1. Keep the Electron installation/data as a fallback while evaluating Tauri.
2. Run the Tauri app with its default separate identity and embedded Omnia sign-in.
3. Sign in to Omnia and each website; verify the provider checklist on every required engine.
4. Decide whether Tauri should own `omnia:` and autostart only when explicitly adopting it. Install a protocol-enabled build only for that decision.
5. Back up any wanted old data before removing Electron. This project performs no old-profile deletion, registry cleanup or automatic account migration.

No release was published, no Git push/deploy was performed, and no user login settings were changed by verification.
