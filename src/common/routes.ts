export type RouteMemoryUsage = {
  privateSize: number;
  sharedSize: number;
  residentSet: number;
  heapSizeLimit: number;
  usedHeapSize: number;
};

export type Route = {
  path: string;
  id: string;
  icon: string;
  faviconUrl?: string;
  label: string;
  loadURL: string;
  partition: string;
  isHibernated?: boolean;
  internalHosts?: string[];
  openExternalLinksInBrowser?: boolean;
  zoomLevel?: number;
  memoryUsage?: RouteMemoryUsage;
};
