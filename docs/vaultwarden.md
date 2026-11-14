# Vaultwarden autofill

Open **Settings → Vaultwarden** to configure the native vault connection.
Enter its HTTPS base URL in **Vaultwarden server URL** and click **Save server**.
There is no default server. The URL is saved only in local, versioned app settings
scoped to your Omnia account, not the repository or Omnia backend. A subpath such
as `https://vault.example.com/bitwarden` is supported. Credentials, queries and
fragments in the URL are rejected; redirects remain disabled. Saving locks the
vault and cancels pending selections/unlock results. Save an empty URL to disconnect.
In Settings enter your vault email/master password and (if enabled) authenticator
code, then click **Unlock vault**. A vault icon appears in the sidebar while
unlocked, highlighted/enabled when the active route has matching saved logins and
disabled otherwise. Click it to load the login picker automatically, then choose
an entry. Server, unlock and lock controls remain only in Settings. Native
availability checks run every two seconds and on local vault changes; they read
the current view URL without creating/replacing selection tickets. Route switches
disable stale results immediately. Check the displayed destination
origin. Close the drawer and submit the website's form yourself. For two-step
logins, advance to the password step and find/fill again.

This is a read-only personal-vault client, not a replacement vault editor or a
browser extension. It does not send vault credentials to the Omnia backend.
No real account was used during development. Native verification uses synthetic
credentials and a local test server, not the user's vault.

## Supported subset

- Password grant with optional authenticator/TOTP second factor; current
  `/identity/accounts/prelogin/password`, with a 404-only fallback to
  `/identity/accounts/prelogin` for older deployments. No automatic password
  retries, redirects, account changes, device trust, or remembered 2FA.
- PBKDF2-SHA256 and Argon2id account KDFs; bounded parameters (PBKDF2
  5,000–2,000,000 iterations; Argon2id 16–256 MiB, 2–10 iterations, 1–16 lanes).
  Values outside these limits fail explicitly; the server is never changed.
- Authenticated Bitwarden type-2 AES-256-CBC/HMAC-SHA256 encrypted strings,
  HKDF expansion of master keys, user keys and individual item keys. MACs are
  checked before decrypting. Legacy unauthenticated encrypted strings are refused.
- Personal, non-deleted login items without master-password reprompt. Shared
  organization entries, protected entries and non-login items are counted as
  omitted. Unsupported/unreadable items cannot be selected.
- HTTPS top-level route views. Exact origin (scheme, host, port), with saved
  starts-with and exact URI rules additionally enforced. Default/domain/host
  matching is deliberately tightened to exact origin; regex and Never are not
  matched. No suffix-domain matches or insecure HTTP filling.
- Visible ordinary HTML username/password fields, native input/change events,
  username-only first steps. Multiple passwords, new-password fields, cross-origin
  form actions, hidden/disabled/read-only fields are rejected or excluded.

Not yet supported: organization keys, SSO, email/new-device challenges,
security-key/Duo 2FA, passkeys, TOTP generation for hosted websites, autofill into
service popup windows, frames or shadow DOM, save/update prompts, auto-submit,
offline vault unlock, persistent unlock, OS biometric unlock and global shortcuts.
Keep using your existing vault client for these. Website-specific form behavior
still needs manual testing; generic input handling does not prove provider login.

## Secret lifetime and authorization

`src-tauri/src/vault/{client,crypto,mod}.rs` own transport, crypto and sessions.
`fill.js` is a fixed form-filling function. Only the trusted shell has the seven
vault command permissions; each command also checks the actual caller webview
and local origin. Route views and service popups have no vault capability.

The master password/code are transient, uncontrolled trusted input fields. They
pass through Tauri IPC to Rust, never Zustand, localStorage, React state, events,
logs or the Omnia API. Vault entry names/usernames are intentionally returned to
the trusted selection drawer; entry passwords, vault tokens and keys are not.
The selected password necessarily enters the destination page's DOM when filled.
Website scripts can read credentials filled into their own page, as with manual
typing. JSON serialization separates payload data from executable script.

