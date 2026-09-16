// Shared sound helpers: used by the timer, the rest countdown and the session view.
export function beep(freq = 880, duration = 150, vol = 0.5) {
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

export function doubleBeep() {
  beep(1100, 120, 0.6);
  setTimeout(() => beep(1100, 120, 0.6), 180);
}

export function tripleBeep() {
  beep(1320, 100, 0.7);
  setTimeout(() => beep(1320, 100, 0.7), 150);
  setTimeout(() => beep(1320, 100, 0.7), 300);
}

export function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.pitch = 0.9;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
