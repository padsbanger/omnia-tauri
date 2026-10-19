import isGoogleAccountUrl from "./isGoogleAccountUrl";

const isSecureOrigin = (url: URL) =>
  url.protocol === "https:" &&
  (!url.port || url.port === "443") &&
  ![url.username, url.password].some(Boolean);

const isGoogleOAuthPopupUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (isGoogleAccountUrl(parsed)) return true;

    const trustedHost = [
      "google.com",
      "googleapis.com",
      "googleusercontent.com",
    ].some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (!trustedHost || !isSecureOrigin(parsed)) {
      return false;
    }

    return ["/o/oauth2/", "/gsi/", "RotateCookiesPage"].some((path) =>
      parsed.pathname.includes(path),
    );
  } catch {
    return false;
  }
};

export default isGoogleOAuthPopupUrl;
