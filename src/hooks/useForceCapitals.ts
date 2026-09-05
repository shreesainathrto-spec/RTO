import { useSyncExternalStore } from "react";
import { getForceCapsSetting } from "@/lib/capitalize-settings";

/**
 * Reactive hook that returns the current "Force Capital Letters" setting.
 * Subscribes to the "force-caps-changed" custom event dispatched by Settings
 * and also listens for "storage" events (cross-tab sync).
 *
 * Uses useSyncExternalStore for optimal performance — no unnecessary re-renders.
 */

let cachedValue = getForceCapsSetting();

function subscribe(callback: () => void): () => void {
  const handler = () => {
    cachedValue = getForceCapsSetting();
    callback();
  };
  window.addEventListener("force-caps-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("force-caps-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): boolean {
  return cachedValue;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useForceCapitals(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
