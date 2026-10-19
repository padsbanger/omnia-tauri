import { describe, expect, it } from "vitest";
import isExternalUrl, { getExternalUrlTarget } from "./isExternalUrl";
import { GOOGLE_HOSTS } from "../auth_hosts";
describe("external navigation policy", () => {
  it("keeps Gmail's YouTube account continuation in the originating route", () => {
    const inbox = "https://mail.google.com/mail/u/0/#inbox";
    const session = `https://accounts.youtube.com/accounts/SetSID?continue=${encodeURIComponent(inbox)}`;
    const login = `https://mail.google.com/mail/?continue=${encodeURIComponent(session)}`;
    for (const url of [login, session, inbox]) {
      expect(getExternalUrlTarget(url, GOOGLE_HOSTS)).toBeNull();
    }
    for (const url of [
      "https://www.youtube.com/watch?v=fixture",
      "https://accounts.youtube.com.evil.test/accounts/SetSID",
      "https://evilaccounts.youtube.com/accounts/SetSID",
    ]) {
      expect(getExternalUrlTarget(url, GOOGLE_HOSTS)).toBe(url);
    }
    expect(getExternalUrlTarget(session, ["example.com"])).toBe(session);
  });
  it("keeps Google sign-in continuation parameters inside an authorized route", () => {
    const url =
      "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fcallback.example%2Fcomplete";
    expect(getExternalUrlTarget(url, ["google.com"])).toBeNull();
    expect(getExternalUrlTarget(url, ["unrelated.example"])).toBe(url);
  });
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
