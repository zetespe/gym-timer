import { useState, useRef, useCallback, useEffect } from "react";

const PHASE_IDLE = "idle";
const PHASE_HOLD = "hold";
const PHASE_SWAP = "swap";
const PHASE_COUNTDOWN = "countdown";

function beep(freq = 880, duration = 150, vol = 0.5) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.stop(ctx.currentTime + duration / 1000 + 0.05);
  } catch (e) {}
}

function doubleBeep() {
  beep(1100, 120, 0.6);
  setTimeout(() => beep(1100, 120, 0.6), 180);
}

function tripleBeep() {
  beep(1320, 100, 0.7);
  setTimeout(() => beep(1320, 100, 0.7), 150);
  setTimeout(() => beep(1320, 100, 0.7), 300);
}

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.pitch = 0.9;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

export default function GymTimer() {
  const [holdTime, setHoldTime] = useState(20);
  const [swapTime, setSwapTime] = useState(4);
  const [phase, setPhase] = useState(PHASE_IDLE);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rep, setRep] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  const intervalRef = useRef(null);
  const phaseRef = useRef(PHASE_IDLE);
  const timeRef = useRef(0);
  const repRef = useRef(0);
  const wakeLockRef = useRef(null);

  const wakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  const requestWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener("release", () => setWakeLockActive(false));
    } catch (e) {
      setWakeLockActive(false);
    }
  }, [wakeLockSupported]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch (e) {}
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, []);

  // Re-acquire wake lock when tab becomes visible again (browser releases it on tab switch)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && phaseRef.current !== PHASE_IDLE) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [requestWakeLock]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    releaseWakeLock();
    setDimmed(false);
  }, [releaseWakeLock]);

  useEffect(() => () => cleanup(), [cleanup]);

  const startHoldPhase = useCallback(() => {
    const newRep = repRef.current + 1;
    repRef.current = newRep;
    setRep(newRep);
    setTotalReps((p) => Math.max(p, newRep));
    phaseRef.current = PHASE_HOLD;
    setPhase(PHASE_HOLD);
    timeRef.current = holdTime;
    setTimeLeft(holdTime);
    tripleBeep();
    setTimeout(() => speak(`Rep ${newRep}. Go!`), 350);
  }, [holdTime]);

  const startSwapPhase = useCallback(() => {
    phaseRef.current = PHASE_SWAP;
    setPhase(PHASE_SWAP);
    timeRef.current = swapTime;
    setTimeLeft(swapTime);
    doubleBeep();
    setTimeout(() => speak("Switch!"), 200);
  }, [swapTime]);

  const tick = useCallback(() => {
    const newTime = timeRef.current - 1;
    timeRef.current = newTime;
    setTimeLeft(newTime);

    if (phaseRef.current === PHASE_HOLD) {
      if (newTime === 3) beep(660, 80, 0.3);
      if (newTime === 2) beep(660, 80, 0.3);
      if (newTime === 1) beep(660, 80, 0.3);
    }

    if (newTime <= 0) {
      if (phaseRef.current === PHASE_HOLD) {
        startSwapPhase();
      } else if (phaseRef.current === PHASE_SWAP) {
        startHoldPhase();
      } else if (phaseRef.current === PHASE_COUNTDOWN) {
        startHoldPhase();
      }
    }
  }, [startSwapPhase, startHoldPhase]);

  const handleStart = useCallback(() => {
    cleanup();
    requestWakeLock();
    repRef.current = 0;
    setRep(0);
    setTotalReps(0);
    phaseRef.current = PHASE_COUNTDOWN;
    setPhase(PHASE_COUNTDOWN);
    timeRef.current = 3;
    setTimeLeft(3);
    speak("Get ready!");
    beep(440, 100, 0.3);
    intervalRef.current = setInterval(tick, 1000);
  }, [cleanup, tick, requestWakeLock]);

  const handleStop = useCallback(() => {
    cleanup();
    phaseRef.current = PHASE_IDLE;
    setPhase(PHASE_IDLE);
    speak("Done!");
    doubleBeep();
  }, [cleanup]);

  const handleTestSound = useCallback(() => {
    beep(880, 150, 0.5);
    setTimeout(() => speak("Sound check. Ready to go!"), 200);
  }, []);

  const isRunning = phase !== PHASE_IDLE;

  const phaseLabel =
    phase === PHASE_HOLD
      ? "HOLD"
      : phase === PHASE_SWAP
      ? "SWITCH"
      : phase === PHASE_COUNTDOWN
      ? "READY"
      : "";

  const phaseColor =
    phase === PHASE_HOLD
      ? "#FF3B30"
      : phase === PHASE_SWAP
      ? "#30D158"
      : phase === PHASE_COUNTDOWN
      ? "#FFD60A"
      : "#666";

  const progressPct =
    phase === PHASE_HOLD
      ? ((holdTime - timeLeft) / holdTime) * 100
      : phase === PHASE_SWAP
      ? ((swapTime - timeLeft) / swapTime) * 100
      : phase === PHASE_COUNTDOWN
      ? ((3 - timeLeft) / 3) * 100
      : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#E5E5E5",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Dim overlay for pocket mode */}
      {dimmed && (
        <div
          onClick={() => setDimmed(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <div style={{ color: "#222", fontSize: "12px", letterSpacing: "3px", textAlign: "center" }}>
            TAP TO WAKE
          </div>
        </div>
      )}

      {/* Ambient glow */}
      {isRunning && (
        <div
          style={{
            position: "absolute",
            top: "-50%",
            left: "-50%",
            width: "200%",
            height: "200%",
            background: `radial-gradient(circle at 50% 60%, ${phaseColor}08 0%, transparent 50%)`,
            pointerEvents: "none",
            transition: "background 0.5s ease",
          }}
        />
      )}

      {/* Header */}
      <div
        style={{
          fontSize: "11px",
          letterSpacing: "6px",
          textTransform: "uppercase",
          color: "#555",
          marginBottom: "8px",
        }}
      >
        GYM TIMER
      </div>

      {/* Rep counter */}
      {isRunning && phase !== PHASE_COUNTDOWN && (
        <div
          style={{
            fontSize: "14px",
            letterSpacing: "3px",
            color: "#888",
            marginBottom: "24px",
          }}
        >
          REP {rep}
        </div>
      )}

      {/* Phase label */}
      <div
        style={{
          fontSize: "clamp(18px, 5vw, 28px)",
          fontWeight: 700,
          letterSpacing: "8px",
          color: isRunning ? phaseColor : "#333",
          marginBottom: "12px",
          transition: "color 0.3s ease",
          minHeight: "36px",
        }}
      >
        {phaseLabel}
      </div>

      {/* Big timer */}
      <div
        style={{
          fontSize: "clamp(100px, 30vw, 180px)",
          fontWeight: 800,
          lineHeight: 1,
          color: isRunning ? "#FFF" : "#222",
          transition: "color 0.3s ease",
          marginBottom: "16px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {isRunning ? timeLeft : holdTime}
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "min(80%, 360px)",
          height: "4px",
          background: "#1A1A1A",
          borderRadius: "2px",
          overflow: "hidden",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${isRunning ? progressPct : 0}%`,
            background: phaseColor,
            borderRadius: "2px",
            transition: "width 0.3s linear, background 0.5s ease",
          }}
        />
      </div>

      {/* Settings (only when idle) */}
      {!isRunning && (
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginBottom: "36px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <SettingControl
            label="HOLD"
            unit="sec"
            value={holdTime}
            onChange={setHoldTime}
            min={5}
            max={120}
            step={5}
            color="#FF3B30"
          />
          <SettingControl
            label="SWAP"
            unit="sec"
            value={swapTime}
            onChange={setSwapTime}
            min={2}
            max={15}
            step={1}
            color="#30D158"
          />
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
        {!isRunning ? (
          <>
            <button onClick={handleStart} style={btnStyle("#FF3B30")}>
              START
            </button>
            <button onClick={handleTestSound} style={btnStyle("#333", "#999")}>
              TEST SOUND
            </button>
          </>
        ) : (
          <>
            <button onClick={handleStop} style={btnStyle("#333", "#FF3B30")}>
              STOP
            </button>
            <button onClick={() => setDimmed(true)} style={btnStyle("#111", "#666")}>
              POCKET MODE
            </button>
          </>
        )}
      </div>

      {/* Wake lock status */}
      {isRunning && (
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: wakeLockActive ? "#30D158" : "#666",
            letterSpacing: "1px",
          }}
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: wakeLockActive ? "#30D158" : "#666",
            }}
          />
          {wakeLockActive ? "SCREEN KEPT ON" : wakeLockSupported ? "WAKE LOCK UNAVAILABLE" : "WAKE LOCK NOT SUPPORTED"}
        </div>
      )}

      {/* Summary when stopped after reps */}
      {!isRunning && totalReps > 0 && (
        <div
          style={{
            marginTop: "32px",
            padding: "16px 24px",
            background: "#111",
            borderRadius: "8px",
            border: "1px solid #222",
            textAlign: "center",
          }}
        >
          <span style={{ color: "#888", fontSize: "12px", letterSpacing: "2px" }}>
            COMPLETED{" "}
          </span>
          <span style={{ color: "#FFF", fontSize: "20px", fontWeight: 700 }}>
            {totalReps}
          </span>
          <span style={{ color: "#888", fontSize: "12px", letterSpacing: "2px" }}>
            {" "}REPS
          </span>
        </div>
      )}

      {/* Tip */}
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "11px",
          color: "#444",
          textAlign: "center",
          letterSpacing: "1px",
        }}
      >
        Audio cues play over headphones — use Pocket Mode to save battery
      </div>
    </div>
  );
}

function SettingControl({ label, unit, value, onChange, min, max, step, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "3px",
          color: "#666",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          style={smallBtnStyle}
        >
          −
        </button>
        <div>
          <span style={{ fontSize: "28px", fontWeight: 700, color: "#FFF" }}>{value}</span>
          <span style={{ fontSize: "11px", color: "#666", marginLeft: "4px" }}>{unit}</span>
        </div>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          style={smallBtnStyle}
        >
          +
        </button>
      </div>
    </div>
  );
}

const btnStyle = (bg, textColor) => ({
  padding: "16px 40px",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "4px",
  fontFamily: "inherit",
  background: bg,
  color: textColor || "#FFF",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "opacity 0.2s",
});

const smallBtnStyle = {
  width: "36px",
  height: "36px",
  fontSize: "18px",
  fontWeight: 700,
  fontFamily: "inherit",
  background: "#1A1A1A",
  color: "#999",
  border: "1px solid #333",
  borderRadius: "6px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};
