export type StartupOpenMode = "yes" | "no" | "minimized";

export type AppSettings = {
  startupOpenMode: StartupOpenMode;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  startupOpenMode: "no",
};
