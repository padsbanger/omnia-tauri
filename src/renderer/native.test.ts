import { beforeEach, describe, expect, it, vi } from "vitest";
import { native, message, toRoute } from "./native";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
const route = {
  id: "a/b",
  label: "Work",
  icon: "link",
  loadURL: "https://example.com",
};
beforeEach(() => vi.clearAllMocks());
describe("typed native bridge", () => {
  it("normalizes absent native favicon values before passing routes to retained components", async () => {
    vi.mocked(invoke).mockResolvedValue({
      routes: [{ ...route, faviconUrl: null }],
    });
    expect((await native.bootstrap()).routes[0].faviconUrl).toBeUndefined();
    expect(
      toRoute({ ...route, faviconUrl: "https://example.com/icon.png" })
        .faviconUrl,
    ).toBe("https://example.com/icon.png");
  });
  it("maps native identities without filesystem partitions and sends no bearer tokens", async () => {
    vi.mocked(invoke).mockResolvedValue({
      user: { id: "u" },
      routes: [route],
      isOffline: false,
    });
    expect((await native.bootstrap()).routes[0].path).toBe("/a%2Fb");
    vi.mocked(invoke).mockResolvedValue([route]);
    const local = toRoute(route);
    await native.create(local, 1);
    await native.update(local.id, { name: "New" });
    await native.remove(local.id);
    vi.mocked(invoke).mockResolvedValue(route);
    expect((await native.action(local.id, "hibernate")).partition).toBe("");
    expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toMatch(
      /token|partition/,
    );
  });
  it("uses increasing layout revisions and explicit lifecycle/settings commands", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await native.layout([], false);
    await native.layout([], true);
    const calls = vi.mocked(invoke).mock.calls;
    expect((calls[1][1] as { revision: number }).revision).toBeGreaterThan(
      (calls[0][1] as { revision: number }).revision,
    );
    await native.login();
    await native.cancelLogin();
    await native.logout();
    await native.preferences(null, "single", []);
    await native.settings();
    await native.startup("no");
    await native.unread();
    expect(invoke).toHaveBeenCalledWith("set_startup", { mode: "no" });
  });
  it("normalizes errors and limits event subscriptions to typed public data", async () => {
    expect(message(new Error("a"))).toBe("a");
    expect(message({ message: "b" })).toBe("b");
    expect(message("c")).toBe("c");
    vi.mocked(invoke).mockRejectedValue({ message: "locked" });
    await expect(native.login()).rejects.toThrow("locked");
    const callback = vi.fn();
    await native.onUnread(callback);
    await native.onFavicon(callback);
    await native.onSession(callback);
    for (const [, handler] of vi.mocked(listen).mock.calls)
      handler({ payload: { total: 1 } } as never);
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
