// Real Tauri/WebKitGTK process; no bundled browser, WebDriver substitute or sidecar.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { mockBackend } from "./mock-backend.mjs";
import { websiteFixture } from "./website-fixture.mjs";

if (process.platform !== "linux") throw Error("Linux/WebKitGTK driver only");
try {
  execFileSync("pgrep", ["-x", "omnia-tauri"]);
  throw Error("Close Omnia before smoke tests (single-instance collision)");
} catch (e) {
  if (e.status !== 1) throw e;
}
const directory = await mkdtemp(join(tmpdir(), "omnia-linux-"));
const evidence = {
  date: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  referenceCommit: "4c76ff5bd8d574448ec2c99d890373a64059c287",
  method:
    "Debug-only private Unix socket; native WebKitGTK evaluation and GTK measurements",
  environment: {
    distro: await readFile("/etc/os-release", "utf8"),
    kernel: execFileSync("uname", ["-a"], { encoding: "utf8" }).trim(),
    node: process.version,
    rust: execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim(),
    gtk: execFileSync("pkg-config", ["--modversion", "gtk+-3.0"], {
      encoding: "utf8",
    }).trim(),
    webkit: execFileSync("pkg-config", ["--modversion", "webkit2gtk-4.1"], {
      encoding: "utf8",
    }).trim(),
    session: process.env.XDG_SESSION_TYPE,
    desktop: process.env.XDG_CURRENT_DESKTOP,
    requestedBackend: process.env.GDK_BACKEND ?? "default",
    displayDescription:
      process.env.OMNIA_SMOKE_DISPLAY ?? "existing desktop session",
  },
  checks: [],
  remaining: [
    {
      name: "Real providers, production Authentik and Spotify protected playback",
      status: "unverified",
    },
    {
      name: "Camera/microphone/website notifications",
      status: "blocked",
      reason:
        "Pinned WebKitGTK permission requests lack requesting frame/origin; denial retained",
    },
    {
      name: "Audible hardware output, OS notification clicks and visual launcher badges",
      status: "unverified",
    },
    {
      name: "Installed protocol association, login-session startup/minimization, pure Xorg and mixed-monitor DPI",
      status: "unverified",
    },
    {
      name: "Hardware pointer drag gestures and delayed stale title callbacks after destruction",
      status: "unverified",
    },
    {
      name: "Per-route process memory and Castlabs DRM parity",
      status: "unsupported",
    },
  ],
};
try {
  evidence.environment.monitors = JSON.parse(
    execFileSync("hyprctl", ["monitors", "-j"], { encoding: "utf8" }),
  ).map(({ name, width, height, scale }) => ({ name, width, height, scale }));
} catch {}
const check = (name, details = {}) => {
  evidence.checks.push({ name, status: "pass", ...details });
  console.log("PASS", name);
};
const backend = mockBackend("http://127.0.0.1:7890");
const fixture = createServer(async (req, res) => {
  if (!(await backend.handle(req, res))) websiteFixture(req, res);
});
await new Promise((resolve, reject) => {
  fixture.once("error", reject);
  fixture.listen(7890, "127.0.0.1", resolve);
});
let app, stopped, appEnv, privateBus;
function control(request) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(directory, "control.sock"));
    let data = "";
    socket.setTimeout(35000, () =>
      socket.destroy(Error("Native control timeout")),
    );
    socket.on("error", reject);
    socket.on("connect", () => socket.end(JSON.stringify(request) + "\n"));
    socket.on("data", (chunk) => (data += chunk));
    socket.on("end", () => {
      try {
        const r = JSON.parse(data);
        r.error ? reject(Error(r.error)) : resolve(r.value);
      } catch (e) {
        reject(e);
      }
    });
  });
}
// Values are JSON encoded; native never interpolates page-derived values as source.
const evaluate = (label, expression) =>
  control({
    op: "eval",
    label,
    script: `return JSON.stringify(await (${expression}));`,
  });
