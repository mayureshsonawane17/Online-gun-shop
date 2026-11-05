/**
 * MuzzleFlash.js
 * High-impact 3D muzzle flash combining a 4-point star billboard, an extruded flame cone,
 * and a dynamic PointLight that casts real illumination on the 3D gun and player hand.
 */
import * as THREE from 'three';

export class MuzzleFlash {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // Dynamic Flash PointLight
    this.light = new THREE.PointLight(0xffb74d, 0, 3.5);
    this.light.decay = 2;
    this.group.add(this.light);

    // Flame Cone
    const coneGeo = new THREE.ConeGeometry(0.065, 0.22, 8);
    coneGeo.rotateX(Math.PI / 2);
    coneGeo.translate(0, 0, 0.11);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffdd66,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.coneMesh = new THREE.Mesh(coneGeo, coneMat);
    this.group.add(this.coneMesh);

    // Star Billboard Texture
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.translate(64, 64);
    ctx.fillStyle = '#fff9d6';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(8, 12);
      ctx.lineTo(0, 60);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(Math.PI / 2);
    }
    const starTex = new THREE.CanvasTexture(canvas);

    const starMat = new THREE.MeshBasicMaterial({
      map: starTex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.starMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), starMat);
    this.group.add(this.starMesh);

    this.timer = 0;
    this.duration = 0.09;
  }

  trigger(muzzleWorldPos, fwdDir, scale = 1.0) {
    this.group.position.copy(muzzleWorldPos);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdDir);
    this.group.scale.setScalar(scale);

    this.group.visible = true;
    this.light.intensity = 5.5 * scale;
    this.timer = this.duration;

    // Randomize star rotation
    this.starMesh.rotation.z = Math.random() * Math.PI;
  }

  update(dt, camera) {
    if (!this.group.visible) return;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.group.visible = false;
      this.light.intensity = 0;
      return;
    }

    const prog = this.timer / this.duration;
    this.light.intensity = 5.5 * Math.pow(prog, 1.5);
    this.coneMesh.material.opacity = prog * 0.9;
    this.starMesh.material.opacity = prog * 0.95;

    // Billboard star towards camera
    if (camera) {
      this.starMesh.quaternion.copy(camera.quaternion);
    }
  }
}
