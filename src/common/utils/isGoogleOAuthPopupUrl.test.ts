import { describe, expect, it } from "vitest";
import isGoogleOAuthPopupUrl from "./isGoogleOAuthPopupUrl";

describe("isGoogleOAuthPopupUrl", () => {
  it.each([
    "https://accounts.google.com/o/oauth2/v2/auth",
    "https://accounts.googleapis.com/gsi/client",
    "https://accounts.googleusercontent.com/RotateCookiesPage",
  ])("recognizes supported Google OAuth URLs: %s", (url) => {
    expect(isGoogleOAuthPopupUrl(url)).toBe(true);
  });

  it.each([
    "https://accounts.google.com/account",
    "https://example.com/o/oauth2/auth",
    "not a URL",
  ])("rejects URLs that are not supported Google OAuth popups: %s", (url) => {
    expect(isGoogleOAuthPopupUrl(url)).toBe(false);
  });
});
