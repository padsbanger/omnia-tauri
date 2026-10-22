import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { observeNativeProcess } from "./native-process.mjs";

function launch(script) {
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const wait = observeNativeProcess(child);
  child.stdout.resume();
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return { child, wait, stderr: () => stderr };
}

test("waits for inherited pipes after a successful parent exit, retaining late diagnostics", async () => {
  const process = launch(`
    const {spawn}=require('node:child_process');
    const helper=spawn(process.execPath,['-e',
      'setTimeout(()=>{console.error("late helper diagnostic");},600)'],
      {stdio:['ignore','ignore',2]});
    helper.unref();
  `);
  await once(process.child, "exit");
  const result = await process.wait({
    exitTimeoutMs: 50,
    stdioTimeoutMs: 3000,
  });
  assert.deepEqual(result.mainExit, { code: 0, signal: null });
  assert.equal(result.stdioClosed, true);
  assert.ok(result.stdioDrainMs >= 400);
  assert.match(process.stderr(), /late helper diagnostic/);
});

test("a pipe deadline still fails even when the main process exits zero", async () => {
  const process = launch(`
    const {spawn}=require('node:child_process');
    spawn(process.execPath,['-e','setTimeout(()=>{},600)'],
      {stdio:['ignore','ignore',2]}).unref();
  `);
  await once(process.child, "exit");
  await assert.rejects(process.wait({ stdioTimeoutMs: 50 }), (error) => {
    assert.equal(error.shutdown.mainExit.code, 0);
    assert.equal(error.shutdown.stdioTimeout, true);
    return /inherited stdio/.test(error.message);
  });
});

test("nonzero exits and signals fail", async () => {
  for (const script of [
    "process.exit(3)",
    "process.kill(process.pid,'SIGTERM')",
  ]) {
    await assert.rejects(launch(script).wait(), /exited unsuccessfully/);
  }
});

test("a hung parent is terminated and still reported as a timeout", async () => {
  const process = launch("setInterval(()=>{},1000)");
  await assert.rejects(process.wait({ exitTimeoutMs: 200 }), (error) => {
    assert.equal(error.shutdown.exitTimeout, true);
    assert.equal(error.shutdown.mainExit.signal, "SIGTERM");
    return /did not exit/.test(error.message);
  });
});

test("spawn errors are reported instead of hanging or becoming unhandled events", async () => {
  const child = spawn("/nonexistent/omnia-smoke-executable");
  await assert.rejects(observeNativeProcess(child)(), /could not start/);
});
