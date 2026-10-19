import accountHosts from "../google_account_hosts.json";

const hosts = new Set(accountHosts.hosts);

export default function isGoogleAccountUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    (!url.port || url.port === "443") &&
    !url.username &&
    !url.password &&
    hosts.has(url.hostname)
  );
}
