import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
const source = readFileSync("src-tauri/src/vault/fill.js", "utf8");
const url = "https://example.com/login";
function page(html: string) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.HTMLInputElement.prototype.getClientRects = () =>
    [{ width: 100 }] as unknown as DOMRectList;
  const fill = (patch = {}) =>
    dom.window.eval(
      `(${source})(${JSON.stringify({ url, origin: "https://example.com", username: "alice", password: 'p"</script>😀', ...patch })})`,
    );
  return { dom, fill };
}
it("fills visible login controls with input/change events but never submits", () => {
  const { dom, fill } = page(
    '<form><input name="user"><input type="password"><input type="hidden"></form>',
  );
  const events: string[] = [];
  dom.window.document.addEventListener("input", () => events.push("input"));
  dom.window.document.addEventListener("change", () => events.push("change"));
  dom.window.document.addEventListener("submit", () => events.push("submit"));
  expect(fill()).toBe("filled");
  expect(
    dom.window.document
      .querySelector("input[type=password]")!
      .getAttribute("value"),
  ).toBeNull();
  expect(
    (
      dom.window.document.querySelector(
        "input[type=password]",
      ) as HTMLInputElement
    ).value,
  ).toBe('p"</script>😀');
  expect(events).toEqual(["input", "change", "input", "change"]);
  dom.window.close();
});
it("refuses navigation changes, unsafe actions, ambiguous and unsupported forms", () => {
  for (const [html, result] of [
    [
      '<form action="https://evil.test"><input type="password"></form>',
      "unsafe-form",
    ],
    ['<input type="password"><input type="password">', "ambiguous"],
    ['<input type="password" disabled>', "missing"],
    ['<input type="password" autocomplete="new-password">', "missing"],
    ["<iframe></iframe>", "missing"],
  ]) {
    const { dom, fill } = page(html);
    expect(fill()).toBe(result);
    dom.window.close();
  }
  const { dom, fill } = page('<input type="password">');
  expect(fill({ url: "https://example.com/elsewhere" })).toBe("changed");
  expect(fill({ origin: "https://evil.test" })).toBe("changed");
  dom.window.close();
});
it("supports the username step of multi-page logins", () => {
  const { dom, fill } = page('<input type="email" autocomplete="username">');
  expect(fill()).toBe("username-only");
  expect(dom.window.document.querySelector("input")!.value).toBe("alice");
  dom.window.close();
});
