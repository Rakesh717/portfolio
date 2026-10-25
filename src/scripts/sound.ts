/**
 * The mountain, synthesized. No audio files: wind is filtered brown noise,
 * birds are swept sine chirps, the yak bell is a few inharmonic partials.
 * Nothing makes a sound until the visitor turns it on.
 */

export type Surface = "grass" | "rock" | "snow";

type SoundState = {
  level: number; // 0 at basecamp → 1 at the summit
  gust: number; // 0..1
  fog: number; // 0..1
  birds: boolean;
  fire: number; // 0..1 proximity to the campfire
  pose: string; // Yakku's pose: drives his moods (happy, sleeping, studying)
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
  let lastPose = "";
  let nextSnore = 0;
  let nextStudy = 0;
  let stepCount = 0;

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

    // two seconds of brown noise, looped; on its own it already sounds like wind
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

  /** a soft, shaped noise swell: breaths, snores, page swishes */
  function breath(dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, at = 0, attack = 0.4) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** a voiced yak noise: sawtooth through a throat-ish bandpass, with wobble */
  function voice(f0: number, f1: number, dur: number, gain: number, at = 0, wobble = 9, formant = 900) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 16;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = wobble;
    vib.connect(vibAmt).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = formant;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /** happy: a bright two-note "meh-eh!" that lifts at the end, and a jingle of the bell */
  function happy() {
    voice(250, 300, 0.16, 0.16, 0, 6, 1100);
    voice(300, 390, 0.26, 0.18, 0.18, 7, 1250);
    const f = 760;
    [0, 0.1, 0.2].forEach((at, i) => {
      tone(f * (1 + i * 0.12), 0.5, 0.06, "sine", 0.42 + at);
      tone(f * (1 + i * 0.12) * 2.41, 0.3, 0.025, "sine", 0.42 + at);
    });
  }

  /** sleeping: one slow breath. A rumbling snore on the way in, a soft "pfff" out,
   *  and now and then a tiny whistle */
  function snore() {
    if (!ctx) return;
    const t = ctx.currentTime;
    // the rumble: a low buzz, fluttering like a soft palate
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(62, t);
    o.frequency.linearRampToValueAtTime(74, t + 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const flutter = ctx.createGain();
    flutter.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(flutter.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(lp).connect(flutter).connect(g).connect(master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.6);
    lfo.stop(t + 1.6);
    breath(1.4, "bandpass", 380, 620, 0.9, 0.07, 0, 0.6); // the air going in
    breath(1.3, "bandpass", 1500, 900, 0.7, 0.05, 1.9, 0.25); // pfff
    if (Math.random() < 0.35) tone(980, 0.6, 0.012, "sine", 2.0, 760); // whistle
  }

  /** studying: a page turn (a swish that rises, with a papery flutter), pencil
   *  scratches, or a thoughtful hum */
  function study() {
    const r = Math.random();
    if (r < 0.45) {
      breath(0.32, "bandpass", 900, 3800, 1.2, 0.09, 0, 0.5);
      burst(0.03, "highpass", 4200, 0.8, 0.05, 0.3);
    } else if (r < 0.8) {
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) burst(0.05 + Math.random() * 0.06, "bandpass", 3200 + Math.random() * 1600, 3, 0.05, i * (0.09 + Math.random() * 0.08));
    } else {
      // "hmm…": a soft hum that wanders a little
      const f = 170 + Math.random() * 30;
      tone(f, 0.9, 0.05, "triangle", 0, f * 1.08);
      tone(f * 2, 0.7, 0.015, "sine", 0, f * 2.16);
    }
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
      // moods follow Yakku's pose
      if (s.pose !== lastPose) {
        if ((s.pose === "wave" || s.pose === "celebrate") && lastPose !== "wave" && lastPose !== "celebrate") happy();
        if (s.pose === "sleep") nextSnore = now + 900;
        if (s.pose === "read") nextStudy = now + 700;
        lastPose = s.pose;
      }
      if (s.pose === "sleep" && now > nextSnore) {
        snore();
        nextSnore = now + 3900 + Math.random() * 900;
      }
      if (s.pose === "read" && now > nextStudy) {
        study();
        nextStudy = now + 2600 + Math.random() * 3200;
      }
      if (s.fire > 0.05 && Math.random() < s.fire * 0.12) {
        burst(0.025 + Math.random() * 0.03, "highpass", 2500 + Math.random() * 2000, 0.8, 0.08 * s.fire);
      }
    },
    /** effort 0..1: deep snow, thin air. Steps sink and crunch, and he huffs every other stride */
    step(surface: Surface, effort = 0) {
      if (!ctx || !on) return;
      const now = performance.now();
      if (now - lastStep < 90) return;
      lastStep = now;
      stepCount++;
      if (surface === "snow") {
        burst(0.11 + effort * 0.08, "bandpass", 2600 + Math.random() * 900 - effort * 900, 1.1, 0.16 + effort * 0.05);
        // the hoof sinking in: a soft low thump under the crunch
        if (effort > 0.05) burst(0.12, "lowpass", 260, 0.8, 0.25 * effort, 0.02);
        if (effort > 0.15 && stepCount % 2 === 0) {
          // out-breath on the stride, a quick in-breath before the next
          breath(0.3, "bandpass", 1100, 750, 1.1, 0.05 + effort * 0.07, 0.04, 0.15);
          breath(0.22, "bandpass", 700, 1300, 1.3, 0.03 + effort * 0.04, 0.38, 0.6);
          if (effort > 0.7 && Math.random() < 0.18) voice(150, 120, 0.3, 0.07, 0.1, 4, 650); // a tired grunt
        }
      } else if (surface === "rock") burst(0.05, "bandpass", 1100 + Math.random() * 400, 2.5, 0.2);
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
      voice(210, 150, 0.8, 0.22, 0, 9, 900);
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
