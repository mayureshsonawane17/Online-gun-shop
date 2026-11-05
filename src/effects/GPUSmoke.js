/**
 * GPUSmoke.js
 * High-performance GPU instanced particle smoke system with curl-noise turbulence,
 * thermodynamic cooling (orange fiery flash -> dark grey smoke), upward buoyancy,
 * smoke shockwave rings, and post-shot barrel wisps that inherit weapon inertia.
 */
import * as THREE from 'three';

export class GPUSmoke {
  constructor(scene, maxParticles = 1000) {
    this.scene = scene;
    this.maxParticles = maxParticles;

    // Create soft radial smoke texture programmatically
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.3, 'rgba(220, 220, 225, 0.7)');
    grad.addColorStop(0.6, 'rgba(180, 180, 190, 0.35)');
    grad.addColorStop(1, 'rgba(150, 150, 160, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const smokeTex = new THREE.CanvasTexture(canvas);

    // Particle Material
    this.material = new THREE.MeshBasicMaterial({
      map: smokeTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(planeGeo, this.material, maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxParticles * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(this.mesh);

    // CPU particle state pool
    this.particles = [];
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 0.1,
        maxScale: 0.5,
        growthRate: 0.3,
        age: 0,
        life: 1.5,
        rot: 0,
        rotSpeed: 0,
        temp: 1.0, // 1.0 = hot fire, 0.0 = grey smoke
        coolingRate: 3.5,
        drag: 1.5,
        opacity: 0.7
      });
    }

    this.dummy = new THREE.Object3D();
    this.tempColor = new THREE.Color();
    this.hotColor = new THREE.Color(0xff8833);
    this.coolColor = new THREE.Color(0x383b42);
    this.wispCoolColor = new THREE.Color(0xb0b4bc);

    // Reset all instances out of view
    this.dummy.position.set(0, -999, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < maxParticles; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  emit(options = {}) {
    // Find first inactive particle
    const p = this.particles.find(x => !x.active);
    if (!p) return;

    p.active = true;
    p.pos.copy(options.position || new THREE.Vector3());
    p.vel.copy(options.velocity || new THREE.Vector3());
    // Inherit weapon velocity
    if (options.inertia) {
      p.vel.addScaledVector(options.inertia, 0.6);
    }

    p.scale = options.scale || 0.08;
    p.maxScale = options.maxScale || 0.45;
    p.growthRate = options.growthRate || 0.35;
    p.age = 0;
    p.life = options.life || 1.8;
    p.rot = Math.random() * Math.PI * 2;
    p.rotSpeed = (Math.random() - 0.5) * 1.5;
    p.temp = options.isWisp ? 0.0 : (options.temp !== undefined ? options.temp : 0.9);
    p.coolingRate = options.coolingRate || 3.0;
    p.drag = options.drag || 1.8;
    p.opacity = options.opacity || 0.65;
    p.isWisp = !!options.isWisp;
  }

  /**
   * Emit an explosive burst of smoke upon gunfire
   */
  emitGunBlast(muzzlePos, fwdDir, weaponInertia, isBig = false) {
    const count = isBig ? 18 : 10;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.4;
      const spreadY = (Math.random() - 0.5) * 0.4;
      const speed = (isBig ? 3.5 : 2.2) + Math.random() * 2.5;

      const vel = new THREE.Vector3()
        .copy(fwdDir)
        .add(new THREE.Vector3(spread, spreadY, spread * 0.5))
        .normalize()
        .multiplyScalar(speed);

      this.emit({
        position: muzzlePos,
        velocity: vel,
        inertia: weaponInertia,
        scale: 0.07 * (isBig ? 1.4 : 1.0),
        maxScale: (isBig ? 0.65 : 0.45) + Math.random() * 0.2,
        growthRate: 0.45,
        life: 1.4 + Math.random() * 1.2,
        opacity: 0.75,
        temp: 0.9
      });
    }

    // Expanding shockwave smoke ring on heavy guns
    if (isBig) {
      this.emitSmokeRing(muzzlePos, fwdDir, 16);
    }
  }

  /**
   * Emit an expanding toroidal shockwave smoke ring
   */
  emitSmokeRing(muzzlePos, fwdDir, ringCount = 14) {
    const ringSpeed = 2.8;
    const ringRadius = 0.06;

    // Up and right vectors perpendicular to forward
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwdDir, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, fwdDir).normalize();

    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const offset = new THREE.Vector3()
        .addScaledVector(right, Math.cos(angle) * ringRadius)
        .addScaledVector(realUp, Math.sin(angle) * ringRadius);

      const vel = new THREE.Vector3()
        .copy(fwdDir)
        .multiplyScalar(ringSpeed)
        .addScaledVector(offset.clone().normalize(), 0.6);

      this.emit({
        position: muzzlePos.clone().add(offset),
        velocity: vel,
        scale: 0.05,
        maxScale: 0.35,
        growthRate: 0.3,
        life: 0.9,
        opacity: 0.6,
        temp: 0.4
      });
    }
  }

  /**
   * Emit gentle curling smoke wisps from the hot barrel after shooting
   */
  emitBarrelWisp(muzzlePos, weaponInertia, heatLevel = 1.0) {
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      0.35 + Math.random() * 0.35, // upward buoyant draft
      (Math.random() - 0.5) * 0.15
    );

    this.emit({
      position: muzzlePos,
      velocity: vel,
      inertia: weaponInertia,
      scale: 0.04 * heatLevel,
      maxScale: 0.28 * heatLevel,
      growthRate: 0.18,
      life: 2.2 + Math.random() * 1.5,
      opacity: 0.45 * Math.min(1.0, heatLevel),
      isWisp: true,
      temp: 0.0
    });
  }

  update(dt, camera) {
    let activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      activeCount++;

      // Physics: drag + upward buoyancy
      const dragFactor = Math.exp(-p.drag * dt);
      p.vel.multiplyScalar(dragFactor);
      p.vel.y += (p.isWisp ? 0.38 : 0.18) * dt; // buoyant lift

      // Curl-noise harmonic turbulence
      const turb = Math.sin(p.age * 3.5 + p.pos.x * 2.0) * 0.2;
      p.pos.x += (p.vel.x + turb) * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;

      // Expansion
      p.scale = Math.min(p.maxScale, p.scale + p.growthRate * dt);
      p.rot += p.rotSpeed * dt;

      // Color & Thermodynamic cooling
      p.temp = Math.max(0, p.temp - p.coolingRate * dt);
      const targetColor = p.isWisp ? this.wispCoolColor : this.coolColor;
      this.tempColor.copy(this.hotColor).lerp(targetColor, 1.0 - p.temp);

      const prog = p.age / p.life;
      const alpha = p.opacity * Math.min(1.0, p.age * 6.0) * Math.pow(1.0 - prog, 1.4);

      // Billboard rotation towards camera
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.rotateZ(p.rot);
      this.dummy.scale.set(p.scale, p.scale, 1.0);
      this.dummy.updateMatrix();

      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.tempColor.multiplyScalar(alpha));
    }

    if (activeCount > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

