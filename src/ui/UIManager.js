/**
 * UIManager.js
 * Manages the interface, drawer modal with animated 3D rotating thumbnails,
 * interactive HUD, calibration overlays, and pill controls.
 */
import * as THREE from 'three';
import { ProceduralGuns } from '../models/ProceduralGuns.js';

export class UIManager {
  constructor(gunList, onSelectGun, onFire, onReload, onReset, onRecalibrate) {
    this.gunList = gunList;
    this.onSelectGun = onSelectGun;
    this.onFire = onFire;
    this.onReload = onReload;
    this.onReset = onReset;
    this.onRecalibrate = onRecalibrate;

    this.selectedGunIndex = 0;
    this.isDrawerOpen = false;
    this.thumbnailItems = [];

    this.initDOM();
  }

  initDOM() {
    this.pickBtn = document.querySelector('#pick');
    this.pickCanvas = document.querySelector('#pick canvas');
    this.pickLabel = document.querySelector('#pick b');
    this.pickSub = document.querySelector('#pick2 small');
    this.drawers = document.querySelector('#drawers');
    this.grid = document.querySelector('#grid');
    this.hud = document.querySelector('#hud');
    this.hudLab = document.querySelector('#lab');
    this.hudIns = document.querySelector('#ins');
    this.hudAm = document.querySelector('#am');
    this.hudBar = document.querySelector('#bar i');
    this.intro = document.querySelector('#intro');
    this.calibToast = document.querySelector('#calib-toast');

    // Drawer grid setup
    this.setupDrawerGrid();

    // Event listeners
    document.querySelector('#x').onclick = () => this.closeDrawer();
    this.pickBtn.onclick = () => this.openDrawer();
    document.querySelector('#pick2').onclick = () => this.openDrawer();
    document.querySelector('#sw').onclick = () => this.openDrawer();
    document.querySelector('#rs').onclick = () => this.onReset();
    document.querySelector('#fire-btn').onclick = () => this.onFire();
    document.querySelector('#recal-btn').onclick = () => this.onRecalibrate();
  }

  setupDrawerGrid() {
    this.grid.innerHTML = this.gunList.map((g, i) => `
      <button class="drawer-gun-btn" data-index="${i}">
        <canvas class="thumb-canvas" width="220" height="110"></canvas>
        <b>${g.name}</b>
        <i>${g.category} · ${g.mag} rounds</i>
      </button>
    `).join('');

    this.grid.onclick = (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        const idx = parseInt(btn.dataset.index, 10);
        this.selectGun(idx);
        this.closeDrawer();
      }
    };

