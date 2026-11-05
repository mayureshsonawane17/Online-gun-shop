/**
 * GunAudio.js
 * High-fidelity layered procedural Web Audio synthesizer for firearms
 * Includes crack transient, body thump, convolution reverb tail, compressor,
 * category-tailored sound profiles, pitch/pan jitter, and mechanical foley sounds.
 */

export class GunAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.convolver = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.noiseBuffer = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    // Master Compressor (prevents clipping, adds punch)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(14, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Dry / Wet Reverb routing
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
    this.dryGain.connect(this.compressor);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.reverbGain.connect(this.compressor);

    // Convolver Node with procedurally generated Impulse Response
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.createImpulseResponse(2.2, 2.5);
    this.convolver.connect(this.reverbGain);

    // Pre-generate white noise buffer (1.5 seconds)
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.initialized = true;
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Generates a stereo impulse response simulating a wide concrete shooting range
   */
  createImpulseResponse(duration, decay) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  /**
   * Fire a gun with layered acoustic synthesis
   * @param {Object} gun - Gun definition with category and sound attributes
   * @param {number} panX - Spatial pan from -1 (left) to 1 (right)
   */
  playShot(gun = {}, panX = 0) {
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const cat = gun.category || gun.t || 'Pistol';

    // Jitter to prevent repetitive machine-gun loop effect
    const pitchJitter = 1.0 + (Math.random() * 0.08 - 0.04);
    const volJitter = 1.0 + (Math.random() * 0.08 - 0.04);
    const panJitter = Math.max(-1, Math.min(1, panX + (Math.random() * 0.1 - 0.05)));

    // Stereo Panner
    let panner = null;
    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(panJitter, t);
      panner.connect(this.dryGain);
      panner.connect(this.convolver);
    }
    const outputNode = panner || this.dryGain;

    // Profiles by category
    const profiles = {
      Pistol: { crackFreq: 4500, crackDur: 0.035, bodyFreq: 140, bodyEnd: 40, bodyDur: 0.12, noiseFreq: 1200, vol: 0.75 },
      Revolver: { crackFreq: 3800, crackDur: 0.05, bodyFreq: 130, bodyEnd: 30, bodyDur: 0.22, noiseFreq: 900, vol: 0.95 },
      SMG: { crackFreq: 5800, crackDur: 0.025, bodyFreq: 180, bodyEnd: 55, bodyDur: 0.08, noiseFreq: 1600, vol: 0.65 },
      Rifle: { crackFreq: 3800, crackDur: 0.045, bodyFreq: 110, bodyEnd: 35, bodyDur: 0.16, noiseFreq: 1100, vol: 0.85 },
      Sniper: { crackFreq: 2400, crackDur: 0.07, bodyFreq: 75, bodyEnd: 22, bodyDur: 0.45, noiseFreq: 650, vol: 1.1 },
      Shotgun: { crackFreq: 2600, crackDur: 0.065, bodyFreq: 85, bodyEnd: 25, bodyDur: 0.35, noiseFreq: 750, vol: 1.05, hasPump: true },
      LMG: { crackFreq: 3400, crackDur: 0.045, bodyFreq: 100, bodyEnd: 32, bodyDur: 0.18, noiseFreq: 950, vol: 0.9 },
      Minigun: { crackFreq: 5200, crackDur: 0.022, bodyFreq: 170, bodyEnd: 50, bodyDur: 0.065, noiseFreq: 1800, vol: 0.7 },
      Launcher: { crackFreq: 1800, crackDur: 0.1, bodyFreq: 55, bodyEnd: 18, bodyDur: 0.7, noiseFreq: 450, vol: 1.2, isWhoosh: true }
    };

    const p = profiles[cat] || profiles.Pistol;
    const finalVol = (p.vol || 0.8) * volJitter;

    // 1. Layer 1: High-Frequency Crack Transient
    const crackSource = this.ctx.createBufferSource();
    crackSource.buffer = this.noiseBuffer;
    crackSource.playbackRate.setValueAtTime(pitchJitter, t);

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.setValueAtTime(p.crackFreq * pitchJitter, t);

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(finalVol * 0.9, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + p.crackDur);

    crackSource.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(outputNode);

    crackSource.start(t);
    crackSource.stop(t + p.crackDur + 0.01);

    // 2. Layer 2: Mid Body Noise
    const bodyNoise = this.ctx.createBufferSource();
    bodyNoise.buffer = this.noiseBuffer;
    bodyNoise.playbackRate.setValueAtTime(pitchJitter * 0.9, t);

    const bodyNoiseFilter = this.ctx.createBiquadFilter();
    bodyNoiseFilter.type = 'bandpass';
    bodyNoiseFilter.frequency.setValueAtTime(p.noiseFreq * pitchJitter, t);
    bodyNoiseFilter.Q.setValueAtTime(1.8, t);

    const bodyNoiseGain = this.ctx.createGain();
    bodyNoiseGain.gain.setValueAtTime(finalVol * 0.8, t);
    bodyNoiseGain.gain.exponentialRampToValueAtTime(0.001, t + p.bodyDur);

    bodyNoise.connect(bodyNoiseFilter);
    bodyNoiseFilter.connect(bodyNoiseGain);
    bodyNoiseGain.connect(outputNode);

    bodyNoise.start(t);
    bodyNoise.stop(t + p.bodyDur + 0.02);

    // 3. Layer 3: Low Thump Pitch-Drop Oscillator
    const thumpOsc = this.ctx.createOscillator();
    thumpOsc.type = 'triangle';
    thumpOsc.frequency.setValueAtTime(p.bodyFreq * pitchJitter, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(p.bodyEnd, t + p.bodyDur);

    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(finalVol * 0.95, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + p.bodyDur);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(outputNode);

    thumpOsc.start(t);
    thumpOsc.stop(t + p.bodyDur + 0.02);

    // Special: Shotgun Pump Sound
    if (p.hasPump) {
      this.playMechanical('pump', t + 0.28);
    }

    // Special: Launcher Rocket Whoosh
    if (p.isWhoosh) {
      this.playRocketWhoosh(t);
    }
  }

  playRocketWhoosh(t) {
    const whoosh = this.ctx.createBufferSource();
    whoosh.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.7, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    whoosh.connect(filter);
    filter.connect(gain);
    gain.connect(this.dryGain);

    whoosh.start(t);
    whoosh.stop(t + 0.52);
  }

  /**
   * Mechanical foley sounds
   */
  playMechanical(type, startTime = null) {
    this.ensureContext();
    if (!this.ctx) return;
    const t = startTime !== null ? startTime : this.ctx.currentTime;

    switch (type) {
      case 'dryfire': {
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(1800, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.03);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        osc.connect(gain);
        gain.connect(this.dryGain);
        osc.start(t);
        osc.stop(t + 0.04);
        break;
      }
      case 'slide': {
        this.playNoiseTick(t, 2400, 0.4, 0.06);
        this.playNoiseTick(t + 0.08, 1600, 0.5, 0.07);
        break;
      }
      case 'pump': {
        this.playNoiseTick(t, 1200, 0.45, 0.08);
        this.playNoiseTick(t + 0.12, 1900, 0.6, 0.08);
        break;
      }
      case 'reload': {
        this.playNoiseTick(t, 1400, 0.5, 0.06);
        this.playNoiseTick(t + 0.35, 950, 0.6, 0.08);
        this.playNoiseTick(t + 0.75, 2200, 0.55, 0.07);
        break;
      }
      case 'pickup': {
        this.playNoiseTick(t, 1800, 0.4, 0.04);
        this.playNoiseTick(t + 0.06, 2600, 0.35, 0.05);
        break;
      }
      case 'drawer': {
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.linearRampToValueAtTime(80, t + 0.25);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain);
        gain.connect(this.dryGain);
        osc.start(t);
        osc.stop(t + 0.3);
        break;
      }
      case 'tinkle': {
        // Metallic brass casing bouncing on ground
        for (let i = 0; i < 3; i++) {
          const bounceTime = t + i * (0.07 + Math.random() * 0.04);
          const osc = this.ctx.createOscillator();
          const freq = 3200 + Math.random() * 800 - i * 300;
          osc.frequency.setValueAtTime(freq, bounceTime);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.18 / (i + 1), bounceTime);
          gain.gain.exponentialRampToValueAtTime(0.001, bounceTime + 0.035);
          osc.connect(gain);
          gain.connect(this.dryGain);
          osc.start(bounceTime);
          osc.stop(bounceTime + 0.04);
        }
        break;
      }
    }
  }

  playNoiseTick(time, freq, volume, duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.setValueAtTime(3.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.dryGain);

    src.start(time);
    src.stop(time + duration + 0.01);
  }
}

