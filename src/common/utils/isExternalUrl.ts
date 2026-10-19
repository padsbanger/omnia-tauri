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
          !isInternalHostname(targetUrl.hostname.toLowerCase(), internalHosts)
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

    const hostname = parsed.hostname.toLowerCase();
    if (!isInternalHostname(hostname, internalHosts)) {
      return parsed.toString();
    }

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
