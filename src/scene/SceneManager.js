/**
 * SceneManager.js
 * Central Three.js 3D viewport manager: renderer, camera, studio PBR lighting,
 * environment map, shadow plane, weapon mount, idle sway, and effect orchestration.
 *
 * Upgraded Features:
 * - Weapon weight & inertia lag (light pistols follow fast, heavy launchers follow with weight)
 * - Two-hand aiming (barrel aligns from rear trigger hand to front support hand)
 * - Foregrip support ring (shows locked green ring when attached; pulsing amber guide when needed)
 * - Unsupported two-handed weapon droop & unsteady wobble
 * - Aim laser line and glowing aim dot extending forward from the muzzle
 */
import * as THREE from 'three';
import { Turntable } from './Turntable.js';
import { RecoilSpring } from './RecoilSpring.js';
import { MuzzleFlash } from '../effects/MuzzleFlash.js';
import { GPUSmoke } from '../effects/GPUSmoke.js';
import { BulletTracers } from '../effects/BulletTracers.js';
import { BrassCasings } from '../effects/BrassCasings.js';
import { Sparks } from '../effects/Sparks.js';
import { MagicManager } from '../magic/MagicManager.js';

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

    // 7. Aim Laser & Aim Dot
    this.setupAimLaser();

    // 8. Foregrip Support Ring
    this.setupSupportRing();

    // 8b. Subtle Armed Indicator Light on Gun
    this.setupArmedIndicator();
    this.showAimLaser = false;

    // 9. Visual Effects
    this.muzzleFlash = new MuzzleFlash(this.scene);
    this.gpuSmoke = new GPUSmoke(this.scene, 1000);
    this.bulletTracers = new BulletTracers(this.scene, 50);
    this.sparks = new Sparks(this.scene, 80);
    this.brassCasings = new BrassCasings(this.scene, 40, () => {
      if (this.onCasingBounce) this.onCasingBounce();
    });

    // 10. Magic Manager Module
    this.magicManager = new MagicManager(this.scene, this.camera, this.renderer);
    this.section = 'guns'; // 'guns' or 'magic'

    // Weapon state
    this.currentGunGroup = null;
    this.currentGunMeta = null;
    this.isGunHeld = false;
    this.heldLerp = 0; // 0 = at stand, 1 = in hand
    this.lastMuzzleWorld = new THREE.Vector3();
    this.weaponVelocity = new THREE.Vector3();
    this.prevWeaponPos = new THREE.Vector3();

    // Weight & follow smoothing
    this.currentFollowPos = new THREE.Vector3();
    this.currentFollowQuat = new THREE.Quaternion();
    this.isSupportAttached = false;

    window.addEventListener('resize', () => this.onResize());
  }

  setSection(section) {
    this.section = section;
    if (section === 'magic') {
      this.turntable.mountNode.visible = false;
      this.weaponRoot.visible = false;
      this.aimLaser.visible = false;
      this.aimDot.visible = false;
      this.supportRing.visible = false;
      this.magicManager.enabled = true;
    } else {
      this.turntable.mountNode.visible = true;
      this.weaponRoot.visible = true;
      if (this.isGunHeld) {
        this.aimLaser.visible = true;
        this.aimDot.visible = true;
      }
      this.magicManager.cleanupActiveEffects();
      this.magicManager.enabled = false;
    }
  }

  setupAimLaser() {
    // Thin laser line
    const laserGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    laserGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const laserMat = new THREE.LineBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.aimLaser = new THREE.Line(laserGeo, laserMat);
    this.aimLaser.frustumCulled = false;
    this.aimLaser.visible = false;
    this.scene.add(this.aimLaser);

    // Glowing aim dot
    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = dotCanvas.height = 32;
    const dotCtx = dotCanvas.getContext('2d');
    const grad = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 60, 60, 0.9)');
    grad.addColorStop(0.65, 'rgba(255, 20, 20, 0.3)');
    grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    dotCtx.fillStyle = grad;
    dotCtx.fillRect(0, 0, 32, 32);

    const dotTex = new THREE.CanvasTexture(dotCanvas);
    const dotMat = new THREE.SpriteMaterial({
      map: dotTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.aimDot = new THREE.Sprite(dotMat);
    this.aimDot.scale.set(0.038, 0.038, 1);
    this.aimDot.visible = false;
    this.scene.add(this.aimDot);
  }

  setupSupportRing() {
    const ringGeo = new THREE.TorusGeometry(0.045, 0.005, 16, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3df0a0,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.supportRing = new THREE.Mesh(ringGeo, ringMat);
    this.supportRing.visible = false;
    this.weaponRoot.add(this.supportRing);
  }

  setupArmedIndicator() {
    const ledGeo = new THREE.SphereGeometry(0.006, 12, 12);
    const ledMat = new THREE.MeshBasicMaterial({
      color: 0x3df0a0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.armedIndicator = new THREE.Mesh(ledGeo, ledMat);
    this.armedIndicator.position.set(0, 0.045, -0.05);
    this.armedIndicator.visible = false;
    this.weaponRoot.add(this.armedIndicator);

    this.armedLight = new THREE.PointLight(0x00ffaa, 0.45, 0.25);
    this.armedLight.position.set(0, 0.045, -0.05);
    this.armedLight.visible = false;
    this.weaponRoot.add(this.armedLight);
  }

  setArmedIndicatorState(isArmed, isSingleHand) {
    if (!this.armedIndicator) return;
    if (this.isGunHeld && isSingleHand) {
      this.armedIndicator.visible = true;
      if (isArmed) {
        this.armedIndicator.material.color.setHex(0x00ffaa); // Vibrant ready green/cyan
        this.armedLight.visible = true;
        this.armedLight.intensity = 0.45;
      } else {
        this.armedIndicator.material.color.setHex(0x334433); // Dim standby
        this.armedLight.visible = false;
      }
    } else {
      this.armedIndicator.visible = false;
      this.armedLight.visible = false;
    }
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

    // Reposition support ring for this gun's foregrip
    const fgDist = gunMeta.foregripDist || 0.26;
    this.supportRing.position.set(0, 0.02, fgDist);
  }

  setHeld(isHeld) {
    this.isGunHeld = isHeld;
    if (!isHeld) {
      this.isSupportAttached = false;
      this.aimLaser.visible = false;
      this.aimDot.visible = false;
      this.supportRing.visible = false;
    }
  }

  getForegripWorldPosition() {
    const fgDist = this.currentGunMeta?.foregripDist || 0.26;
    const local = new THREE.Vector3(0, 0.02, fgDist);
    local.applyMatrix4(this.weaponRoot.matrixWorld);
    return local;
  }

  triggerFire(gunMeta, isUnsupported = false, latchedAim = null) {
    if (!this.currentGunGroup) return;

    // Physical recoil kick (heavier kick if unsupported two-handed rifle/shotgun)
    const extraRecoil = isUnsupported ? 1.8 : 1.0;
    const kickStr = (gunMeta.recoilKick || 1.0) * (gunMeta.big ? 1.4 : 1.0) * extraRecoil;
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

    // Aim latch: use historical aim vector from 100ms earlier if supplied, eliminating thumb-fold hand twitch
    let fwdDir;
    if (latchedAim && latchedAim.fwd) {
      fwdDir = latchedAim.fwd.clone().normalize();
    } else {
      fwdDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.weaponRoot.quaternion).normalize();
    }

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
    if (this.section === 'magic') {
      this.magicManager.update(dt, handTrackingData, mouseControlData);
      this.magicManager.render();
      return;
    }

    // Update Turntable
    this.turntable.update(dt, this.isGunHeld);

    // Smooth pick-up lift transition (0 = at stand, 1 = in hand)
    const targetHeldLerp = this.isGunHeld ? 1.0 : 0.0;
    this.heldLerp += (targetHeldLerp - this.heldLerp) * (1.0 - Math.exp(-dt * 9.0));

    // Stand world position & orientation
    const standPos = this.turntable.getStandWorldPosition();
    const standQuat = new THREE.Quaternion();
    this.turntable.mountNode.getWorldQuaternion(standQuat);

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();

    const gun = this.currentGunMeta || { hands: 'one', weight: 1.0, followSpeed: 20 };
    const isTwoHandGun = gun.hands === 'two';
    const isOptTwoHand = gun.hands === 'optional-two';

    if (this.isGunHeld) {
      if (handTrackingData && (handTrackingData.primaryHand || handTrackingData.position)) {
        const triggerHand = handTrackingData.primaryHand || handTrackingData;
        const supportHand = handTrackingData.secondaryHand || null;

        // Position rear grip at trigger hand
        targetPos.copy(triggerHand.position);

        // Check if support hand attaches to foregrip
        const foregripWorld = this.getForegripWorldPosition();
        let attached = false;

        if (supportHand && (isTwoHandGun || isOptTwoHand)) {
          const distToForegrip = supportHand.position.distanceTo(foregripWorld);
          const isClosedGrip = supportHand.gestures && supportHand.gestures.pose !== 'open';
          // Within 35cm and closed/cupped grip for comfortable attachment
          if (distToForegrip < 0.35 && isClosedGrip) {
            attached = true;
          }
        }
        this.isSupportAttached = attached;

        if (attached && supportHand) {
          // TWO-HAND AIMING: barrel points smoothly along line from trigger hand to support hand
          const fwd = new THREE.Vector3().subVectors(supportHand.position, triggerHand.position).normalize();
          const triggerUp = new THREE.Vector3(0, 1, 0).applyQuaternion(triggerHand.quaternion);
          const right = new THREE.Vector3().crossVectors(fwd, triggerUp).normalize();
          const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

          const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
          targetQuat.setFromRotationMatrix(basis);
        } else {
          // ONE-HAND AIMING
          targetQuat.copy(triggerHand.quaternion);

          // If it's a two-handed gun without support, apply gentle realistic weight droop
          if (isTwoHandGun) {
            const time = performance.now() * 0.001;
            const droopAngle = 0.20; // ~11 degrees natural muzzle sag
            const wobblePitch = Math.sin(time * 1.3) * 0.020 + Math.cos(time * 2.1) * 0.010;
            const wobbleYaw = Math.sin(time * 0.9) * 0.016 + Math.cos(time * 1.7) * 0.008;
            const wobbleRoll = Math.sin(time * 1.5) * 0.012;

            const extraRot = new THREE.Euler(droopAngle + wobblePitch, wobbleYaw, wobbleRoll);
            const extraQuat = new THREE.Quaternion().setFromEuler(extraRot);
            targetQuat.multiply(extraQuat);
          }
        }

        // Update Armed LED Indicator for single-handed firearms
        const isSingleHandGun = gun.hands === 'one' || (isOptTwoHand && !this.isSupportAttached);
        const pG = triggerHand.gestures;
        const isArmed = pG ? pG.isArmed : false;
        this.setArmedIndicatorState(isArmed, isSingleHandGun);
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

        this.isSupportAttached = (isTwoHandGun || isOptTwoHand) && mouseControlData.twoHands !== false;

        // Update Armed LED Indicator for single-handed firearms in mouse mode
        const isSingleHandGun = gun.hands === 'one' || (isOptTwoHand && !this.isSupportAttached);
        this.setArmedIndicatorState(this.isGunHeld, isSingleHandGun);

        // If two-handed weapon is unsupported in mouse mode, apply gentle weight droop
        if (isTwoHandGun && !this.isSupportAttached) {
          const time = performance.now() * 0.001;
          const droopAngle = 0.20;
          const wobblePitch = Math.sin(time * 1.3) * 0.020 + Math.cos(time * 2.1) * 0.010;
          const wobbleYaw = Math.sin(time * 0.9) * 0.016 + Math.cos(time * 1.7) * 0.008;
          const wobbleRoll = Math.sin(time * 1.5) * 0.012;

          const extraRot = new THREE.Euler(droopAngle + wobblePitch, wobbleYaw, wobbleRoll);
          const extraQuat = new THREE.Quaternion().setFromEuler(extraRot);
          targetQuat.multiply(extraQuat);
        }
      }

      // 4. Per-Gun Weight & Inertia Simulation
      // Lighter guns follow hand faster, heavier guns follow with inertia
      const followSpeed = gun.followSpeed || 15.0;
      const followAlpha = 1.0 - Math.exp(-followSpeed * dt);

      if (this.currentFollowPos.lengthSq() < 0.001) {
        this.currentFollowPos.copy(targetPos);
        this.currentFollowQuat.copy(targetQuat);
      } else {
        this.currentFollowPos.lerp(targetPos, followAlpha);
        this.currentFollowQuat.slerp(targetQuat, followAlpha);
      }

      // Blend smoothly between Stand and Hand
      this.weaponRoot.position.lerpVectors(standPos, this.currentFollowPos, this.heldLerp);
      this.weaponRoot.quaternion.slerpQuaternions(standQuat, this.currentFollowQuat, this.heldLerp);

      // Subtle idle breathing sway when held
      if (this.heldLerp > 0.8) {
        const time = performance.now() * 0.002;
        const swayStrength = this.isSupportAttached ? 0.002 : 0.005;
        const swayX = Math.sin(time * 0.8) * swayStrength;
        const swayY = Math.cos(time * 1.2) * swayStrength;
        this.weaponRoot.position.x += swayX;
        this.weaponRoot.position.y += swayY;
      }
    } else {
      // Resting on pedestal
      this.weaponRoot.position.lerpVectors(standPos, targetPos, this.heldLerp);
      this.weaponRoot.quaternion.slerpQuaternions(standQuat, targetQuat, this.heldLerp);
      if (this.heldLerp < 0.01) {
        this.weaponRoot.position.copy(standPos);
        this.weaponRoot.quaternion.copy(standQuat);
        this.currentFollowPos.copy(standPos);
        this.currentFollowQuat.copy(standQuat);
      }
    }

    // 5. Update Foregrip Ring Visuals
    if (this.isGunHeld && this.heldLerp > 0.7 && (isTwoHandGun || isOptTwoHand)) {
      this.supportRing.visible = true;
      const time = performance.now() * 0.005;
      if (this.isSupportAttached) {
        // Locked support hand: vibrant cyan/green
        this.supportRing.material.color.setHex(0x3df0a0);
        this.supportRing.material.opacity = 0.85;
        this.supportRing.scale.setScalar(1.0 + Math.sin(time * 3) * 0.04);
      } else {
        // Needs support: pulsing amber warning guide
        this.supportRing.material.color.setHex(0xffaa33);
        this.supportRing.material.opacity = 0.5 + Math.sin(time * 6) * 0.3;
        this.supportRing.scale.setScalar(1.08 + Math.sin(time * 6) * 0.12);
      }
    } else {
      this.supportRing.visible = false;
    }

    // 6. Update Aim Laser & Aim Dot
    const triggerHand = handTrackingData?.primaryHand || handTrackingData;
    const isSingleHand = !isTwoHandGun && !this.isSupportAttached;
    const isArmed = triggerHand?.gestures?.isArmed;
    const shouldShowLaser = this.showAimLaser || (isSingleHand && isArmed);

    if (this.isGunHeld && this.heldLerp > 0.6 && shouldShowLaser) {
      const muzzleNode = this.currentGunGroup
        ? (this.currentGunGroup.getObjectByName('muzzle') || this.currentGunGroup.userData?.muzzle)
        : null;
      const muzzleWorld = new THREE.Vector3();
      if (muzzleNode && typeof muzzleNode.getWorldPosition === 'function') {
        muzzleNode.getWorldPosition(muzzleWorld);
      } else {
        muzzleWorld.copy(this.weaponRoot.position);
      }

      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.weaponRoot.quaternion).normalize();
      const laserDist = 4.5;
      const endWorld = muzzleWorld.clone().addScaledVector(fwd, laserDist);

      const posAttr = this.aimLaser.geometry.attributes.position;
      posAttr.setXYZ(0, muzzleWorld.x, muzzleWorld.y, muzzleWorld.z);
      posAttr.setXYZ(1, endWorld.x, endWorld.y, endWorld.z);
      posAttr.needsUpdate = true;

      this.aimDot.position.copy(endWorld);
      this.aimLaser.visible = true;
      this.aimDot.visible = true;
    } else {
      this.aimLaser.visible = false;
      this.aimDot.visible = false;
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
    if (this.magicManager) {
      this.magicManager.onResize();
    }
  }
}
