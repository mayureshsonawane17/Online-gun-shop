/**
 * Sparks.js
 * High-velocity glowing muzzle sparks and debris that scatter and fade rapidly
 */
import * as THREE from 'three';

export class Sparks {
  constructor(scene, maxSparks = 80) {
    this.scene = scene;
    this.maxSparks = maxSparks;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxSparks * 3);
    const colors = new Float32Array(maxSparks * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle texture
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 220, 1.0)');
    grad.addColorStop(0.3, 'rgba(255, 180, 50, 0.9)');
    grad.addColorStop(0.7, 'rgba(255, 80, 20, 0.4)');
    grad.addColorStop(1, 'rgba(255, 50, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 0.05,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);

    this.sparks = [];
    for (let i = 0; i < maxSparks; i++) {
      this.sparks.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.25,
        color: new THREE.Color()
      });
    }
  }

  emit(muzzlePos, fwdDir, count = 16) {
    let emitted = 0;
    for (let i = 0; i < this.maxSparks && emitted < count; i++) {
      const s = this.sparks[i];
      if (s.active) continue;

      s.active = true;
      s.age = 0;
      s.life = 0.12 + Math.random() * 0.22;
      s.pos.copy(muzzlePos);

      // Conical high-speed forward spread
      const spreadX = (Math.random() - 0.5) * 0.7;
      const spreadY = (Math.random() - 0.5) * 0.7;
      const spreadZ = (Math.random() - 0.5) * 0.3;
      const speed = 7.0 + Math.random() * 12.0;

      s.vel.copy(fwdDir)
        .add(new THREE.Vector3(spreadX, spreadY, spreadZ))
        .normalize()
        .multiplyScalar(speed);

      s.color.setHSL(0.08 + Math.random() * 0.06, 1.0, 0.7);
      emitted++;
    }
  }

  update(dt) {
    const posAttr = this.points.geometry.attributes.position;
    const colAttr = this.points.geometry.attributes.color;
    const gravity = -14.0;
    let anyActive = false;

    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparks[i];
      if (!s.active) {
        posAttr.setXYZ(i, 0, -999, 0);
        continue;
      }

      anyActive = true;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        posAttr.setXYZ(i, 0, -999, 0);
        continue;
      }

      s.vel.y += gravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      posAttr.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);

      const prog = s.age / s.life;
      const brightness = Math.max(0, 1.0 - prog);
      colAttr.setXYZ(
        i,
        s.color.r * brightness,
        s.color.g * brightness,
        s.color.b * brightness
      );
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}

