import { CSSProperties, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { native } from "../native";

import omniaLogo from "../../assets/icon-square.png";

type AuthScreenProps = {
  hasCachedRoutes?: boolean;
  onContinueOffline?: () => void;
};

const AuthScreen = ({
  hasCachedRoutes = false,
  onContinueOffline,
}: AuthScreenProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        delay: `${Math.random() * -28}s`,
        duration: `${18 + Math.random() * 24}s`,
        left: `${Math.random() * 100}%`,
        size: `${2 + Math.random() * 4}px`,
        top: `${Math.random() * 100}%`,
        travelX: `${(Math.random() - 0.5) * 180}px`,
        travelY: `${-120 - Math.random() * 220}px`,
        color:
          index % 3 === 0
            ? "rgba(97, 240, 255, 0.7)"
            : index % 3 === 1
              ? "rgba(124, 72, 255, 0.62)"
              : "rgba(231, 43, 255, 0.58)",
      })),
    [],
  );

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await native.login();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Authentication failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="omnia-auth-background relative flex h-full w-full items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="omnia-auth-particle"
            style={
              {
                "--particle-color": particle.color,
                "--particle-size": particle.size,
                "--particle-travel-x": particle.travelX,
                "--particle-travel-y": particle.travelY,
                animationDelay: particle.delay,
                animationDuration: particle.duration,
                left: particle.left,
                top: particle.top,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <section className="relative z-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <img
              src={omniaLogo}
              alt="Omnia"
              className="h-11 w-11 rounded-lg border border-slate-200 bg-white"
            />
            <div>
              <h1 className="text-xl font-semibold text-slate-950">Omnia</h1>
              <p className="mt-1 text-sm text-slate-500">
                Sign in to continue to your workspace.
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              type="button"
              className="bg-blue-600 font-medium text-white"
              isDisabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? "Opening Authentik..." : "Sign in"}
            </Button>
            <Button
              onClick={() =>
                void native.cancelLogin().catch((e) => setError(String(e)))
              }
              className="border border-slate-300 bg-white text-slate-700"
            >
              Cancel sign-in
            </Button>
            {hasCachedRoutes && onContinueOffline && (
              <Button
                type="button"
                className="border border-slate-300 bg-white font-medium text-slate-700"
                onClick={onContinueOffline}
              >
                Use saved routes offline
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default AuthScreen;
