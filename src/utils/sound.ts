/**
 * High-clarity, high-volume notification sound utility using Web Audio API.
 * Designed to be distinctly audible, crisp, and authoritative across all devices.
 * Automatically unlocks audio context on first user interaction to comply with browser autoplay policies.
 */

let sharedAudioCtx: AudioContext | null = null;
let lastSoundTime = 0;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Global unlock listener on user gesture
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  };
  window.addEventListener('click', unlock, { once: false, passive: true });
  window.addEventListener('keydown', unlock, { once: false, passive: true });
  window.addEventListener('touchstart', unlock, { once: false, passive: true });
}

/**
 * Play an authoritative, punchy, and loud notification chime.
 * Boosted volume, dual-harmonic presence, and dynamic limiting to prevent clipping.
 */
export function playNotificationSound(): void {
  const now = Date.now();
  // Prevent stutter if multiple notifications fire in milliseconds
  if (now - lastSoundTime < 300) {
    return;
  }
  lastSoundTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;

    // Master volume booster - boosted for louder acoustic delivery
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.65, t);
    masterGain.connect(ctx.destination);

    // Dynamic compressor / limiter: allows maximum audible loudness without digital distortion
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, t);
    compressor.knee.setValueAtTime(12, t);
    compressor.ratio.setValueAtTime(8, t);
    compressor.attack.setValueAtTime(0.001, t);
    compressor.release.setValueAtTime(0.18, t);
    compressor.connect(masterGain);

    // Chime Note 1: G5 (783.99 Hz) - punchy chime start
    const osc1a = ctx.createOscillator();
    const osc1b = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1a.type = 'triangle';
    osc1a.frequency.setValueAtTime(783.99, t);
    osc1b.type = 'sine';
    osc1b.frequency.setValueAtTime(783.99, t);

    gain1.gain.setValueAtTime(0.001, t);
    gain1.gain.linearRampToValueAtTime(0.95, t + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc1a.connect(gain1);
    osc1b.connect(gain1);
    gain1.connect(compressor);

    osc1a.start(t);
    osc1b.start(t);
    osc1a.stop(t + 0.36);
    osc1b.stop(t + 0.36);

    // Chime Note 2: C6 (1046.50 Hz) - clear, bright resolution (Teams / Apple high bell tone)
    const osc2a = ctx.createOscillator();
    const osc2b = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2a.type = 'triangle';
    osc2a.frequency.setValueAtTime(1046.50, t + 0.08);
    osc2b.type = 'sine';
    osc2b.frequency.setValueAtTime(1046.50, t + 0.08);

    gain2.gain.setValueAtTime(0.001, t + 0.08);
    gain2.gain.linearRampToValueAtTime(1.0, t + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.58);

    osc2a.connect(gain2);
    osc2b.connect(gain2);
    gain2.connect(compressor);

    osc2a.start(t + 0.08);
    osc2b.start(t + 0.08);
    osc2a.stop(t + 0.60);
    osc2b.stop(t + 0.60);

    // Chime Note 3 (Harmonic sparkle): E6 (1318.51 Hz) - high crystal presence
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();

    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1318.51, t + 0.12);

    gain3.gain.setValueAtTime(0.001, t + 0.12);
    gain3.gain.linearRampToValueAtTime(0.65, t + 0.14);
    gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.68);

    osc3.connect(gain3);
    gain3.connect(compressor);

    osc3.start(t + 0.12);
    osc3.stop(t + 0.70);
  } catch (err) {
    // Autoplay restrictions or audio API failure, fail gracefully
  }
}
