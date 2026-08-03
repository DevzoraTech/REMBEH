/** Soft chime for in-app notifications and alerts. */
export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    master.connect(ctx.destination);

    const tones = [
      { freq: 880, start: 0, dur: 0.14 },
      { freq: 1174.7, start: 0.1, dur: 0.22 },
    ];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.9, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.start + tone.dur,
      );
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.02);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 800);
  } catch {
    // Autoplay / AudioContext may be blocked until a user gesture.
  }
}
