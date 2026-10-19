import { TWITTER_HOSTS, GOOGLE_HOSTS } from "../auth_hosts";
import { Route } from "../routes";

const getInternalHostsForRoute = (route: Route): string[] => {
  const baseHosts = route.internalHosts ?? [new URL(route.loadURL).hostname];
  const mergedHosts = new Set(baseHosts.map((host) => host.toLowerCase()));

  if (route.icon === "twitter") {
    TWITTER_HOSTS.forEach((host) => mergedHosts.add(host));
    GOOGLE_HOSTS.forEach((host) => mergedHosts.add(host));
  }

  if (route.icon === "tradingview") {
    GOOGLE_HOSTS.forEach((host) => mergedHosts.add(host));
  }

  return Array.from(mergedHosts);
};

export default getInternalHostsForRoute;
