import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
const script = readFileSync("src-tauri/src/route_signal.js", "utf8");
function page(url: string, html: string, invoke = vi.fn().mockResolvedValue(undefined), ready = true) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  if (ready) Object.assign(dom.window, { __TAURI_INTERNALS__: { invoke } });
  Object.defineProperty(dom.window.HTMLElement.prototype, "getClientRects", {
    value: () => [{ width: 10, height: 10 }],
  });
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return { dom, invoke };
}
describe("injected provider hints", () => {
  afterEach(() => vi.useRealTimers());
  it("accepts Web A's Tauri-specific count callback without exposing privileged operations", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page("https://web.telegram.org/a/", '<title>Telegram</title>');
    const host = (dom.window as unknown as { tauri: { setNotificationsCount: (count: number) => Promise<void> } }).tauri;
    expect(Object.keys(host)).toEqual(['setNotificationsCount']);
    await host.setNotificationsCount(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledWith("page_signal", { count: 1, source: "telegram-app-badge" });
    await host.setNotificationsCount(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenLastCalledWith("page_signal", { count: 0, source: "telegram-app-badge" });
    dom.window.close();
  });
  it("reads Web A hashed badges, ignores bot buttons and clears removed counters", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page("https://web.telegram.org/a/", `<title>Telegram</title>
      <div id="LeftColumn"><div class="chat-list">
        <div class="Chat"><a class="ListItem-button" href="#101"><div class="subtitle">Preview 123
          <div class="chat-badge-transition shown open"><div class="hashed-wrapper"><div class="hashed-badge"><span class="hashed-counter">1</span></div></div></div>
        </div></a></div>
        <div class="Chat"><div class="subtitle"><div class="chat-badge-transition shown open"><button>Open</button><div><i class="icon-pin"></i></div></div></div></div>
        <div class="Chat" hidden><div class="subtitle"><div class="Badge unread">80</div></div></div>
        <div class="Chat"><div class="subtitle"><div class="chat-badge-transition"><div><span>50</span></div></div></div></div>
      </div></div>`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledWith("page_signal", { count: 1, source: "telegram-dom" });
    dom.window.document.querySelector('.hashed-counter')!.innerHTML = '<div><div>4</div><div>1</div><div>4</div></div>';
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenLastCalledWith("page_signal", { count: 4, source: "telegram-dom" });
    dom.window.document.querySelector('.hashed-counter')!.remove();
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenLastCalledWith("page_signal", { count: 0, source: "telegram-dom" });
    dom.window.close();
  });
  it("supports Web A legacy badges and deduplicates chats across rendered folders", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page("https://web.telegram.org/a/", `<div id="LeftColumn"><div class="chat-list">
      <div class="Chat"><a class="ListItem-button" href="#101"><div class="subtitle"><div class="Badge unread">12</div></div></a></div>
      <div class="Chat"><a class="ListItem-button" href="#101"><div class="subtitle"><div class="Badge unread">12</div></div></a></div>
      <div class="Chat"><a class="ListItem-button" href="#102"><div class="subtitle"><div class="Badge unread muted">3</div></div></a></div>
      </div></div>`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledWith("page_signal", { count: 15, source: "telegram-dom" });
    dom.window.close();
  });
  it("reads Telegram Web K's visible counter with a plain title and no Badging API calls", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page("https://web.telegram.org/k/", `<title>Telegram</title>
      <div id="column-left"><div class="chatlist">
        <a class="chatlist-chat" data-peer-id="101"><span class="dialog-subtitle-badge-unread unread">1</span></a>
        <a class="chatlist-chat" data-peer-id="102"><span class="dialog-subtitle-badge-bot-app">Open</span><span>18:51</span></a>
        <a class="chatlist-chat" data-peer-id="103"><span class="dialog-subtitle-badge-pinned">8</span></a>
        <a class="chatlist-chat" data-peer-id="104" hidden><span class="dialog-subtitle-badge-unread">50</span></a>
      </div></div>`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledWith("page_signal", { count: 1, source: "telegram-dom" });
    dom.window.document.querySelector('.dialog-subtitle-badge-unread')!.remove();
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenLastCalledWith("page_signal", { count: 0, source: "telegram-dom" });
    dom.window.close();
  });
  it("uses Telegram rolling-count labels and avoids counting duplicate rows or avatar badges twice", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page("https://web.telegram.org/k/", `<title>Telegram</title>
      <div id="column-left"><div class="chatlist">
        <a class="chatlist-chat" data-peer-id="101"><span class="dialog-subtitle-badge-unread" aria-label="12">1112</span><span class="dialog-subtitle-badge unread avatar-badge">12</span></a>
        <a class="chatlist-chat" data-peer-id="101"><span class="dialog-subtitle-badge-unread">12</span></a>
        <a class="rp" data-peer-id="102"><span class="dialog-subtitle-badge unread">3</span></a>
      </div></div>`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledWith("page_signal", { count: 15, source: "telegram-dom" });
    dom.window.close();
  });
  it("reads Gmail unread DOM badges before title hints", async () => {
    const { dom, invoke } = page(
      "https://mail.google.com",
      '<title>Inbox (2)</title><nav><div><a href="#inbox">Inbox</a><span>12</span></div></nav>',
    );
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("page_signal", {
      count: 12,
      source: "gmail-dom",
    }));
    dom.window.close();
  });
  it("falls back to localized Gmail title and clamps counts", async () => {
    const { dom, invoke } = page(
      "https://mail.google.com",
      "<title>Odebrane (12)</title>",
    );
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("page_signal", {
      count: 12,
      source: "gmail-title",
    }));
    dom.window.close();
  });
  it("bridges Telegram badges without route identity supplied by the page", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page(
      "https://web.telegram.org",
      "<title>Telegram</title>",
    );
    const navigator = dom.window.navigator as Navigator & {
      setAppBadge: (count: number) => Promise<void>;
      clearAppBadge: () => Promise<void>;
    };
    await navigator.setAppBadge(30000);
    await vi.advanceTimersByTimeAsync(1000);
    await navigator.clearAppBadge();
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke).toHaveBeenCalledWith("page_signal", {
      count: 9999,
      source: "telegram-app-badge",
    });
    expect(invoke).toHaveBeenCalledWith("page_signal", {
      count: 0,
      source: "telegram-app-badge",
    });
    dom.window.close();
  });
  it("retries an unchanged Gmail count rejected during startup or rate limiting", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn().mockImplementation((command: string) => command === "page_signal"
      ? Promise.reject(new Error("Unread update rate limited; retry")) : Promise.resolve());
    const { dom } = page("https://mail.google.com", "<title>Odebrane (12)</title>", invoke);
    await vi.advanceTimersByTimeAsync(1);
    invoke.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invoke.mock.calls.filter(([command]) => command === "page_signal")).toHaveLength(2);
    expect(invoke).toHaveBeenLastCalledWith("page_signal", { count: 12, source: "gmail-title" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(invoke.mock.calls.filter(([command]) => command === "page_signal")).toHaveLength(2);
    dom.window.close();
  });
  it("waits for the native bridge and coalesces Telegram updates to the latest count", async () => {
    vi.useFakeTimers();
    const { dom, invoke } = page("https://web.telegram.org", "<title>Telegram</title>", vi.fn().mockResolvedValue(undefined), false);
    const badge = dom.window.navigator as Navigator & { setAppBadge: (count: number) => Promise<void> };
    await badge.setAppBadge(1);
    await badge.setAppBadge(2);
    await badge.setAppBadge(9);
    Object.assign(dom.window, { __TAURI_INTERNALS__: { invoke } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(invoke.mock.calls.filter(([, payload]) => payload.source === "telegram-app-badge")).toEqual([
      ["page_signal", { count: 9, source: "telegram-app-badge" }],
    ]);
    dom.window.close();
  });
});
