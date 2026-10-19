import { describe, expect, it } from "vitest";
import isExternalUrl, { getExternalUrlTarget } from "./isExternalUrl";
describe("external navigation policy", () => {
  it("uses boundary-safe hostnames and rejects executable schemes", () => {
    expect(isExternalUrl("https://mail.google.com", ["google.com"])).toBe(
      false,
    );
    expect(isExternalUrl("https://evilgoogle.com", ["google.com"])).toBe(true);
    for (const url of ["javascript:alert(1)", "file:///test", "not a url"])
      expect(getExternalUrlTarget(url)).toBeNull();
    expect(getExternalUrlTarget("mailto:a@example.com")).toBe(
      "mailto:a@example.com",
    );
    expect(getExternalUrlTarget("https://example.com")).toBe(
      "https://example.com/",
    );
  });
  it("unwraps external targets but keeps internal and malformed redirect parameters", () => {
    expect(
      getExternalUrlTarget("https://google.com/?url=https://example.com", [
        "google.com",
      ]),
    ).toBe("https://example.com/");
    expect(
      getExternalUrlTarget(
        "https://google.com/?url=bad&u=mailto:a@example.com",
        ["google.com"],
      ),
    ).toBe("mailto:a@example.com");
    expect(
      getExternalUrlTarget(
        "https://google.com/?url=javascript:alert(1)&u=https://mail.google.com",
        ["google.com"],
      ),
    ).toBeNull();
  });
});
