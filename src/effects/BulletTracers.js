/**
 * BulletTracers.js
 * Renders high-speed 3D glowing bullet streaks across the scene
 */
import * as THREE from 'three';

export class BulletTracers {
  constructor(scene, maxTracers = 50) {
    this.scene = scene;
    this.maxTracers = maxTracers;
    this.tracers = [];

    // Glowing laser-tracer line material
    const tracerGeo = new THREE.CylinderGeometry(0.004, 0.002, 0.45, 6);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    for (let i = 0; i < maxTracers; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracers.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        active: false,
        age: 0,
        life: 0.45
      });
    }
  }

  fire(origin, direction, speed = 45) {
    const t = this.tracers.find(x => !x.active);
    if (!t) return;

    t.active = true;
    t.age = 0;
    t.life = 0.45;
    t.pos.copy(origin);
    t.vel.copy(direction).normalize().multiplyScalar(speed);

    t.mesh.position.copy(origin);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.95;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (!t.active) continue;

      t.age += dt;
      if (t.age >= t.life) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }

      t.pos.addScaledVector(t.vel, dt);
      t.mesh.position.copy(t.pos);

      // Fade out
      const prog = t.age / t.life;
      t.mesh.material.opacity = (1.0 - prog) * 0.95;
    }
  }
}

