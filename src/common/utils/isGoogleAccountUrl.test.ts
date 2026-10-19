import { describe, expect, it } from "vitest";
import accountHosts from "../google_account_hosts.json";
import { GOOGLE_HOSTS } from "../auth_hosts";
import isGoogleAccountUrl from "./isGoogleAccountUrl";
import isGoogleOAuthPopupUrl from "./isGoogleOAuthPopupUrl";
import { getExternalUrlTarget } from "./isExternalUrl";

describe("pinned Google account hosts", () => {
  it("keeps verified regional account steps in Google-enabled routes only", () => {
    for (const host of accountHosts.hosts) {
      const url = `https://${host}/accounts/SetSID?continue=https%3A%2F%2Fcallback.example%2Fcomplete`;
      expect(isGoogleAccountUrl(new URL(url))).toBe(true);
      expect(isGoogleOAuthPopupUrl(url)).toBe(true);
      expect(getExternalUrlTarget(url, GOOGLE_HOSTS)).toBeNull();
      expect(getExternalUrlTarget(url, ["example.com"])).toBe(url);
    }
  });

  it.each([
    "http://accounts.google.pl/accounts/SetSID",
    "https://accounts.google.pl:444/accounts/SetSID",
    "https://user@accounts.google.pl/accounts/SetSID",
    "https://:password@accounts.google.pl/accounts/SetSID",
    "https://accounts.google.pl.evil.test/accounts/SetSID",
    "https://evilaccounts.google.pl/accounts/SetSID",
    "https://sub.accounts.google.pl/accounts/SetSID",
    "https://accounts.google.invalid/accounts/SetSID",
    "https://www.google.pl/accounts/SetSID",
  ])("does not treat %s as a verified account endpoint", (url) => {
    expect(isGoogleAccountUrl(new URL(url))).toBe(false);
    expect(isGoogleOAuthPopupUrl(url)).toBe(false);
  });

  it("retains the nested Polish continuation while ordinary regional links remain external", () => {
    const regional = "https://accounts.google.pl/accounts/SetSID?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F";
    const login = `https://mail.google.com/mail/?continue=${encodeURIComponent(regional)}`;
    expect(getExternalUrlTarget(login, GOOGLE_HOSTS)).toBeNull();
    for (const url of ["https://www.google.pl/", "https://accounts.google.invalid/", "https://sub.accounts.google.pl/"]) {
      expect(getExternalUrlTarget(url, GOOGLE_HOSTS)).toBe(url);
    }
  });
});
