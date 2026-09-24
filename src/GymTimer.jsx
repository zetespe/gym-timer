import { useState, useRef, useCallback, useEffect } from "react";
import { beep, doubleBeep, tripleBeep, speak } from "./audio";
import { useWakeLock, wakeLockSupported } from "./useWakeLock";
import { getState, patch } from "./log/store";

const PHASE_IDLE = "idle";
const PHASE_HOLD = "hold";
const PHASE_SWAP = "swap";
const PHASE_COUNTDOWN = "countdown";
const PHASE_REST = "rest";
const DEFAULTS = { hold: 20, swap: 4, rest: 0, perSet: 2 };

// Phases: HOLD, then SWAP between holds of the same set (e.g. left/right), then
// REST between sets when a rest time is set. With rest = 0 the timer alternates
// hold/swap forever, as it always did.
// `preset` = { hold, swap, rest, perSet, sets } overrides the saved settings (used
// when opened from a timed exercise); `onResult({ holds, sets, hold, perSet, partial })`
// is called on STOP or when the preset number of sets is complete. `sets` counts
// only fully completed sets; `partial` is the length in seconds of one extra,
// incomplete set to log (0 when there is none).
export default function GymTimer({ preset, onResult } = {}) {
  const saved = Object.assign({}, DEFAULTS, getState().settings.timer || {});
  const [holdTime, setHoldTimeRaw] = useState(preset?.hold ?? saved.hold);
  const [swapTime, setSwapTimeRaw] = useState(preset?.swap ?? saved.swap);
  const [restTime, setRestTimeRaw] = useState(preset?.rest ?? saved.rest);
  const [perSet, setPerSetRaw] = useState(preset?.perSet ?? saved.perSet);
  const targetSets = preset?.sets || 0;
  const persist = (k, v) => { if (!preset) patch((st) => { st.settings.timer = Object.assign({}, DEFAULTS, st.settings.timer || {}, { [k]: v }); }); };
  const setHoldTime = (v) => { setHoldTimeRaw(v); persist("hold", v); };
  const setSwapTime = (v) => { setSwapTimeRaw(v); persist("swap", v); };
  const setRestTime = (v) => { setRestTimeRaw(v); persist("rest", v); };
  const setPerSet = (v) => { setPerSetRaw(v); persist("perSet", v); };
  const [setNo, setSetNo] = useState(0);
  const [holdInSet, setHoldInSet] = useState(0);
  const setRef = useRef(0);
  const holdInSetRef = useRef(0);
  const finishRef = useRef(() => {});
  const [phase, setPhase] = useState(PHASE_IDLE);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rep, setRep] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  const [dimmed, setDimmed] = useState(false);
  const intervalRef = useRef(null);
  const phaseRef = useRef(PHASE_IDLE);
  const timeRef = useRef(0);
  const repRef = useRef(0);

  const wakeLockActive = useWakeLock(phase !== PHASE_IDLE);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDimmed(false);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Set mode: a rest between sets, or a preset number of sets (opened from a
  // session). A preset with rest 0 runs the sets back to back, a short swap
  // between them, and still stops after the last set.
  const usesSets = restTime > 0 || targetSets > 0;

  const startHoldPhase = useCallback(() => {
    const newRep = repRef.current + 1;
    repRef.current = newRep;
    setRep(newRep);
    setTotalReps((p) => Math.max(p, newRep));
    if (usesSets && holdInSetRef.current === 0) { setRef.current += 1; setSetNo(setRef.current); }
    holdInSetRef.current += 1;
    setHoldInSet(holdInSetRef.current);
    phaseRef.current = PHASE_HOLD;
    setPhase(PHASE_HOLD);
    timeRef.current = holdTime;
    setTimeLeft(holdTime);
    tripleBeep();
    const label = usesSets ? (perSet > 1 ? `Set ${setRef.current}, ${holdInSetRef.current === 1 ? "first side" : "other side"}` : `Set ${setRef.current}`) : `Rep ${newRep}`;
    setTimeout(() => speak(`${label}. Go!`), 350);
  }, [holdTime, usesSets, perSet]);

  const startRestPhase = useCallback(() => {
    holdInSetRef.current = 0;
    phaseRef.current = PHASE_REST;
    setPhase(PHASE_REST);
    timeRef.current = restTime;
    setTimeLeft(restTime);
    doubleBeep();
    setTimeout(() => speak(`Rest. ${restTime} seconds.`), 200);
  }, [restTime]);

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

    if (phaseRef.current === PHASE_HOLD || phaseRef.current === PHASE_REST) {
      if (newTime === 3) beep(660, 80, 0.3);
      if (newTime === 2) beep(660, 80, 0.3);
      if (newTime === 1) beep(660, 80, 0.3);
    }
    // Long rests get a spoken warning so you can get into position. Short swaps don't.
    if (phaseRef.current === PHASE_REST && newTime === 15 && restTime >= 25) {
      beep(880, 120, 0.4);
      setTimeout(() => speak("15 seconds. Get ready."), 150);
    }

    if (newTime <= 0) {
      if (phaseRef.current === PHASE_HOLD) {
        if (usesSets && holdInSetRef.current >= perSet) {
          if (targetSets && setRef.current >= targetSets) { finishRef.current(true); return; }
          if (restTime > 0) startRestPhase();
          else { holdInSetRef.current = 0; startSwapPhase(); }
        } else {
          startSwapPhase();
        }
      } else if (phaseRef.current === PHASE_SWAP || phaseRef.current === PHASE_REST || phaseRef.current === PHASE_COUNTDOWN) {
        startHoldPhase();
      }
    }
  }, [startSwapPhase, startHoldPhase, startRestPhase, usesSets, perSet, targetSets, restTime]);

  const handleStart = useCallback(() => {
    cleanup();
    repRef.current = 0;
    setRep(0);
    setTotalReps(0);
    setRef.current = 0;
    setSetNo(0);
    holdInSetRef.current = 0;
    phaseRef.current = PHASE_COUNTDOWN;
    setPhase(PHASE_COUNTDOWN);
    timeRef.current = 3;
    setTimeLeft(3);
    speak("Get ready!");
    beep(440, 100, 0.3);
    intervalRef.current = setInterval(tick, 1000);
  }, [cleanup, tick]);

  // `holdComplete` is true when called from the tick at the very end of the last hold.
  const handleStop = useCallback((holdComplete = false) => {
    cleanup();
    const stoppedMidHold = phaseRef.current === PHASE_HOLD && holdComplete !== true;
    const holds = stoppedMidHold ? Math.max(0, repRef.current - 1) : repRef.current;
    // Stopping during a hold (e.g. a dead hang to failure) reports how long that
    // hold lasted, so the real number gets logged instead of nothing.
    const elapsed = stoppedMidHold ? Math.max(0, holdTime - timeRef.current) : 0;
    const per = usesSets ? Math.max(1, perSet) : 1;
    const fullSets = Math.floor(holds / per);
    const sidesDone = holds % per; // holds already finished in the unfinished set
    // One hold per set: an early stop is a set of its own, as long as it was.
    // Several holds per set (left/right): the unfinished set counts only when it
    // was stopped during its last hold, and is logged at that shorter length.
    // Stopping on an earlier side, or in the switch, drops the unfinished set.
    const partial = per === 1 ? elapsed : sidesDone === per - 1 ? elapsed : 0;
    phaseRef.current = PHASE_IDLE;
    setPhase(PHASE_IDLE);
    speak("Done!");
    doubleBeep();
    if (onResult) onResult({ holds, sets: fullSets, hold: holdTime, perSet: per, partial: partial >= 3 ? partial : 0 });
  }, [cleanup, onResult, holdTime, usesSets, perSet]);
  useEffect(() => { finishRef.current = handleStop; }, [handleStop]);

  const handleTestSound = useCallback(() => {
    beep(880, 150, 0.5);
    setTimeout(() => speak("Sound check. Ready to go!"), 200);
  }, []);

  const isRunning = phase !== PHASE_IDLE;

  const phaseLabel =
    phase === PHASE_HOLD
      ? "WORK"
      : phase === PHASE_SWAP
      ? "SWITCH"
      : phase === PHASE_COUNTDOWN
      ? "READY"
      : phase === PHASE_REST
      ? "REST"
      : "";

  const phaseColor =
    phase === PHASE_HOLD
      ? "#FF3B30"
      : phase === PHASE_SWAP
      ? "#30D158"
      : phase === PHASE_COUNTDOWN
      ? "#FFD60A"
      : phase === PHASE_REST
      ? "#64A8FF"
      : "#666";

  const progressPct =
    phase === PHASE_HOLD
      ? ((holdTime - timeLeft) / holdTime) * 100
      : phase === PHASE_SWAP
      ? ((swapTime - timeLeft) / swapTime) * 100
      : phase === PHASE_COUNTDOWN
      ? ((3 - timeLeft) / 3) * 100
      : phase === PHASE_REST
      ? ((restTime - timeLeft) / restTime) * 100
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
          {usesSets ? `SET ${setNo}${targetSets ? ` / ${targetSets}` : ""}${perSet > 1 ? ` · HOLD ${Math.max(1, holdInSet)} / ${perSet}` : ""}` : `REP ${rep}`}
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
            // Fixed 2×2 grid: two controls side by side, two underneath, at
            // any phone width — a wrapping flex row stacked them vertically.
            display: "grid",
            gridTemplateColumns: "repeat(2, max-content)",
            columnGap: "24px",
            rowGap: "28px",
            justifyContent: "center",
            marginBottom: "36px",
          }}
        >
          <SettingControl
            label="WORK"
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
          <SettingControl
            label="REST"
            unit={restTime ? "sec" : "off"}
            value={restTime}
            onChange={setRestTime}
            min={0}
            max={300}
            step={5}
            color="#64A8FF"
          />
          {/* Always rendered as a "ghost" when unused: the 2×2 stays symmetric,
              nothing shifts out from under a press-and-hold when REST toggles,
              and the dimmed control hints that REST unlocks it. */}
          <div style={{ opacity: usesSets ? 1 : 0.32, pointerEvents: usesSets ? "auto" : "none", transition: "opacity 0.3s ease" }} aria-disabled={!usesSets}>
            <SettingControl
              label="PER SET"
              unit=""
              value={perSet}
              onChange={setPerSet}
              min={1}
              max={4}
              step={1}
              color="#64A8FF"
            />
          </div>
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
            <button onClick={() => handleStop(false)} style={btnStyle("#333", "#FF3B30")}>
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

