// Node's `exit` observes the parent; `close` also waits for inherited stdio.
// WebKit helpers can keep those pipes open after Omnia has exited successfully.
async function within(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Attach immediately after spawn so a fast exit/spawn failure cannot be missed.
export function observeNativeProcess(child) {
  const report = { mainExit: null, stdioClosed: false };
  let exitedAt;
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      report.mainExit = { code, signal };
      exitedAt = performance.now();
      resolve(report.mainExit);
    });
    child.once("error", (error) => {
      report.spawnError = error.message;
      resolve({ error: error.message });
    });
  });
  const closed = new Promise((resolve) =>
    child.once("close", () => {
      report.stdioClosed = true;
      report.stdioDrainMs =
        exitedAt === undefined
          ? null
          : Math.round(performance.now() - exitedAt);
      resolve(true);
    }),
  );
  return async ({ exitTimeoutMs = 8000, stdioTimeoutMs = 30000 } = {}) => {
    const main = await within(exited, exitTimeoutMs);
    if (!main) {
      report.exitTimeout = true;
      child.kill("SIGTERM");
      if (!(await within(exited, 2000))) {
        child.kill("SIGKILL");
        await within(exited, 2000);
      }
    }
    if (!(await within(closed, stdioTimeoutMs))) {
      report.stdioTimeout = true;
      // Fail rather than hang the runner forever. Diagnostics stay attached up
      // to this deadline; a zero parent exit never makes this timeout a pass.
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
    let failure;
    if (report.spawnError)
      failure = `Native process could not start: ${report.spawnError}`;
    else if (report.exitTimeout)
      failure = "Native process did not exit before its deadline";
    else if (report.mainExit?.code !== 0 || report.mainExit?.signal !== null)
      failure = "Native process exited unsuccessfully";
    else if (report.stdioTimeout)
      failure =
        "Native process exited cleanly but inherited stdio did not close before its deadline";
    if (failure)
      throw Object.assign(new Error(failure), { shutdown: { ...report } });
    return { ...report };
  };
}
