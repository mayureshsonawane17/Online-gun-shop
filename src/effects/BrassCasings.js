/**
 * BrassCasings.js
 * Ejects real 3D metallic cartridge shell casings from the chamber with tumbling
 * physics, gravity, and ground bounces (with audio trigger).
 */
import * as THREE from 'three';

export class BrassCasings {
  constructor(scene, maxCasings = 40, onBounce = null) {
    this.scene = scene;
    this.maxCasings = maxCasings;
    this.onBounce = onBounce;
    this.casings = [];

    // Metallic Brass Shell geometry & material
    const casingGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.022, 8);
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xdeb843,
      metalness: 0.95,
      roughness: 0.22
    });

    const shotgunGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.038, 8);
    const shotgunMat = new THREE.MeshStandardMaterial({
      color: 0xb52b27,
      metalness: 0.35,
      roughness: 0.45
    });

    for (let i = 0; i < maxCasings; i++) {
      const mesh = new THREE.Mesh(casingGeo, casingMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.casings.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rotSpeed: new THREE.Vector3(),
        active: false,
        age: 0,
        life: 2.5,
        bounces: 0,
        normalGeo: casingGeo,
        shotgunGeo,
        normalMat: casingMat,
        shotgunMat
      });
    }
  }

  eject(origin, ejectionDir, upDir, isShotgun = false) {
    const c = this.casings.find(x => !x.active);
    if (!c) return;

    c.active = true;
    c.age = 0;
    c.bounces = 0;
    c.life = 2.5;

    // Swap geometry if shotgun shell
    c.mesh.geometry = isShotgun ? c.shotgunGeo : c.normalGeo;
    c.mesh.material = isShotgun ? c.shotgunMat : c.normalMat;

    c.pos.copy(origin);
    c.mesh.position.copy(origin);
    c.mesh.visible = true;

    // Velocity: eject right and slightly up/back
    const speed = 1.8 + Math.random() * 0.8;
    c.vel.copy(ejectionDir)
      .multiplyScalar(speed)
      .addScaledVector(upDir, 0.9 + Math.random() * 0.6);

    // Fast 3D spin
    c.rotSpeed.set(
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 35,
      (Math.random() - 0.5) * 25
    );
  }

  update(dt, floorY = -0.7) {
    const gravity = -9.8;

    for (const c of this.casings) {
      if (!c.active) continue;

      c.age += dt;
      if (c.age >= c.life) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }

      // Physics
      c.vel.y += gravity * dt;
      c.pos.addScaledVector(c.vel, dt);

      c.mesh.rotation.x += c.rotSpeed.x * dt;
      c.mesh.rotation.y += c.rotSpeed.y * dt;
      c.mesh.rotation.z += c.rotSpeed.z * dt;

      // Ground bounce
      if (c.pos.y <= floorY && c.vel.y < 0) {
        c.pos.y = floorY;
        c.vel.y = -c.vel.y * 0.45;
        c.vel.x *= 0.65;
        c.vel.z *= 0.65;
        c.rotSpeed.multiplyScalar(0.5);

        if (c.bounces === 0 && this.onBounce) {
          this.onBounce();
        }
        c.bounces++;
      }

      c.mesh.position.copy(c.pos);
    }
  }
}

