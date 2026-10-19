import { native } from "../native";
import { Button, Description, Label } from "@heroui/react";
import { useEffect, useState } from "react";
import { type AppSettings, type StartupOpenMode } from "../../common/settings";

type SettingsDrawerProps = {
  closeDrawer: () => void;
};

const STARTUP_OPTIONS: Array<{
  value: StartupOpenMode;
  label: string;
  description: string;
}> = [
  {
    value: "yes",
    label: "Yes",
    description: "Launch Omnia automatically when you sign in.",
  },
  {
    value: "no",
    label: "No",
    description: "Do not open Omnia automatically on system startup.",
  },
  {
    value: "minimized",
    label: "Minimized",
    description: "Launch Omnia on sign-in and keep the window minimized.",
  },
];

const SettingsDrawer = ({ closeDrawer }: SettingsDrawerProps) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [available, setAvailable] = useState(false);
  const [websitePermissions, setWebsitePermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void native
      .settings()
      .then((nextSettings) => {
        if (isMounted) {
          setSettings(nextSettings);
          setAvailable(nextSettings.autostartAvailable);
          setWebsitePermissions(Boolean(nextSettings.websitePermissions));
        }
      })
      .catch((e) => setError(String(e)));

    return () => {
      isMounted = false;
    };
  }, []);

  const handleStartupModeChange = async (mode: StartupOpenMode) => {
    setIsSaving(true);

    try {
      const nextSettings = await native.startup(mode);
      setSettings(nextSettings);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white text-slate-950">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-950">Settings</h2>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
        {error && <p role="alert">{error}</p>}
        {!available && <p>Autostart is unavailable in development builds.</p>}
        <p className="text-sm text-slate-500">
          {websitePermissions
            ? "Camera, microphone and website notifications are restricted to trusted route origins. Hardware capture and notification delivery need provider verification."
            : "Camera, microphone and website notification permissions are unavailable on this engine."}{" "}
          Per-route memory is unavailable. DRM playback requires provider
          verification.
        </p>
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-1">
            <Label>Startup and window behavior</Label>
            <Description>
              Choose what Omnia should do when your system starts.
            </Description>
          </div>

          <div className="flex flex-col gap-3">
            {STARTUP_OPTIONS.map((option) => {
              const isSelected = settings?.startupOpenMode === option.value;

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  } ${isSaving ? "opacity-70" : "opacity-100"}`}
                >
                  <input
                    type="radio"
                    name="startupOpenMode"
                    className="mt-1"
                    checked={isSelected}
                    disabled={isSaving || settings === null || !available}
                    onChange={() => void handleStartupModeChange(option.value)}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-sm text-slate-500">
                      {option.description}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <div className="mt-auto flex justify-end">
          <Button
            type="button"
            className="border border-slate-200 bg-white text-slate-700"
            onClick={closeDrawer}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDrawer;
