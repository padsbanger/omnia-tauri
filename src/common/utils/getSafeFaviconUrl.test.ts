import { describe, expect, it } from "vitest";
import {
  getSafeFaviconUrl,
  isSafeFaviconUrl,
  MAX_FAVICON_URL_LENGTH,
} from "./getSafeFaviconUrl";

describe("getSafeFaviconUrl", () => {
  it("recognizes safe HTTP and HTTPS URLs", () => {
    expect(isSafeFaviconUrl("https://example.com/favicon.ico")).toBe(true);
    expect(isSafeFaviconUrl("http://localhost:3000/favicon.png")).toBe(true);
  });

  it("returns the first normalized HTTP or HTTPS URL", () => {
    expect(
      getSafeFaviconUrl([
        "data:image/png;base64,AAAA",
        "HTTPS://Example.com/favicon.ico",
        "https://cdn.example.com/ignored.png",
      ]),
    ).toBe("https://example.com/favicon.ico");
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "blob:https://example.com/id",
    "file:///tmp/favicon.ico",
    "not a URL",
  ])("rejects unsafe or malformed URL %s", (favicon) => {
    expect(getSafeFaviconUrl([favicon])).toBeUndefined();
  });

  it("rejects URLs containing credentials", () => {
    expect(
      getSafeFaviconUrl(["https://user:secret@example.com/favicon.ico"]),
    ).toBeUndefined();
  });

  it("rejects URLs longer than the configured limit", () => {
    const oversizedUrl = `https://example.com/${"a".repeat(
      MAX_FAVICON_URL_LENGTH,
    )}`;

    expect(oversizedUrl.length).toBeGreaterThan(MAX_FAVICON_URL_LENGTH);
    expect(getSafeFaviconUrl([oversizedUrl])).toBeUndefined();
  });

  it("rejects URLs whose normalized form exceeds the configured limit", () => {
    const urlWithEncodedGrowth = `https://example.com/${"a ".repeat(1400)}a`;

    expect(urlWithEncodedGrowth.length).toBeLessThan(MAX_FAVICON_URL_LENGTH);
    expect(isSafeFaviconUrl(urlWithEncodedGrowth)).toBe(false);
  });

  it("returns undefined when no favicon candidates are available", () => {
    expect(getSafeFaviconUrl([])).toBeUndefined();
  });
});
