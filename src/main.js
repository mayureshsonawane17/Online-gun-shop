/**
 * main.js
 * Application entry point for the 3D Webcam Hand-Gesture Online Gun Shop
 * Integrates Three.js 3D rendering, MediaPipe hand tracking with 1€ filter,
 * scale-invariant multi-condition gesture firing, layered Web Audio synthesis,
 * GPU instanced smoke, and interactive UI.
 */
import * as THREE from 'three';
window.THREE = THREE;
import { GUN_LIST } from './models/GunRegistry.js';
import { GunModelLoader } from './models/GunModelLoader.js';
import { SceneManager } from './scene/SceneManager.js';
import { HandTracker } from './tracking/HandTracker.js';
import { GunAudio } from './audio/GunAudio.js';
import { UIManager } from './ui/UIManager.js';
import { DebugOverlay } from './ui/DebugOverlay.js';

class GunShopApp {
  constructor() {
    this.canvas = document.querySelector('#c');
    this.video = document.querySelector('#v');
    this.intro = document.querySelector('#intro');
    this.hud = document.querySelector('#hud');

    // State
    this.mode = 'intro'; // 'intro', 'cam', 'mouse'
    this.sel = 0;
    this.gunList = GUN_LIST;
    this.ammo = this.gunList.map(g => g.mag);
    this.held = false;
    this.reloading = false;
    this.lastFireTime = 0;
    this.barrelHeat = 0;
    this.prevFrameTime = performance.now();

    // Mouse controls fallback
    this.mouse = { x: 0.22, y: -0.15, down: false, click: false, angle: 0, hasMoved: false };

    // Subsystems
    this.audio = new GunAudio();
    this.sceneManager = new SceneManager(this.canvas);
    this.modelLoader = new GunModelLoader();
    this.debugOverlay = new DebugOverlay();
    this.handTracker = new HandTracker(this.video, this.sceneManager.camera);

    // Audio callback for shell casing ground tinkle
    this.sceneManager.onCasingBounce = () => {
      this.audio.playMechanical('tinkle');
    };

    // UI Manager
    this.ui = new UIManager(
      this.gunList,
      (idx) => this.selectGun(idx),
      () => this.fire(performance.now()),
      () => this.reload(),
      () => this.reset(),
      () => this.startCalibration()
    );

    this.setupEventListeners();
    this.selectGun(0);

    // Run animation loop
    requestAnimationFrame((t) => this.loop(t));
  }

