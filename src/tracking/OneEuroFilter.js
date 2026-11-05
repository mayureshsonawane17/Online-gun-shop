/**
 * 1€ Filter (One Euro Filter)
 * State-of-the-art low-latency adaptive filter for noisy human motion tracking
 * Reference: Casiez, Roussel, Vogel (CHI 2012)
 */

class LowPassFilter {
  constructor(alpha = 0) {
    this.alpha = alpha;
    this.y = null;
    this.s = null;
  }

  filter(value, alpha) {
    this.alpha = alpha;
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.007, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  alpha(rate, cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(value, timestamp) {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(value, 1.0);
    }

    const dt = Math.max((timestamp - this.lastTime) / 1000.0, 0.001);
    this.lastTime = timestamp;
    const rate = 1.0 / dt;

    const dx = this.xFilter.y !== null ? (value - this.xFilter.y) * rate : 0;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, this.alpha(rate, cutoff));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class OneEuroFilter3D {
  constructor(options = {}) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
    this.fz = new OneEuroFilter(options);
  }

  filter(x, y, z, timestamp) {
    return [
      this.fx.filter(x, timestamp),
      this.fy.filter(y, timestamp),
      this.fz.filter(z, timestamp)
    ];
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

