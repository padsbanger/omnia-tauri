export const MAX_FAVICON_URL_LENGTH = 4096;
const SAFE_FAVICON_PROTOCOLS = new Set(["http:", "https:"]);

const parseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const hasCredentials = (url: URL) => [url.username, url.password].some(Boolean);

const normalizeSafeFaviconUrl = (value: string) => {
  if (value.length > MAX_FAVICON_URL_LENGTH) {
    return undefined;
  }

  const url = parseUrl(value);
  if (!url) {
    return undefined;
  }

  if (!SAFE_FAVICON_PROTOCOLS.has(url.protocol)) {
    return undefined;
  }

  if (hasCredentials(url)) {
    return undefined;
  }

  const normalizedUrl = url.toString();
  return normalizedUrl.length <= MAX_FAVICON_URL_LENGTH
    ? normalizedUrl
    : undefined;
};

export const isSafeFaviconUrl = (value: string) =>
  normalizeSafeFaviconUrl(value) !== undefined;

export const getSafeFaviconUrl = (favicons: readonly string[]) => {
  for (const favicon of favicons) {
    const safeUrl = normalizeSafeFaviconUrl(favicon);
    if (safeUrl) {
      return safeUrl;
    }
  }

  return undefined;
};