    // Render 3D thumbnails for visible drawer guns using a single offscreen renderer
    this.initThumbnails();
  }

  initThumbnails() {
    // Single shared offscreen renderer for all 3D thumbnails to prevent WebGL context exhaustion
    this.thumbCanvas = document.createElement('canvas');
    this.thumbCanvas.width = 220;
    this.thumbCanvas.height = 110;
    this.thumbRenderer = new THREE.WebGLRenderer({ canvas: this.thumbCanvas, alpha: true, antialias: true });
    this.thumbRenderer.setSize(220, 110);

    this.thumbScene = new THREE.Scene();
    this.thumbCamera = new THREE.PerspectiveCamera(40, 220 / 110, 0.1, 10);
    this.thumbCamera.position.set(0, 0.05, 0.42);

    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(1, 2, 2);
    this.thumbScene.add(light);
    this.thumbScene.add(new THREE.AmbientLight(0xffffff, 0.85));

    this.thumbnailItems = [];
    const canvases = this.grid.querySelectorAll('.thumb-canvas');
    canvases.forEach((canvas, idx) => {
      const gun = this.gunList[idx];
      const ctx = canvas.getContext('2d');
      const gunGroup = ProceduralGuns.createGun(gun.category, {
        isAK: gun.name.includes('AK'),
        isTan: gun.name.toLowerCase().includes('tan')
      });
      const targetThumbLength = 0.32;
      const len = gun.length || 0.45;
      const scale = targetThumbLength / len;
      gunGroup.scale.setScalar(scale);
      gunGroup.rotation.y = Math.PI / 4;

      this.thumbnailItems.push({
        canvas,
        ctx,
        gunGroup,
        rotationY: Math.PI / 4
      });
    });

    this.renderAllThumbnails();
    this.updatePickCanvas(this.gunList[this.selectedGunIndex]);
  }

  renderAllThumbnails() {
    for (const item of this.thumbnailItems) {
      this.renderSingleThumbnail(item);
    }
  }

  renderSingleThumbnail(item) {
    while (this.thumbScene.children.length > 2) {
      this.thumbScene.remove(this.thumbScene.children[this.thumbScene.children.length - 1]);
    }
    item.gunGroup.rotation.y = item.rotationY;
    this.thumbScene.add(item.gunGroup);
    this.thumbRenderer.render(this.thumbScene, this.thumbCamera);
    item.ctx.clearRect(0, 0, 220, 110);
    item.ctx.drawImage(this.thumbCanvas, 0, 0);
  }

  updateThumbnails(dt) {
    if (!this.isDrawerOpen) return;
    const drawerRect = this.drawers.getBoundingClientRect();
    for (const item of this.thumbnailItems) {
      const rect = item.canvas.getBoundingClientRect();
      if (rect.bottom >= drawerRect.top && rect.top <= drawerRect.bottom) {
        item.rotationY += dt * 0.9;
        this.renderSingleThumbnail(item);
      }
    }
  }

  updatePickCanvas(gun) {
    if (!this.pickCanvas || !this.thumbRenderer) return;
    const ctx = this.pickCanvas.getContext('2d');
    const gunGroup = ProceduralGuns.createGun(gun.category, {
      isAK: gun.name.includes('AK'),
      isTan: gun.name.toLowerCase().includes('tan')
    });
    const targetThumbLength = 0.32;
    const len = gun.length || 0.45;
    const scale = targetThumbLength / len;
    gunGroup.scale.setScalar(scale);
    gunGroup.rotation.y = Math.PI / 4;
    while (this.thumbScene.children.length > 2) {
      this.thumbScene.remove(this.thumbScene.children[this.thumbScene.children.length - 1]);
    }
    this.thumbScene.add(gunGroup);
    this.thumbRenderer.render(this.thumbScene, this.thumbCamera);
    ctx.clearRect(0, 0, 192, 88);
    ctx.drawImage(this.thumbCanvas, 0, 0, 192, 88);
  }

  openDrawer() {
    this.isDrawerOpen = true;
    this.drawers.hidden = false;
    this.intro.style.visibility = 'hidden';
    const buttons = this.grid.querySelectorAll('button');
    buttons.forEach((b, i) => b.classList.toggle('on', i === this.selectedGunIndex));
    this.renderAllThumbnails();
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    this.drawers.hidden = true;
    this.intro.style.visibility = '';
  }

  updateSelection(idx) {
    this.selectedGunIndex = idx;
    const g = this.gunList[idx];
    this.pickLabel.innerHTML = `${g.name} <i>${g.category}</i>`;
    this.pickSub.textContent = `${g.name} ${g.category} selected`;
    this.updatePickCanvas(g);
  }

  selectGun(idx) {
    this.updateSelection(idx);
    this.onSelectGun(idx);
  }

  showToast(message, duration = 3000) {
    if (!this.calibToast) return;
    this.calibToast.textContent = message;
    this.calibToast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.calibToast.style.opacity = '0';
    }, duration);
  }

  updateHUD(gun, ammoCount, isHeld, isReloading, isFiring, mode = 'cam') {
    const isCam = mode === 'cam';
    const step = !isHeld ? 1 : isFiring ? 3 : 2;

    this.hudLab.textContent = `Step ${step} of 3 · ${isReloading ? 'reloading' : isHeld ? (isFiring ? 'firing' : 'armed') : 'resting'}`;

    this.hudIns.textContent = [
      isCam ? 'Close your fist inside the circle to pick the gun up' : 'Click the stand circle to pick the gun up',
      isCam ? 'Drop thumb or curl index to fire · open palm to put back' : 'Click or Space to fire · right-click to put back',
      isCam ? 'Open your palm to put the gun back' : 'Right-click or Esc to put it back'
    ][step - 1];

    this.hudAm.textContent = `${isReloading ? 'reloading…' : ammoCount + ' / ' + gun.mag + ' rounds'} · ${gun.name}${gun.auto ? ' · full auto' : ' · semi auto'}`;

    this.hudBar.style.width = `${isReloading ? 0 : (ammoCount / gun.mag) * 100}%`;
  }
}