// +/- buttons: a tap moves one step; holding a button repeats, so long ranges
// (REST up to 300 s in 5 s steps) don't need dozens of taps.
function useRepeatPress(fn) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const timers = useRef({ delay: null, repeat: null, repeated: false });
  const stop = () => { clearTimeout(timers.current.delay); clearInterval(timers.current.repeat); };
  // Ending off the button fires no click, so the "swallow next click" flag must go too.
  const abandon = () => { stop(); timers.current.repeated = false; };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return; // primary button / touch / pen only
      stop();
      timers.current.repeated = false;
      timers.current.delay = setTimeout(() => {
        timers.current.repeated = true;
        fnRef.current();
        timers.current.repeat = setInterval(() => fnRef.current(), 90);
      }, 400);
    },
    onPointerUp: stop,
    onPointerLeave: abandon,
    onPointerCancel: abandon,
    onContextMenu: (e) => e.preventDefault(),
    // A long press already stepped; swallow the click that follows it.
    // (e.detail === 0 is a keyboard click: always one step.)
    onClick: (e) => { if (timers.current.repeated && e.detail !== 0) { timers.current.repeated = false; return; } timers.current.repeated = false; fnRef.current(); },
  };
}

function SettingControl({ label, unit, value, onChange, min, max, step, color }) {
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const down = useRepeatPress(() => { const v = Math.max(min, valueRef.current - step); valueRef.current = v; onChange(v); });
  const up = useRepeatPress(() => { const v = Math.min(max, valueRef.current + step); valueRef.current = v; onChange(v); });
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
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button {...down} style={smallBtnStyle}>
          −
        </button>
        {/* Fixed width: the number growing (0 → 300) must not slide the buttons.
            72px fits the widest value ("300 sec") and keeps two controls per row
            on a 390px phone. */}
        <div style={{ minWidth: "72px", textAlign: "center", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontSize: "28px", fontWeight: 700, color: "#FFF" }}>{value}</span>
          <span style={{ fontSize: "11px", color: "#666", marginLeft: "4px" }}>{unit}</span>
        </div>
        <button {...up} style={smallBtnStyle}>
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
  touchAction: "manipulation",
  WebkitTouchCallout: "none",
};