const invoke = (command, args = {}, label = "shell") =>
  evaluate(
    label,
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}) .then(v=>v??null)`,
  );
async function until(fn, description, timeout = 25000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const r = await fn();
      if (r) return r;
    } catch (e) {
      last = e;
    }
    await delay(100);
  }
  throw Error(`${description}: ${last?.message ?? "timed out"}`);
}
async function launch(args = [], environment = {}) {
  await rm(join(directory, "control.sock"), { force: true });
  appEnv = {
    ...process.env,
    ...environment,
    XDG_DATA_HOME: join(directory, "data"),
    XDG_CONFIG_HOME: join(directory, "config"),
    XDG_CACHE_HOME: join(directory, "cache"),
    OMNIA_SMOKE: "1",
    OMNIA_SMOKE_CONTROL: directory,
    OMNIA_API_BASE_URL: "http://127.0.0.1:7890",
    AUTHENTIK_DISCOVERY_URL: "http://127.0.0.1:7890/discovery",
    AUTHENTIK_CLIENT_ID: "native-linux-" + directory.split("/").at(-1),
  };
  app = spawn("src-tauri/target/debug/omnia-tauri", args, {
    env: appEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stderr.on("data", (b) => process.stderr.write(b));
  stopped = new Promise((resolve) =>
    app.once("exit", (code, signal) => resolve({ code, signal })),
  );
  await until(
    () =>
      evaluate(
        "shell",
        `!!window.__TAURI_INTERNALS__ && !!document.querySelector('button')`,
      ),
    "Native shell ready",
  );
}
async function stop() {
  if (!app) return;
  await control({ op: "exit" }).catch(() => {});
  const result = await Promise.race([stopped, delay(8000).then(() => null)]);
  if (!result) {
    app.kill("SIGTERM");
    await stopped;
  }
  app = null;
  await delay(500);
}
let revision = 0;
const bounds = (x, y, width, height) => ({ x, y, width, height });
const spread = [
  { routeId: "fixture-a", bounds: bounds(108, 120, 450, 500) },
  { routeId: "fixture-b", bounds: bounds(558, 120, 450, 500) },
];
const layout = (placements = spread, drawer = false) =>
  invoke("layout_views", { revision: ++revision, placements, drawer });
const action = (id, action) => invoke("route_action", { id, action });
async function labels() {
  const s = await invoke("smoke_inspect");
  return Object.fromEntries(s.views.map((v) => [v.id, v.label]));
}
async function ready(label) {
  await until(
    () => evaluate(label, `!!document.querySelector('#identity')`),
    "Website ready",
  );
}
const identity = (label) =>
  evaluate(
    label,
    `({local:localStorage.getItem('identity'),cookie:document.cookie})`,
  );
const denied = async (command, args, label) => {
  await assert.rejects(() => invoke(command, args, label));
};
try {
  await launch();
  const startup = await control({ op: "autostart" });
  assert.ok(startup.enabled && startup.disabled);
  assert.ok(startup.entry.includes("--from-autostart"));
  check("Isolated XDG autostart enable/disable entry", { startup });
  await invoke("spike_seed");
  await layout();
  let names = await labels();
  let a = names["fixture-a"],
    b = names["fixture-b"];
  await ready(a);
  await ready(b);
  for (const [label, value] of [
    [a, "Alice"],
    [b, "Bob"],
  ])
    await evaluate(
      label,
      `(()=>{document.querySelector('input').value=${JSON.stringify(value)};document.querySelector('#save').click();return true;})()`,
    );
  assert.deepEqual(await identity(a), {
    local: "Alice",
    cookie: "identity=Alice",
  });
  assert.deepEqual(await identity(b), { local: "Bob", cookie: "identity=Bob" });
  assert.equal(
    (await fetch("http://127.0.0.1:7890")).headers.get("x-frame-options"),
    "DENY",
  );
  const ia = await control({ op: "inspect", label: a }),
    ib = await control({ op: "inspect", label: b });
  assert.notEqual(ia.context, ib.context);
  assert.notEqual(ia.manager, ib.manager);
  assert.notEqual(ia.directory, ib.directory);
  assert.ok(ia.directory.includes(directory));
  evidence.environment.scale = ia.scale;
  evidence.environment.actualDisplayBackend = ia.displayBackend;
  check(
    "Same-origin native views: distinct cookies, localStorage, WebContexts and data managers",
    { a: ia, b: ib },
  );
  for (const placements of [
    [spread[0]],
    spread,
    [
      { routeId: "fixture-a", bounds: bounds(108, 120, 900, 250) },
      { routeId: "fixture-b", bounds: bounds(108, 370, 900, 250) },
    ],
  ]) {
    await layout(placements);
    await delay(150);
    for (const p of placements) {
      const v = await control({ op: "inspect", label: names[p.routeId] });
      assert.equal(v.width, p.bounds.width);
      assert.equal(v.height, p.bounds.height);
      assert.equal(v.visible, true);
    }
  }
  await evaluate(
    b,
    `(()=>{window.fixtureTicks=0;window.fixtureTimer=setInterval(()=>window.fixtureTicks++,50);return true;})()`,
  );
  await layout([spread[0]]);
  assert.equal((await control({ op: "inspect", label: b })).visible, false);
  assert.deepEqual(await labels(), names);
  await delay(250);
  assert.ok(await evaluate(b, `window.fixtureTicks>0`));
  await evaluate(
    b,
    `(()=>{clearInterval(window.fixtureTimer);return true;})()`,
  );
  await layout(spread, true);
  assert.equal((await control({ op: "inspect", label: a })).visible, false);
  await layout();
  await action("fixture-a", "focus");
  check(
    "Single/spread/matrix bounds, hidden views retain timers, drawer hide/show and focus",
  );
  await action("fixture-a", "zoom_in");
  assert.ok(
    Math.abs(
      (await control({ op: "inspect", label: a })).zoom - Math.sqrt(1.2),
    ) < 1e-6,
  );
  await action("fixture-a", "refresh");
  await ready(a);
  assert.equal((await identity(a)).local, "Alice");
  check("Refresh and source-equivalent native zoom");
  await denied("route_action", { id: "fixture-b", action: "clear_session" }, a);
  await denied("auth_login", {}, a);
  await denied("page_signal", { count: -1, source: "title" }, a);
  await denied("page_favicon", { url: "file:///secret" }, a);
  await delay(300);
  await invoke("page_signal", { count: 7, source: "gmail-dom" }, a);
  await until(
    async () => (await invoke("unread_snapshot")).total === 7,
    "Unread delivery",
  );
  await delay(300);
  await invoke("page_signal", { count: 2, source: "title" }, a);
  assert.equal((await invoke("unread_snapshot")).total, 7);
  assert.equal(
    (await action("fixture-a", "focus")).faviconUrl,
    "http://127.0.0.1:7890/favicon.png",
  );
  check(
    "Remote authority denied, invalid payloads denied; narrow localhost unread priority and favicon",
  );
  await evaluate(
    a,
    `(()=>{document.querySelector('#popup').click();return true;})()`,
  );
  const popup = await until(
    async () =>
      (await control({ op: "list" })).find((l) => l.endsWith("-popup")),
    "Popup",
  );
  await ready(popup);
  assert.equal((await identity(popup)).local, "Alice");
  assert.equal(
    await evaluate(popup, `sessionStorage.getItem('auth_nonce')`),
    "fixture-nonce",
  );
  assert.equal(await evaluate(popup, `!!window.opener`), true);
  await denied("spike_seed", {}, popup);
  await evaluate(
    popup,
    `(()=>{opener.postMessage('auth-complete',location.origin);return true;})()`,
  );
  await until(
    () => evaluate(a, `document.body.dataset.auth==='complete'`),
    "Popup completion",
  );
  assert.equal((await identity(b)).local, "Bob");
  check(
    "Native popup inherits profile/opener/sessionStorage and cannot manage routes",
  );
  await evaluate(b, `(()=>{location.href='/redirect';return true;})()`);
  await delay(400);
  assert.ok(
    !(await evaluate(b, `location.href`)).includes("localhost:7890/forbidden"),
  );
  assert.equal((await identity(b)).local, "Bob");
  const trace = await readFile(
    join(
      directory,
      "data/com.strielok.omnia.tauri/development/smoke/diagnostics/navigation.jsonl",
    ),
    "utf8",
  );
  assert.ok(trace.includes("localhost"));
  check(
    "Native HTTP redirect to disallowed hostname intercepted without external launch",
  );
  await action("fixture-a", "hibernate");
  assert.ok(!(await control({ op: "list" })).includes(popup));
  assert.ok(!(await control({ op: "list" })).includes(a));
  await action("fixture-a", "restore");
  await layout();
  names = await labels();
  assert.notEqual(names["fixture-a"], a);
  a = names["fixture-a"];
  await ready(a);
  assert.equal((await identity(a)).local, "Alice");
  check("Hibernate destroys view/popups; new generation retains session");
  await delay(1500);
  await stop();
  await launch();
  await invoke("spike_seed");
  await layout();
  names = await labels();
  a = names["fixture-a"];
  b = names["fixture-b"];
  await ready(a);
  await ready(b);
  assert.equal((await identity(a)).local, "Alice");
  assert.equal((await identity(b)).local, "Bob");
  assert.equal((await identity(a)).cookie, "identity=Alice");
  check("Full process restart preserves isolated cookies and localStorage");
  await action("fixture-a", "clear_session");
  await layout();
  names = await labels();
  a = names["fixture-a"];
  await ready(a);
  assert.equal((await identity(a)).local, null);
  assert.equal((await identity(a)).cookie, "");
  assert.equal((await identity(b)).local, "Bob");
  await action("fixture-a", "hibernate");
  await action("fixture-a", "restore");
  await layout();
  a = (await labels())["fixture-a"];
  await ready(a);
  assert.equal((await identity(a)).local, null);
  check(
    "Targeted async clear rotates profile and cannot reopen old session; B retained",
  );
  evidence.mediaProbe = await evaluate(
    a,
    `(async()=>{const v=document.createElement('video');const results={secureContext:isSecureContext,eme:typeof navigator.requestMediaKeySystemAccess,h264:v.canPlayType('video/mp4; codecs="avc1.42E01E"'),vp9:v.canPlayType('video/webm; codecs="vp9"')};for(const key of ['com.widevine.alpha','com.microsoft.playready.recommendation']){try{await navigator.requestMediaKeySystemAccess(key,[{initDataTypes:['cenc'],videoCapabilities:[{contentType:'video/mp4; codecs="avc1.42E01E"'}]}]);results[key]='accepted';}catch(e){results[key]=e.name;}}return results;})()`,
  );
  await invoke("auth_logout");
  await invoke("auth_login");
  await until(
    () => backend.state.requests.some((r) => r.grant === "authorization_code"),
    "PKCE exchange",
  );
  let snapshot = await until(async () => {
    const s = await invoke("workspace_bootstrap");
    return s.user && s;
  }, "Signed-in workspace");
  assert.equal(snapshot.routes.length, 2);
  check("Mock native OIDC PKCE and Secret Service persistence");
  await until(
    () =>
      evaluate(
        "shell",
        `!!document.querySelector('[aria-label="Manage routes"]')`,
      ),
    "Workspace UI",
  );
  const click = (label) =>
    evaluate(
      "shell",
      `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing button');button.click();return true;})()`,
    );
  await click("Manage routes");
  await until(
    async () => (await invoke("smoke_inspect")).drawerOpen,
    "Drawer native acknowledgement",
  );
  const uiViews = await labels();
  for (const label of Object.values(uiViews))
    assert.equal((await control({ op: "inspect", label })).visible, false);
  assert.ok(
    await evaluate(
      "shell",
      `[...document.querySelectorAll('h1,h2,h3')].some(h=>h.textContent==='Manage routes')`,
    ),
  );
  await click("Close manage routes");
  await until(
    async () => !(await invoke("smoke_inspect")).drawerOpen,
    "Drawer closed",
  );
  for (const mode of ["Columns layout", "Matrix layout", "Single layout"]) {
    await click(mode);
    await until(
      () =>
        evaluate(
          "shell",
          `document.querySelector('[aria-label="${mode}"]').getAttribute('aria-pressed')==='true'`,
        ),
      "Layout UI",
    );
  }
  check(
    "Retained React drawer and three layout controls synchronize native visibility via real WebKit DOM actions",
  );
  await stop();
  await launch();
  snapshot = await invoke("workspace_bootstrap");
  assert.ok(snapshot.user);
  assert.ok(backend.state.refreshes > 0);
  check("Cold-start OS credential read and refresh");
  const created = await invoke("route_create", {
    route: {
      name: "Linux fixture",
      url: "http://127.0.0.1:7890/",
      icon: "link",
      order: 2,
      metadata: { openExternalLinksInBrowser: true },
    },
  });
  const id = created.at(-1).id;
  await invoke("route_update", { id, update: { name: "Renamed fixture" } });
  await action(id, "focus");
  const deletedLabel = (await labels())[id];
  const deletedDirectory = (
    await control({ op: "inspect", label: deletedLabel })
  ).directory;
  await invoke("route_delete", { id });
  assert.ok(!(await control({ op: "list" })).includes(deletedLabel));
  assert.equal(backend.state.routes.length, 2);
  check("Real native API CRUD and deletion closes native resources");
  await invoke("route_update", { id: "fixture-a", update: { order: 1 } });
  backend.state.failPatchId = "fixture-b";
  const requestsBefore = backend.state.requests.length;
  await denied("route_update", { id: "fixture-b", update: { order: 0 } });
  assert.equal(backend.state.requests.length, requestsBefore + 1);
  backend.state.failPatchId = null;
  await invoke("workspace_bootstrap");
  check(
    "Partial server mutation is surfaced and not blindly replayed; reconnect reconciles",
  );
  backend.state.offline = true;
  snapshot = await invoke("workspace_bootstrap");
  assert.equal(snapshot.isOffline, true);
  assert.equal(snapshot.routes.length, 2);
  await denied("route_update", {
    id: "fixture-a",
    update: { name: "Offline" },
  });
  backend.state.offline = false;
  assert.equal((await invoke("workspace_bootstrap")).isOffline, false);
  check("Offline cache and bounded recovery; mutations rejected without queue");
  backend.state.invalid = true;
  await denied("workspace_bootstrap", {});
  assert.equal(
    (await control({ op: "list" })).filter((l) => l.startsWith("route-"))
      .length,
    0,
  );
  backend.state.invalid = false;
  await invoke("auth_logout");
  check("Invalid authentication closes views; logout removes native session");
  const exchangeCount = () =>
    backend.state.requests.filter((r) => r.grant === "authorization_code")
      .length;
  async function deliver(uri) {
    const child = spawn("src-tauri/target/debug/omnia-tauri", [uri], {
      env: appEnv,
      stdio: "ignore",
    });
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(Error("Callback process failed")),
      );
    });
    await delay(400);
  }
  backend.state.holdAuthorization = true;
  await invoke("auth_login");
  await until(() => backend.state.code, "Pending authorization");
  const previous = exchangeCount();
  const callback =
    "omnia://auth/callback?code=fixture-code&state=" +
    encodeURIComponent(backend.state.code.state);
  await deliver("omnia://auth/callback?code=fixture-code&state=wrong");
  assert.equal(exchangeCount(), previous);
  await deliver(callback.replace("/callback?", "/callback/extra?"));
  assert.equal(exchangeCount(), previous);
  await stop();
  await launch([callback]);
  await assert.rejects(() => access(deletedDirectory));
  check("Pending Linux profile deletion is recovered before views on restart");
  await until(() => exchangeCount() === previous + 1, "Cold callback");
  await deliver(callback);
  assert.equal(exchangeCount(), previous + 1);
  const refreshes = backend.state.refreshes;
  await Promise.all([
    invoke("workspace_bootstrap"),
    invoke("workspace_bootstrap"),
  ]);
  assert.equal(backend.state.refreshes, refreshes);
  check(
    "Native cold callback, exact URI/state rejection, single-instance replay denial and serialized token reuse",
  );
  await invoke("auth_logout");
  await invoke("auth_login");
  await until(() => backend.state.code, "Cancelable authorization");
  const cancelled =
    "omnia://auth/callback?code=fixture-code&state=" +
    encodeURIComponent(backend.state.code.state);
  await invoke("auth_cancel");
  await deliver(cancelled);
  assert.equal(exchangeCount(), previous + 1);
  assert.ok(!(await control({ op: "list" })).includes("auth"));
  await invoke("auth_logout");
  check("Cancellation removes pending OS credential and rejects late callback");
  const storage = await evaluate(
    "shell",
    `({local:{...localStorage},session:{...sessionStorage}})`,
  );
  assert.ok(!JSON.stringify(storage).includes("fixture-access"));
  assert.ok(!JSON.stringify(storage).includes("fixture-refresh"));
  check("Raw fixture tokens absent from frontend storage");
  await stop();
  // An isolated bus with no activatable services tests failure without locking,
  // stopping or changing the user's real Secret Service.
  const busConfig = join(directory, "no-secrets.conf");
  await writeFile(
    busConfig,
    '<busconfig><type>session</type><listen>unix:tmpdir=/tmp</listen><auth>EXTERNAL</auth><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>',
  );
  privateBus = spawn(
    "dbus-daemon",
    ["--nofork", "--config-file=" + busConfig, "--print-address=1"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const busAddress = await new Promise((resolve, reject) => {
    privateBus.on("error", reject);
    privateBus.stdout.once("data", (chunk) => resolve(chunk.toString().trim()));
  });
  await launch([], { DBUS_SESSION_BUS_ADDRESS: busAddress });
  const vaultError = await evaluate(
    "shell",
    `window.__TAURI_INTERNALS__.invoke('workspace_bootstrap').then(()=>null,e=>e)`,
  );
  assert.match(vaultError.message, /credential store.*unavailable/);
  const saveError = await evaluate(
    "shell",
    `window.__TAURI_INTERNALS__.invoke('auth_login').then(()=>null,e=>e)`,
  );
  assert.match(saveError.message, /OS credential store/);
  assert.ok(!(await control({ op: "list" })).includes("auth"));
  check(
    "Missing Secret Service produces explicit read/save errors without plaintext fallback",
    { observed: vaultError.message },
  );
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  evidence.failure = {
    expected: "All native assertions pass",
    observed: error.message,
    stack: error.stack,
  };
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) await invoke("auth_logout").catch(() => {});
  await stop();
  privateBus?.kill();
  fixture.close();
  evidence.finished = new Date().toISOString();
  evidence.testStorage = directory;
  await mkdir("reports", { recursive: true });
  await writeFile(
    "reports/native-linux.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log("Evidence: reports/native-linux.json");
}