  setupEventListeners() {
    // Unlock AudioContext on first user interaction
    const unlockAudio = () => {
      this.audio.ensureContext();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Mode selection
    document.querySelector('#mouse').onclick = () => this.startMode('mouse');
    document.querySelector('#go').onclick = () => this.startCameraMode();

    // Mouse pointer events
    window.addEventListener('pointermove', (e) => {
      const ndcX = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      const ndcY = Math.max(-1, Math.min(1, 1 - (e.clientY / window.innerHeight) * 2));
      this.mouse.x = ndcX;
      this.mouse.y = ndcY;
      this.mouse.angle = -ndcX * 0.35;
      this.mouse.hasMoved = true;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.click = true;
        if (!this.held && this.mode === 'mouse') {
          // Check if clicked near stand in bottom-left
          const standScreen = { x: window.innerWidth * 0.22, y: window.innerHeight * 0.72 };
          const dist = Math.hypot(e.clientX - standScreen.x, e.clientY - standScreen.y);
          if (dist < 180) {
            this.grab();
          }
        }
      }
    });

    window.addEventListener('pointerup', () => {
      this.mouse.down = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.mode === 'mouse') {
        e.preventDefault();
        this.drop();
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.fire(performance.now());
      } else if (e.key === 'r' || e.key === 'R') {
        this.reload();
      } else if (e.key === 'Escape') {
        this.drop();
      } else if (e.key === 'ArrowRight') {
        this.selectGun((this.sel + 1) % this.gunList.length);
      } else if (e.key === 'ArrowLeft') {
        this.selectGun((this.sel + this.gunList.length - 1) % this.gunList.length);
      }
    });
  }

  async selectGun(idx) {
    this.sel = idx;
    const gun = this.gunList[idx];
    this.audio.playMechanical('slide');

    if (this.ui) {
      this.ui.updateSelection(idx);
    }

    // Load and normalize 3D model
    const gunModel = await this.modelLoader.loadGun(gun);
    this.sceneManager.attachGun(gunModel, gun);
  }

  startMode(mode) {
    this.mode = mode;
    this.audio.init();
    this.intro.hidden = true;
    this.hud.hidden = false;
  }

  async startCameraMode() {
    const btn = document.querySelector('#go');
    this.audio.init();
    btn.textContent = 'Starting camera…';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.video.classList.add('on');

      btn.textContent = 'Loading hand tracking…';
      await this.handTracker.init((status) => {
        btn.textContent = status;
      });

      this.startMode('cam');

      // Check first-time calibration
      const hasCalibrated = localStorage.getItem('gun_shop_gesture_calibration');
      if (!hasCalibrated) {
        setTimeout(() => this.startCalibration(), 1200);
      }
    } catch (e) {
      console.error('Camera initialization failed', e);
      btn.textContent = 'Camera failed — try mouse mode';
    }
  }

  startCalibration() {
    this.ui.showToast('Starting 3-second calibration: keep hand relaxed…', 3000);
    this.handTracker.gestureDetector.startCalibration(
      (progressMsg) => this.ui.showToast(progressMsg, 2000),
      (completeMsg) => this.ui.showToast(completeMsg, 3500)
    );
  }

  grab() {
    if (this.held) return;
    this.held = true;
    this.sceneManager.setHeld(true);
    this.audio.playMechanical('pickup');
  }

  drop() {
    if (!this.held) return;
    this.held = false;
    this.sceneManager.setHeld(false);
    this.audio.playMechanical('slide');
  }

  fire(now) {
    const gun = this.gunList[this.sel];
    if (this.reloading || this.ammo[this.sel] <= 0) {
      if (this.ammo[this.sel] <= 0 && !this.reloading) {
        this.audio.playMechanical('dryfire');
      }
      return;
    }

    if (now - this.lastFireTime < gun.rate) return;
    this.lastFireTime = now;
    this.ammo[this.sel]--;

    // If firing while on stand, auto pick up
    if (!this.held) {
      this.grab();
    }

    // Heat up barrel for post-shot smoke wisps
    this.barrelHeat = Math.min(this.barrelHeat + 0.35, 2.2);

    // Audio layered synthesis
    const panX = this.sceneManager.weaponRoot.position.x;
    this.audio.playShot(gun, panX);

    // Trigger visual gunfire effects (flash, tracers, 3D casing, smoke blast, recoil spring)
    this.sceneManager.triggerFire(gun);

    // Auto reload when empty
    if (this.ammo[this.sel] === 0) {
      setTimeout(() => this.reload(), 400);
    }
  }

  reload() {
    if (this.reloading || this.ammo[this.sel] === this.gunList[this.sel].mag) return;
    this.reloading = true;
    this.audio.playMechanical('reload');

    const i = this.sel;
    setTimeout(() => {
      this.ammo[i] = this.gunList[i].mag;
      this.reloading = false;
    }, this.gunList[i].reloadTime);
  }

  reset() {
    this.drop();
    this.ammo.forEach((_, i) => (this.ammo[i] = this.gunList[i].mag));
    this.reloading = false;
    this.barrelHeat = 0;
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min((now - this.prevFrameTime) / 1000, 0.05);
    this.prevFrameTime = now;

    const gun = this.gunList[this.sel];
    let trackingData = null;

    // 1. Process Input
    if (this.mode === 'cam') {
      trackingData = this.handTracker.update(now);

      if (trackingData && trackingData.gestures) {
        const g = trackingData.gestures;

        // Grabbing: fist held inside grab radius near stand
        if (!this.held) {
          const standScreen = { x: window.innerWidth * 0.22, y: window.innerHeight * 0.72 };
          const dist = Math.hypot(trackingData.screen.x - standScreen.x, trackingData.screen.y - standScreen.y);
          if (dist < 220 && g.fistFrames > 5) {
            this.grab();
          }
        } else {
          // Putting gun away: open palm held
          if (g.openFrames > 14) {
            this.drop();
          }

          // Firing automatically from hand gesture
          if (this.held) {
            if (gun.auto) {
              if (g.isTriggerDown) {
                this.fire(now);
              }
            } else {
              if (g.justFired) {
                this.fire(now);
              }
            }
          }

          // Hand Swipe Left/Right to cycle guns
          if (g.swipeDirection !== 0) {
            if (g.swipeDirection > 0) {
              this.selectGun((this.sel + 1) % this.gunList.length);
            } else {
              this.selectGun((this.sel + this.gunList.length - 1) % this.gunList.length);
            }
          }
        }
      }
    } else if (this.mode === 'mouse') {
      if (this.held) {
        const trig = gun.auto ? this.mouse.down : this.mouse.click;
        if (trig) {
          this.fire(now);
        }
      }
      this.mouse.click = false;
    }

    // 2. Post-shot Barrel Smoke Wisps (rising continuously after shooting)
    if (this.barrelHeat > 0.05) {
      this.barrelHeat = Math.max(0, this.barrelHeat - dt * 0.25);
      if (Math.random() < 0.25) {
        const muzzleNode = this.sceneManager.currentGunGroup
          ? (this.sceneManager.currentGunGroup.getObjectByName('muzzle') || this.sceneManager.currentGunGroup.userData?.muzzle)
          : null;
        if (muzzleNode && typeof muzzleNode.getWorldPosition === 'function') {
          const mPos = new THREE.Vector3();
          muzzleNode.getWorldPosition(mPos);
          this.sceneManager.gpuSmoke.emitBarrelWisp(mPos, this.sceneManager.weaponVelocity, this.barrelHeat);
        }
      }
    }

    // 3. Update Scene & Effects
    this.sceneManager.update(dt, trackingData, this.mouse);

    // 4. Update UI & Debug
    const isFiring = now - this.lastFireTime < 250;
    this.ui.updateHUD(gun, this.ammo[this.sel], this.held, this.reloading, isFiring, this.mode);
    this.ui.updateThumbnails(dt);
    this.debugOverlay.update(trackingData, this.mode);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  window.app = new GunShopApp();
});
