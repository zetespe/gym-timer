// Shared keep-the-screen-on helper (like src/audio.js is for sounds).
// The browser releases a wake lock whenever the page is hidden, so it must be
// re-acquired on visibilitychange; both the timer and the session view need
// exactly this dance.
import { useEffect, useRef, useState } from "react";

export const wakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

// Holds a screen wake lock while `enabled` and the page is visible; releases
// it when disabled or unmounted. Returns whether the lock is currently held.
export function useWakeLock(enabled) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // The request is async: it can resolve after this effect was cleaned up
    // (unmount, `enabled` flip), and a stale resolution must not overwrite or
    // outlive the current lock — release it instead of storing it.
    let alive = true;
    const request = async () => {
      if (!wakeLockSupported) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!alive) { try { lock.release(); } catch (e) {} return; }
        try { if (ref.current) ref.current.release(); } catch (e) {}
        ref.current = lock;
        setActive(true);
        lock.addEventListener("release", () => { if (alive) setActive(false); });
      } catch (e) {
        if (alive) setActive(false);
      }
    };
    request();
    const vis = () => { if (document.visibilityState === "visible") request(); };
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", vis);
      try { if (ref.current) ref.current.release(); } catch (e) {}
      ref.current = null;
      setActive(false);
    };
  }, [enabled]);

  return active;
}
