/**
 * RecoilSpring.js
 * Physics-based spring simulation for weapon kickback, muzzle pitch climb, and slide cycling
 */
export class RecoilSpring {
  constructor() {
    this.pos = 0;      // backward kick displacement
    this.vel = 0;
    this.rot = 0;      // muzzle climb angle
    this.rotVel = 0;

    // Physical spring constants
    this.stiffness = 280;
    this.damping = 22;

    this.slideDisplacement = 0;
    this.slideVel = 0;
  }

  kick(strength = 1.0) {
    this.vel -= 1.8 * strength;
    this.rotVel += 0.35 * strength;
    this.slideVel -= 3.5 * strength;
  }

  update(dt) {
    // Spring physics for backward kick: d2x/dt2 = -k*x - c*v
    const fSpringPos = -this.stiffness * this.pos - this.damping * this.vel;
    this.vel += fSpringPos * dt;
    this.pos += this.vel * dt;

    // Spring physics for muzzle climb pitch
    const fSpringRot = -this.stiffness * 1.2 * this.rot - this.damping * 1.1 * this.rotVel;
    this.rotVel += fSpringRot * dt;
    this.rot += this.rotVel * dt;

    // Slide cycling spring (faster recovery)
    const fSlide = -450 * this.slideDisplacement - 35 * this.slideVel;
    this.slideVel += fSlide * dt;
    this.slideDisplacement += this.slideVel * dt;
  }

  reset() {
    this.pos = this.vel = this.rot = this.rotVel = this.slideDisplacement = this.slideVel = 0;
  }
}

