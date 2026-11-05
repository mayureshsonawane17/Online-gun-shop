/**
 * SceneManager.js
 * Central Three.js 3D viewport manager: renderer, camera, studio PBR lighting,
 * environment map, shadow plane, weapon mount, idle sway, and effect orchestration.
 */
import * as THREE from 'three';
import { Turntable } from './Turntable.js';
import { RecoilSpring } from './RecoilSpring.js';
import { MuzzleFlash } from '../effects/MuzzleFlash.js';
import { GPUSmoke } from '../effects/GPUSmoke.js';
import { BulletTracers } from '../effects/BulletTracers.js';
import { BrassCasings } from '../effects/BrassCasings.js';
import { Sparks } from '../effects/Sparks.js';

export class SceneManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;

    // 1. Scene & Transparent Renderer
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 2. Camera (55 deg FOV matches typical webcams)
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 50);
    this.camera.position.set(0, 0, 0);

    // 3. Studio PBR Lighting
    this.setupLighting();

    // 4. Studio Environment Map (gradient PMREM)
    this.setupEnvironmentMap();

    // 5. Turntable Showroom Stand
    this.turntable = new Turntable(this.scene);

    // 6. Weapon Holder Root & Physics Spring
    this.weaponRoot = new THREE.Group();
    this.weaponRoot.name = 'Weapon_Holder_Root';
    this.scene.add(this.weaponRoot);

    this.recoilSpring = new RecoilSpring();

    // 7. Visual Effects
    this.muzzleFlash = new MuzzleFlash(this.scene);
    this.gpuSmoke = new GPUSmoke(this.scene, 1000);
    this.bulletTracers = new BulletTracers(this.scene, 50);
    this.sparks = new Sparks(this.scene, 80);
    this.brassCasings = new BrassCasings(this.scene, 40, () => {
      if (this.onCasingBounce) this.onCasingBounce();
    });

    // Weapon state
    this.currentGunGroup = null;
    this.currentGunMeta = null;
    this.isGunHeld = false;
    this.heldLerp = 0; // 0 = at stand, 1 = in hand
    this.lastMuzzleWorld = new THREE.Vector3();
    this.weaponVelocity = new THREE.Vector3();
    this.prevWeaponPos = new THREE.Vector3();

    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Ambient Fill
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    // Key Light (warm directional)
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    keyLight.position.set(2.5, 3.5, 2.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    this.scene.add(keyLight);

    // Rim Light (cool blue outline)
    const rimLight = new THREE.DirectionalLight(0x88bbff, 1.4);
    rimLight.position.set(-3.0, 2.0, -2.5);
    this.scene.add(rimLight);

    // Soft Contact Shadow Plane underneath
    const shadowGeo = new THREE.PlaneGeometry(10, 10);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.65;
    shadowMesh.receiveShadow = true;
    this.scene.add(shadowMesh);
  }

  setupEnvironmentMap() {
    // Generate a studio gradient environment map via PMREM
    const pmremGen = new THREE.PMREMGenerator(this.renderer);
    pmremGen.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(10, 16, 16);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#75798a');
    grad.addColorStop(0.5, '#454852');
    grad.addColorStop(1, '#202228');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Studio lights reflection on canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 20, 60, 25);
    ctx.fillRect(160, 30, 45, 18);

    const envTex = new THREE.CanvasTexture(canvas);
    const envMat = new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(envGeo, envMat));

    const renderTarget = pmremGen.fromScene(envScene);
    this.scene.environment = renderTarget.texture;
  }

  attachGun(gunGroup, gunMeta) {
    if (this.currentGunGroup) {
      this.weaponRoot.remove(this.currentGunGroup);
    }
    this.currentGunGroup = gunGroup;
    this.currentGunMeta = gunMeta;
    this.weaponRoot.add(this.currentGunGroup);
    this.recoilSpring.reset();
  }

  setHeld(isHeld) {
    this.isGunHeld = isHeld;
  }

  triggerFire(gunMeta) {
    if (!this.currentGunGroup) return;

    // Physical recoil kick
    const kickStr = (gunMeta.recoilKick || 1.0) * (gunMeta.big ? 1.5 : 1.0);
    this.recoilSpring.kick(kickStr);

    // Locate Muzzle & Ejection in world space
    const muzzleNode = this.currentGunGroup.getObjectByName('muzzle') || (this.currentGunGroup.userData && this.currentGunGroup.userData.muzzle);
    const muzzleWorld = new THREE.Vector3();
    if (muzzleNode && typeof muzzleNode.getWorldPosition === 'function') {
      muzzleNode.getWorldPosition(muzzleWorld);
    } else {
      this.currentGunGroup.getWorldPosition(muzzleWorld);
      muzzleWorld.z += 0.3;
    }

    const fwdDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.weaponRoot.quaternion).normalize();

    // 1. Muzzle Flash
    this.muzzleFlash.trigger(muzzleWorld, fwdDir, gunMeta.big ? 1.4 : 1.0);

    // 2. High-speed Bullet Tracer & Fiery Sparks
    this.bulletTracers.fire(muzzleWorld, fwdDir, 65);
    this.sparks.emit(muzzleWorld, fwdDir, gunMeta.big ? 26 : 16);

    // 3. Smoke Blast
    this.gpuSmoke.emitGunBlast(muzzleWorld, fwdDir, this.weaponVelocity, gunMeta.big);

    // 4. Brass Casing Ejection
    const ejectionNode = this.currentGunGroup.getObjectByName('ejection') || (this.currentGunGroup.userData && this.currentGunGroup.userData.ejection);
    const ejectionWorld = new THREE.Vector3();
    if (ejectionNode && typeof ejectionNode.getWorldPosition === 'function') {
      ejectionNode.getWorldPosition(ejectionWorld);
    } else {
      ejectionWorld.copy(muzzleWorld).subScaledVector(fwdDir, 0.2);
    }

    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.weaponRoot.quaternion).normalize();
    const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(this.weaponRoot.quaternion).normalize();
    this.brassCasings.eject(ejectionWorld, rightDir, upDir, gunMeta.category === 'Shotgun');
  }

  update(dt, handTrackingData = null, mouseControlData = null) {
    // Update Turntable
    this.turntable.update(dt, this.isGunHeld);

    // Smooth pick-up lift transition (0 = at stand, 1 = in hand)
    const targetHeldLerp = this.isGunHeld ? 1.0 : 0.0;
    this.heldLerp += (targetHeldLerp - this.heldLerp) * (1.0 - Math.exp(-dt * 9.0));

    // Target position & orientation
    const standPos = this.turntable.getStandWorldPosition();
    const standQuat = new THREE.Quaternion();
    this.turntable.mountNode.getWorldQuaternion(standQuat);

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();

    if (this.isGunHeld) {
      if (handTrackingData) {
        // Track Hand
        targetPos.copy(handTrackingData.position);
        targetQuat.copy(handTrackingData.quaternion);
      } else if (mouseControlData) {
        // Track Mouse fallback in 3D
        const targetZ = -0.85;
        const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
        const visibleHeight = 2 * Math.tan(vFOV / 2) * Math.abs(targetZ);
        const visibleWidth = visibleHeight * this.camera.aspect;

        const mx = mouseControlData.hasMoved ? mouseControlData.x : 0.0;
        const my = mouseControlData.hasMoved ? mouseControlData.y : -0.15;
        targetPos.set(-0.08 + mx * visibleWidth * 0.35, -0.05 + my * visibleHeight * 0.35, targetZ);

        const yaw = 0.42 + (mouseControlData.angle || 0);
        const pitch = 0.05;
        targetQuat.setFromEuler(new THREE.Euler(pitch, yaw, 0));
      }

      // Blend smoothly between Stand and Hand
      this.weaponRoot.position.lerpVectors(standPos, targetPos, this.heldLerp);
      this.weaponRoot.quaternion.slerpQuaternions(standQuat, targetQuat, this.heldLerp);
    } else {
      // Resting on pedestal
      this.weaponRoot.position.lerpVectors(standPos, targetPos, this.heldLerp);
      this.weaponRoot.quaternion.slerpQuaternions(standQuat, targetQuat, this.heldLerp);
      if (this.heldLerp < 0.01) {
        this.weaponRoot.position.copy(standPos);
        this.weaponRoot.quaternion.copy(standQuat);
      }
    }

    // Subtle idle breathing sway when held
    if (this.isGunHeld && this.heldLerp > 0.8) {
      const time = performance.now() * 0.002;
      const swayX = Math.sin(time * 0.8) * 0.004;
      const swayY = Math.cos(time * 1.2) * 0.004;
      this.weaponRoot.position.x += swayX;
      this.weaponRoot.position.y += swayY;
    }

    // Calculate Weapon Inertia Velocity (for smoke trailing)
    this.weaponVelocity.subVectors(this.weaponRoot.position, this.prevWeaponPos).divideScalar(Math.max(dt, 0.001));
    this.prevWeaponPos.copy(this.weaponRoot.position);

    // Physics Recoil update
    this.recoilSpring.update(dt);
    if (this.currentGunGroup) {
      // Recoil kick displacement along Z & pitch climb along X
      this.currentGunGroup.position.z = this.recoilSpring.pos;
      this.currentGunGroup.rotation.x = this.recoilSpring.rot;

      // Recoil slide cycling
      const slide = this.currentGunGroup.getObjectByName('slide') || (this.currentGunGroup.userData && this.currentGunGroup.userData.slide);
      if (slide) {
        slide.position.z = 0.06 + this.recoilSpring.slideDisplacement;
      }
      const pump = this.currentGunGroup.getObjectByName('pump') || (this.currentGunGroup.userData && this.currentGunGroup.userData.pump);
      if (pump && this.recoilSpring.slideDisplacement < -0.01) {
        pump.position.z = 0.32 + this.recoilSpring.slideDisplacement * 0.6;
      }
    }

    // Update Visual Effects
    this.muzzleFlash.update(dt, this.camera);
    this.gpuSmoke.update(dt, this.camera);
    this.bulletTracers.update(dt);
    this.sparks.update(dt);
    this.brassCasings.update(dt, -0.65);

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
