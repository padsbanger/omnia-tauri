import isGoogleOAuthPopupUrl from "./isGoogleOAuthPopupUrl";
import isGoogleAccountUrl from "./isGoogleAccountUrl";

function matchesHostname(hostname: string, allowedHost: string): boolean {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function isInternalHostname(
  hostname: string,
  internalHosts: string[],
): boolean {
  return internalHosts.some((allowedHost) =>
    matchesHostname(hostname, allowedHost.toLowerCase()),
  );
}

function isInternalUrl(url: URL, internalHosts: string[]): boolean {
  return (
    isInternalHostname(url.hostname.toLowerCase(), internalHosts) ||
    (isGoogleAccountUrl(url) &&
      isInternalHostname("accounts.google.com", internalHosts))
  );
}

function getWrappedExternalTarget(
  parsedUrl: URL,
  internalHosts: string[],
): string | null {
  const candidateParams = [
    "url",
    "u",
    "q",
    "target",
    "dest",
    "destination",
    "redirect",
    "redirect_url",
    "redirect_uri",
    "continue",
  ];

  for (const param of candidateParams) {
    const rawValue = parsedUrl.searchParams.get(param);
    if (!rawValue) continue;

    try {
      const targetUrl = new URL(rawValue);

      if (["http:", "https:", "mailto:", "tel:"].includes(targetUrl.protocol)) {
        if (
          ["mailto:", "tel:"].includes(targetUrl.protocol) ||
          !isInternalUrl(targetUrl, internalHosts)
        ) {
          return targetUrl.toString();
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function getExternalUrlTarget(
  url: string,
  internalHosts: string[] = [],
): string | null {
  try {
    const parsed = new URL(url);

    if (["mailto:", "tel:"].includes(parsed.protocol)) {
      return parsed.toString();
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    if (!isInternalUrl(parsed, internalHosts)) {
      return parsed.toString();
    }

    if (isGoogleOAuthPopupUrl(url)) return null;

    return getWrappedExternalTarget(parsed, internalHosts);
  } catch {
    return null;
  }
}

// Helper to determine if URL should be opened externally
function isExternalUrl(url: string, internalHosts: string[] = []): boolean {
  return getExternalUrlTarget(url, internalHosts) !== null;
}

export default isExternalUrl;
