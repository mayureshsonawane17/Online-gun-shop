/**
 * MagicAudio.js
 * High-fidelity layered procedural Web Audio synthesizer for mystical powers.
 * Routes through convolution reverb and dynamic master compression for punchy,
 * cinematic sound effects with randomized micro-pitch and volume per cast.
 */

export class MagicAudio {
  constructor(sharedAudioCtx = null) {
    this.ctx = sharedAudioCtx;
    this.masterGain = null;
    this.compressor = null;
    this.convolver = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.noiseBuffer = null;
    this.initialized = false;

    // Active continuous sound nodes (e.g. beam loop, charge loop, flame stream)
    this.activeLoops = new Map();
  }

  init(externalCtx = null) {
    if (this.initialized) return;

    if (externalCtx) {
      this.ctx = externalCtx;
    } else if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
    }

    // Dynamics Compressor
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(7, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Dry & Wet paths
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
    this.dryGain.connect(this.compressor);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.40, this.ctx.currentTime);
    this.reverbGain.connect(this.compressor);

    // Convolver Reverb with synthetic mystical impulse
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.createMysticImpulse(3.0, 2.0);
    this.convolver.connect(this.reverbGain);

    // 2-second white noise buffer
    const bufSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.initialized = true;
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createMysticImpulse(duration, decay) {
    const rate = this.ctx ? this.ctx.sampleRate : 44100;
    const length = Math.floor(rate * duration);
    const impulse = (this.ctx || new (window.AudioContext || window.webkitAudioContext)()).createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.exp(-t * decay);
      // Dual-channel slightly decorrelated noise with shimmering flutter
      const shimmer = 1.0 + 0.15 * Math.sin(t * 120.0);
      left[i] = (Math.random() * 2 - 1) * env * shimmer;
      right[i] = (Math.random() * 2 - 1) * env * shimmer;
    }
    return impulse;
  }

  route(sourceNode) {
    sourceNode.connect(this.dryGain);
    sourceNode.connect(this.convolver);
  }

  // ==========================================
  // 1. ENERGY WAVE (Kamehameha Charge & Beam)
  // ==========================================
  startChargeWhine(pitchStart = 90, pitchEnd = 980) {
    this.ensureContext();
    if (this.activeLoops.has('charge')) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitchStart, t);
    osc.frequency.exponentialRampToValueAtTime(pitchEnd, t + 2.8);

    // LFO for intense vibrato flutter
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(14, t);
    lfoGain.gain.setValueAtTime(18, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(t);

    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 2.8);
    filter.Q.setValueAtTime(4.0, t);

    // Gain envelope
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 1.2);

    osc.connect(filter);
    filter.connect(gain);
    this.route(gain);

    osc.start(t);
    this.activeLoops.set('charge', { osc, lfo, gain, filter });
  }

  stopChargeWhine() {
    if (!this.activeLoops.has('charge')) return;
    const { osc, lfo, gain } = this.activeLoops.get('charge');
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    setTimeout(() => {
      try {
        osc.stop();
        lfo.stop();
      } catch (e) {}
    }, 200);
    this.activeLoops.delete('charge');
  }

  startBeamRoar() {
    this.ensureContext();
    if (this.activeLoops.has('beam')) return;

    const t = this.ctx.currentTime;
    // Sub rumble
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(58, t);

    const subOsc2 = this.ctx.createOscillator();
    subOsc2.type = 'sine';
    subOsc2.frequency.setValueAtTime(52, t);

    // White noise roar
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(650, t);
    noiseFilter.Q.setValueAtTime(2.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.08);

    subOsc.connect(gain);
    subOsc2.connect(gain);
    noise.connect(noiseFilter);
    noiseFilter.connect(gain);

    this.route(gain);

    subOsc.start(t);
    subOsc2.start(t);
    noise.start(t);

    this.activeLoops.set('beam', { subOsc, subOsc2, noise, gain });
  }

  stopBeamRoar() {
    if (!this.activeLoops.has('beam')) return;
    const { subOsc, subOsc2, noise, gain } = this.activeLoops.get('beam');
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    setTimeout(() => {
      try {
        subOsc.stop();
        subOsc2.stop();
        noise.stop();
      } catch (e) {}
    }, 300);
    this.activeLoops.delete('beam');

    // Impact / shockwave dissipation boom
    this.playShockwave();
  }

  playShockwave() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.6);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    osc.connect(gain);
    this.route(gain);
    osc.start(t);
    osc.stop(t + 0.75);
  }

  // ==========================================
  // 2. POWER BLAST & SPIRIT SHOT
  // ==========================================
  playPowerBlast(isSpirit = false) {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const jitter = (Math.random() - 0.5) * 0.12;

    if (isSpirit) {
      // Piercing high-pitch spirit shot
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2400 * (1 + jitter), t);
      osc.frequency.exponentialRampToValueAtTime(360, t + 0.22);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      this.route(gain);
      osc.start(t);
      osc.stop(t + 0.3);
    } else {
      // Punchy energy orb blast
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(850 * (1 + jitter), t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.18);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, t);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.18);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.55, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      this.route(gain);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  }

  // ==========================================
  // 3. AIR TEMPEST (Vortex, Gust, Blades)
  // ==========================================
  playAirGust() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.45);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    noise.connect(filter);
    filter.connect(gain);
    this.route(gain);
    noise.start(t);
    noise.stop(t + 0.55);
  }

  playAirBlade() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.14);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);

    this.route(gain);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.25);
    noise.stop(t + 0.25);
  }

  // ==========================================
  // 4. WATER WHIP & SPLASH
  // ==========================================
  playWaterSplash() {
    this.ensureContext();
    const t = this.ctx.currentTime;

    // Water bubbling frequencies
    for (let i = 0; i < 4; i++) {
      const dt = i * 0.04;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const freq = 420 + Math.random() * 450;
      osc.frequency.setValueAtTime(freq, t + dt);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dt + 0.08);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.09);

      osc.connect(g);
      this.route(g);
      osc.start(t + dt);
      osc.stop(t + dt + 0.1);
    }

    // Heavy water crash noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(250, t + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    this.route(gain);
    noise.start(t);
    noise.stop(t + 0.45);
  }

  // ==========================================
  // 5. EARTH SHATTER (Rocks, Quake)
  // ==========================================
  playRockLaunch() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.3);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.Q.setValueAtTime(1.8, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    this.route(gain);

    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.4);
    noise.stop(t + 0.4);
  }

  playEarthCrack() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    // Deep ground sub rumble
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(65, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.7);

    // Crackle crunch
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.6);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    sub.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    this.route(gain);

    sub.start(t);
    noise.start(t);
    sub.stop(t + 0.8);
    noise.stop(t + 0.8);
  }

  // ==========================================
  // 6. FIRE & 7. LIGHTNING / SHIELD
  // ==========================================
  playFireball() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(750, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + 0.3);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    osc.connect(gain);
    this.route(gain);

    noise.start(t);
    osc.start(t);
    noise.stop(t + 0.4);
    osc.stop(t + 0.4);
  }

  playLightningZap() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const dt = i * 0.035;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2400 + Math.random() * 1200, t + dt);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.4, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.05);

      noise.connect(filter);
      filter.connect(g);
      this.route(g);
      noise.start(t + dt);
      noise.stop(t + dt + 0.06);
    }
  }

  playHexShield() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    // Harmonic barrier chord (C5 + E5 + G5)
    [523.25, 659.25, 783.99].forEach(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(g);
      this.route(g);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  playPowerSelect() {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(740, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    this.route(g);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}