Rust keeps only the encrypted sync snapshot and a zeroizing user key for up to
five minutes. Access tokens are discarded after sync; refresh tokens are not
retained or used. Lock/restart/logout discard the snapshot/key. A one-second
expiry task discards expired sessions even if no command is called; every use
checks the deadline and Omnia owner. The drawer polls status every ten seconds.
Lock cancels the outcome of a pending unlock; network/KDF work remains bounded
and cannot publish its result afterward. No secrets are persisted, so an OS
credential-store entry is not needed for this integration. A non-secret stable
device identifier and the server URL are saved atomically under the account-scoped app data root.
Secret buffers owned by the client use zeroization, but this is not a guarantee
that all IPC, browser, allocator or cryptographic-library temporary copies vanish.

Selections are one-use, expire in 60 seconds, and bind to the Omnia owner, live
native view label/generation and complete URL. Fill rechecks the vault item URI,
native URL and current page URL before assigning fields. A page's fill result is
only a UI hint and never authorizes anything. There is no remote credential-return
command or general HTTP capability.

## Verification

On Windows, with normal Omnia closed:

```powershell
npm.cmd run build
cargo build --manifest-path src-tauri/Cargo.toml --features custom-protocol --locked
node scripts/native-smoke.mjs --vault-only
```

The debug-only existing `OMNIA_SMOKE` mode redirects vault HTTP to the isolated
fixture on `127.0.0.1:7890/vault`. Release builds use the configured HTTPS server.
The fixture builds encrypted responses with Node's independent crypto primitives;
Node is test tooling only and is not shipped or launched by Omnia.

Evidence: [initial Windows native run](evidence/windows-vaultwarden.json) and
[configurable-server native run](evidence/windows-vaultwarden-config.json). The
latter also verifies empty/default handling, URL validation, the server field,
server-change locking and cancellation of an in-flight unlock. Rust tests verify
local setting persistence, account isolation and subpath normalization. They exercise
prelogin/password hashing, TOTP challenge, sync, item-key decryption, actual
WebView2 fill, JSON-safe quoted/Unicode passwords, no submission, other-view
isolation, command denial in routes/popups, changed URLs, nonmatching entries,
tampered MAC, destroyed views, lock/unlock races, logout and the actual drawer.
Rust additionally checks published PBKDF2/Argon2 vectors, KDF limits, origin rules,
expiry and account changes. Vitest checks drawer workflows and DOM form handling.

[Settings/sidebar Windows evidence](evidence/windows-vaultwarden-settings.json)
also verifies unlocking in Settings, active-route match gating, navigation-based
availability changes, locking/hiding, automatic picker loading, and that background
availability checks do not invalidate a pending selection. The availability
command is denied to remote views along with the other vault commands.

Windows fixture behavior is **implemented-and-tested**. Actual vault account
login and third-party providers are **implemented-unverified**. Linux/macOS are
**implemented-unverified** for this feature; existing CI will compile/test the
new modules, but no new cross-platform result is claimed. Independent security
review of this protocol adapter has not been performed.

Next manual check: unlock locally using your own account, choose a disposable
saved login on an exact matching HTTPS site, verify username/password filling,
lock and re-open the drawer, then exercise the actual desired provider. Never
put vault credentials in issues, test fixtures, screenshots or chat.

## Protocol references

Inspected upstream implementations, not a vendored password-manager SDK:

- [Vaultwarden identity routes](https://github.com/dani-garcia/vaultwarden/blob/main/src/api/identity.rs)
- [Bitwarden master-key protocol and interoperability vectors](https://github.com/bitwarden/sdk-internal/blob/main/crates/bitwarden-crypto/src/keys/master_key.rs)
- [Bitwarden KDF protocol](https://github.com/bitwarden/sdk-internal/blob/main/crates/bitwarden-crypto/src/keys/kdf.rs)
- [HKDF key expansion](https://github.com/bitwarden/sdk-internal/blob/main/crates/bitwarden-crypto/src/keys/utils.rs)

The implementation uses RustCrypto primitives pinned by `Cargo.lock`, not custom
cryptographic primitives, a bundled CLI, Electron or a Node sidecar.
