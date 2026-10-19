const isGoogleOAuthPopupUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    const trustedHost = [
      "google.com",
      "googleapis.com",
      "googleusercontent.com",
    ].some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (!trustedHost || parsed.protocol !== "https:") {
      return false;
    }

    return (
      parsed.pathname.includes("/o/oauth2/") ||
      parsed.pathname.includes("/gsi/") ||
      parsed.pathname.includes("RotateCookiesPage")
    );
  } catch {
    return false;
  }
};

export default isGoogleOAuthPopupUrl;
