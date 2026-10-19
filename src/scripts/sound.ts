/**
 * The mountain, synthesized. No audio files: wind is filtered brown noise,
 * birds are swept sine chirps, the yak bell is a few inharmonic partials.
 * Nothing makes a sound until the visitor turns it on.
 */

export type Surface = "grass" | "rock" | "snow";

export type SoundState = {
  level: number; // 0 at basecamp → 1 at the summit
  gust: number; // 0..1
  fog: number; // 0..1
  birds: boolean;
  fire: number; // 0..1 proximity to the campfire
};

export function createSound() {
  let ctx: AudioContext | null = null;
  let master!: GainNode;
  let noise!: AudioBuffer;
  let windGain!: GainNode;
  let windFilter!: BiquadFilterNode;
  let flutterGain!: GainNode;
  let on = false;
  let nextBird = 0;
  let lastStep = 0;
  let sleepTimer = 0;

  // glide master volume from wherever it is right now, so re-toggling mid-fade never jumps
  function fadeTo(value: number, tau: number) {
    const g = master.gain;
    const t = ctx!.currentTime;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
    else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
    }
    g.setTargetAtTime(value, t, tau);
  }

  function init() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // two seconds of brown noise, looped — it sounds like wind on its own
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }

    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // prayer flags flapping in gusts: noise chopped by a fast LFO
    const flap = ctx.createBufferSource();
    flap.buffer = noise;
    flap.loop = true;
    flap.playbackRate.value = 1.7;
    const flapFilter = ctx.createBiquadFilter();
    flapFilter.type = "bandpass";
    flapFilter.frequency.value = 1600;
    flapFilter.Q.value = 2;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(chop.gain);
    lfo.start();
    flutterGain = ctx.createGain();
    flutterGain.gain.value = 0;
    flap.connect(flapFilter).connect(chop).connect(flutterGain).connect(master);
    flap.start();
  }

  function burst(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, at = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = type === "lowpass" ? 0.8 : 2.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  function tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", at = 0, glideTo?: number) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function chirp(at: number) {
    const base = 2200 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone(base, 0.09, 0.035, "sine", at + i * 0.13, base * (1.3 + Math.random() * 0.3));
  }

  return {
    get on() {
      return on;
    },
    enable() {
      if (!ctx) init();
      window.clearTimeout(sleepTimer);
      void ctx!.resume();
      on = true;
      fadeTo(0.9, 0.3);
    },
    disable() {
      on = false;
      if (!ctx) return;
      fadeTo(0, 0.12);
      // only suspend once the fade-out has finished; a quick re-toggle cancels it
      window.clearTimeout(sleepTimer);
      const c = ctx;
      sleepTimer = window.setTimeout(() => !on && c.suspend(), 600);
    },
    suspend(hidden: boolean) {
      if (!ctx || !on) return;
      void (hidden ? ctx.suspend() : ctx.resume());
    },
    update(s: SoundState) {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const muffle = 1 - s.fog * 0.6;
      windGain.gain.setTargetAtTime((0.05 + s.level * 0.16 + s.gust * 0.2) * (1 + s.fog * 0.4), t, 0.4);
      windFilter.frequency.setTargetAtTime((360 + s.level * 520 + s.gust * 700) * muffle, t, 0.5);
      flutterGain.gain.setTargetAtTime(s.gust * 0.09 * muffle, t, 0.3);

      const now = performance.now();
      if (s.birds && s.fog < 0.2 && now > nextBird) {
        chirp(0);
        nextBird = now + 1800 + Math.random() * 4200;
      }
      if (s.fire > 0.05 && Math.random() < s.fire * 0.12) {
        burst(0.025 + Math.random() * 0.03, "highpass", 2500 + Math.random() * 2000, 0.8, 0.08 * s.fire);
      }
    },
    step(surface: Surface) {
      if (!ctx || !on) return;
      const now = performance.now();
      if (now - lastStep < 90) return;
      lastStep = now;
      if (surface === "snow") burst(0.11, "bandpass", 2600 + Math.random() * 900, 1.1, 0.16);
      else if (surface === "rock") burst(0.05, "bandpass", 1100 + Math.random() * 400, 2.5, 0.2);
      else burst(0.08, "lowpass", 420 + Math.random() * 120, 1, 0.42);
    },
    bell() {
      if (!ctx || !on) return;
      const f = 540 + Math.random() * 40;
      tone(f, 1.3, 0.16);
      tone(f * 2.41, 0.9, 0.07);
      tone(f * 3.87, 0.5, 0.04);
      burst(0.03, "highpass", 3000, 0.7, 0.08);
    },
    bleat() {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(210, t);
      o.frequency.linearRampToValueAtTime(150, t + 0.7);
      const vib = ctx.createOscillator();
      vib.frequency.value = 18;
      const vibAmt = ctx.createGain();
      vibAmt.gain.value = 9;
      vib.connect(vibAmt).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900;
      f.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(f).connect(g).connect(master);
      o.start(t);
      vib.start(t);
      o.stop(t + 0.85);
      vib.stop(t + 0.85);
    },
    chime() {
      if (!ctx || !on) return;
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 1.6, 0.07, "triangle", i * 0.12));
    },
    whoosh() {
      if (!ctx || !on) return;
      burst(1.4, "bandpass", 700, 0.5, 0.18);
    },
  };
}
