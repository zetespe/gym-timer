// Shared keep-the-screen-on helper (like src/audio.js is for sounds).
// The browser releases a wake lock whenever the page is hidden, so it must be
// re-acquired on visibilitychange; both the timer and the session view need
// exactly this dance.
import { useCallback, useEffect, useRef, useState } from "react";

export const wakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

// Holds a screen wake lock while `enabled` and the page is visible; releases
// it when disabled or unmounted. Returns whether the lock is currently held.
export function useWakeLock(enabled) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);

  const request = useCallback(async () => {
    if (!wakeLockSupported) return;
    try {
      ref.current = await navigator.wakeLock.request("screen");
      setActive(true);
      ref.current.addEventListener("release", () => setActive(false));
    } catch (e) {
      setActive(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    request();
    const vis = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      try { if (ref.current) ref.current.release(); } catch (e) {}
      ref.current = null;
      setActive(false);
    };
  }, [enabled, request]);

  return active;
}
