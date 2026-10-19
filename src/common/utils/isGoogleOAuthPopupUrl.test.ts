import { describe, expect, it } from "vitest";
import isGoogleOAuthPopupUrl from "./isGoogleOAuthPopupUrl";

describe("isGoogleOAuthPopupUrl", () => {
  it.each([
    "https://accounts.google.com/o/oauth2/v2/auth",
    "https://accounts.googleapis.com/gsi/client",
    "https://accounts.googleusercontent.com/RotateCookiesPage",
    "https://accounts.google.com/ServiceLogin",
    "https://accounts.google.com/AccountChooser",
    "https://accounts.google.com/v3/signin/identifier",
    "https://accounts.google.com/account",
  ])("recognizes supported Google OAuth URLs: %s", (url) => {
    expect(isGoogleOAuthPopupUrl(url)).toBe(true);
  });

  it.each([
    "http://accounts.google.com/ServiceLogin",
    "https://accounts.google.com:444/ServiceLogin",
    "https://user:pass@accounts.google.com/ServiceLogin",
    "https://accounts.google.com.evil.test/ServiceLogin",
    "https://example.com/o/oauth2/auth",
    "not a URL",
  ])("rejects URLs that are not supported Google OAuth popups: %s", (url) => {
    expect(isGoogleOAuthPopupUrl(url)).toBe(false);
  });
});
