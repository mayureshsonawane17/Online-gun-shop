/**
 * UIManager.js
 * Manages the interface, drawer modal with animated 3D rotating thumbnails,
 * interactive HUD, status chips, sensitivity slider, calibration overlays, and pill controls.
 */
import * as THREE from 'three';
import { ProceduralGuns } from '../models/ProceduralGuns.js';

export class UIManager {
  constructor(gunList, powerList, onSelectGun, onSelectPower, onFire, onReload, onReset, onRecalibrate, onSensitivityChange, onSectionSwitch) {
    this.gunList = gunList;
    this.powerList = powerList || [];
    this.onSelectGun = onSelectGun;
    this.onSelectPower = onSelectPower;
    this.onFire = onFire;
    this.onReload = onReload;
    this.onReset = onReset;
    this.onRecalibrate = onRecalibrate;
    this.onSensitivityChange = onSensitivityChange;
    this.onSectionSwitch = onSectionSwitch;

    this.section = 'guns';
    this.selectedGunIndex = 0;
    this.selectedPowerIndex = 0;
    this.isDrawerOpen = false;
    this.isMagicDrawerOpen = false;
    this.thumbnailItems = [];

    this.initDOM();
  }

  initDOM() {
    this.appTitle = document.querySelector('#app-title');
    this.appSubtitle = document.querySelector('#app-subtitle');
    this.btnSecGuns = document.querySelector('#btn-sec-guns');
    this.btnSecMagic = document.querySelector('#btn-sec-magic');

    this.pickBtn = document.querySelector('#pick');
    this.pickCanvas = document.querySelector('#pick canvas');
    this.pickLabel = document.querySelector('#pick b');
    this.pickSub = document.querySelector('#pick2 small');

    this.pickMagicBtn = document.querySelector('#pick-magic');
    this.pickMagicCanvas = document.querySelector('#magic-preview-canvas');
    this.pickMagicTitle = document.querySelector('#active-power-title');

    this.magicEnergyCard = document.querySelector('#magic-energy-card');
    this.energyVal = document.querySelector('#energy-val');
    this.energyBarFill = document.querySelector('#energy-bar-fill');
    this.magicGestureTip = document.querySelector('#magic-gesture-tip');

    this.drawers = document.querySelector('#drawers');
    this.grid = document.querySelector('#grid');
    this.magicDrawers = document.querySelector('#magic-drawers');
    this.magicGrid = document.querySelector('#magic-grid');

    this.hud = document.querySelector('#hud');
    this.hudLab = document.querySelector('#lab');
    this.hudIns = document.querySelector('#ins');
    this.hudAm = document.querySelector('#am');
    this.hudBar = document.querySelector('#bar i');
    this.intro = document.querySelector('#intro');
    this.calibToast = document.querySelector('#calib-toast');

    // Status Chips & Support Hint
    this.chipHand = document.querySelector('#chip-hand');
    this.chipHold = document.querySelector('#chip-hold');
    this.chipTrigger = document.querySelector('#chip-trigger');
    this.supportHint = document.querySelector('#support-hint');

    // Bottom pills
    this.swBtn = document.querySelector('#sw');
    this.fireBtn = document.querySelector('#fire-btn');

    // Section Toggle Events
    if (this.btnSecGuns && this.btnSecMagic) {
      this.btnSecGuns.onclick = () => this.switchSection('guns');
      this.btnSecMagic.onclick = () => this.switchSection('magic');
    }

    // Sensitivity Slider
    this.sensSlider = document.querySelector('#sens-slider');
    this.sensVal = document.querySelector('#sens-val');
    if (this.sensSlider) {
      this.sensSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (this.sensVal) this.sensVal.textContent = `${val.toFixed(2)}x`;
        if (this.onSensitivityChange) this.onSensitivityChange(val);
      };
    }

    // Drawer grid setups
    this.setupDrawerGrid();
    this.setupMagicGrid();

    // Event listeners
    document.querySelector('#x').onclick = () => this.closeDrawer();
    const magicX = document.querySelector('#magic-x');
    if (magicX) magicX.onclick = () => this.closeMagicDrawer();

    this.pickBtn.onclick = () => this.openDrawer();
    if (this.pickMagicBtn) this.pickMagicBtn.onclick = () => this.openMagicDrawer();
    document.querySelector('#pick2').onclick = () => {
      if (this.section === 'magic') this.openMagicDrawer();
      else this.openDrawer();
    };

    if (this.swBtn) {
      this.swBtn.onclick = () => {
        if (this.section === 'magic') this.openMagicDrawer();
        else this.openDrawer();
      };
    }

    document.querySelector('#rs').onclick = () => this.onReset();
    if (this.fireBtn) this.fireBtn.onclick = () => this.onFire();
    document.querySelector('#recal-btn').onclick = () => this.onRecalibrate();
  }

  switchSection(section) {
    if (this.section === section) return;
    this.section = section;

    if (section === 'magic') {
      if (this.btnSecGuns) this.btnSecGuns.classList.remove('active');
      if (this.btnSecMagic) this.btnSecMagic.classList.add('active');
      if (this.pickBtn) this.pickBtn.hidden = true;
      if (this.pickMagicBtn) this.pickMagicBtn.hidden = false;
      if (this.hud) this.hud.hidden = true;
      if (this.magicEnergyCard) this.magicEnergyCard.hidden = false;
      if (this.drawers) this.drawers.hidden = true;
      if (this.supportHint) this.supportHint.hidden = true;
      if (this.appTitle) this.appTitle.innerHTML = 'Magic <i>Sanctum</i>';
      if (this.appSubtitle) this.appSubtitle.textContent = 'Elemental hand-gesture sorcery';
      if (this.swBtn) this.swBtn.textContent = 'switch power';
      if (this.fireBtn) this.fireBtn.textContent = '✨ cast';
    } else {
      if (this.btnSecGuns) this.btnSecGuns.classList.add('active');
      if (this.btnSecMagic) this.btnSecMagic.classList.remove('active');
      if (this.pickBtn) this.pickBtn.hidden = false;
      if (this.pickMagicBtn) this.pickMagicBtn.hidden = true;
      if (this.hud) this.hud.hidden = false;
      if (this.magicEnergyCard) this.magicEnergyCard.hidden = true;
      if (this.magicDrawers) this.magicDrawers.hidden = true;
      if (this.appTitle) this.appTitle.innerHTML = 'Gun <i>Shop</i>';
      if (this.appSubtitle) this.appSubtitle.textContent = 'The online armoury';
      if (this.swBtn) this.swBtn.textContent = 'switch gun';
      if (this.fireBtn) this.fireBtn.textContent = '💥 fire';
    }

    if (this.onSectionSwitch) {
      this.onSectionSwitch(section);
    }
  }

  setupMagicGrid() {
    if (!this.magicGrid || !this.powerList) return;
    this.magicGrid.innerHTML = this.powerList.map((p, i) => `
      <div class="power-card ${i === this.selectedPowerIndex ? 'active' : ''}" data-index="${i}">
        <div class="power-card-top">
          <span class="power-card-badge" style="background:${p.themeColor}">${p.badge}</span>
          <span class="power-card-icon">${p.icon}</span>
        </div>
        <div class="power-card-title">${p.name}</div>
        <div class="power-card-hint">${p.hint}</div>
        <div class="power-card-tip">${p.controlsHint}</div>
      </div>
    `).join('');

    this.magicGrid.onclick = (e) => {
      const card = e.target.closest('.power-card');
      if (card) {
        const idx = parseInt(card.dataset.index, 10);
        this.selectPower(idx);
        this.closeMagicDrawer();
      }
    };

    if (this.powerList.length > 0) {
      this.updateMagicPreviewCanvas(this.powerList[this.selectedPowerIndex]);
    }
  }

  openMagicDrawer() {
    this.isMagicDrawerOpen = true;
    if (this.magicDrawers) this.magicDrawers.hidden = false;
    if (this.intro) this.intro.style.visibility = 'hidden';
    const cards = this.magicGrid.querySelectorAll('.power-card');
    cards.forEach((c, i) => c.classList.toggle('active', i === this.selectedPowerIndex));
  }

  closeMagicDrawer() {
    this.isMagicDrawerOpen = false;
    if (this.magicDrawers) this.magicDrawers.hidden = true;
    if (this.intro) this.intro.style.visibility = '';
  }

  selectPower(idx) {
    this.selectedPowerIndex = idx;
    const power = this.powerList[idx];
    if (this.pickMagicTitle) {
      this.pickMagicTitle.innerHTML = `${power.name} <i>${power.badge}</i>`;
    }
    this.updateMagicPreviewCanvas(power);
    if (this.onSelectPower) this.onSelectPower(idx);
  }

  updateMagicPreviewCanvas(power) {
    if (!this.pickMagicCanvas || !power) return;
    const ctx = this.pickMagicCanvas.getContext('2d');
    const w = this.pickMagicCanvas.width;
    const h = this.pickMagicCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dynamic elemental gradient background
    const grad = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grad.addColorStop(0, power.themeColor);
    grad.addColorStop(0.7, 'rgba(40, 42, 50, 0.85)');
    grad.addColorStop(1, 'rgba(20, 22, 28, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Glowing icon
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = power.themeColor;
    ctx.shadowBlur = 12;
    ctx.fillText(power.icon, w / 2, h / 2);
    ctx.shadowBlur = 0;
  }

  updateMagicEnergy(energy, maxEnergy, activePower) {
    if (!this.magicEnergyCard) return;
    if (this.energyVal) {
      this.energyVal.textContent = `${Math.round(energy)} / ${maxEnergy}`;
    }
    if (this.energyBarFill) {
      const pct = Math.max(0, Math.min(100, (energy / maxEnergy) * 100));
      this.energyBarFill.style.width = `${pct}%`;
      this.energyBarFill.style.background = `linear-gradient(90deg, ${activePower.themeColor}, #ffffff)`;
      this.energyBarFill.style.boxShadow = `0 0 10px ${activePower.themeColor}`;
    }
    if (this.magicGestureTip) {
      this.magicGestureTip.textContent = activePower.tip;
    }
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

  updateStatusChips(trackingData, isHeld, isTriggerDown, isArmed, isGripChanging, mode = 'cam') {
    if (!this.chipHand) return;

    if (mode === 'mouse') {
      this.setChip(this.chipHand, 'info', 'Mouse mode');
      this.setChip(this.chipHold, isHeld ? 'info' : 'off', isHeld ? 'Holding' : 'Resting');
      this.setChip(this.chipTrigger, isTriggerDown ? 'active' : 'on', isTriggerDown ? 'Firing' : 'Trigger ready');
      return;
    }

    const numHands = trackingData ? (trackingData.numHands || 0) : 0;
    if (numHands === 0) {
      this.setChip(this.chipHand, 'off', 'No hand');
    } else if (numHands === 1) {
      this.setChip(this.chipHand, 'on', '1 Hand found');
    } else {
      this.setChip(this.chipHand, 'info', '2 Hands found');
    }

    this.setChip(this.chipHold, isHeld ? 'info' : 'off', isHeld ? 'Holding' : 'Resting');

    if (isTriggerDown) {
      this.setChip(this.chipTrigger, 'active', 'Trigger pressed');
    } else if (isGripChanging) {
      this.setChip(this.chipTrigger, 'warn', 'Grip changing');
    } else if (isArmed) {
      this.setChip(this.chipTrigger, 'on', 'Trigger armed');
    } else {
      this.setChip(this.chipTrigger, 'off', 'Trigger released');
    }
  }

  updateMagicStatusChips(trackingData, activePower, energy, mode = 'cam') {
    if (!this.chipHand) return;

    const numHands = trackingData ? (trackingData.numHands || 0) : 0;
    if (mode === 'mouse') {
      this.setChip(this.chipHand, 'info', 'Mouse Mode');
    } else if (numHands === 0) {
      this.setChip(this.chipHand, 'off', 'No Hand');
    } else if (numHands === 1) {
      this.setChip(this.chipHand, 'on', '1 Hand Found');
    } else {
      this.setChip(this.chipHand, 'info', '2 Hands Found');
    }

    if (activePower) {
      this.setChip(this.chipHold, 'info', `${activePower.name}`);
    }

    const energyPct = Math.round(energy);
    if (energyPct > 40) {
      this.setChip(this.chipTrigger, 'on', `⚡ ${energyPct}% Energy`);
    } else if (energyPct > 15) {
      this.setChip(this.chipTrigger, 'warn', `⚡ ${energyPct}% Low`);
    } else {
      this.setChip(this.chipTrigger, 'off', `⚡ ${energyPct}% Empty`);
    }
  }

  setChip(el, state, text) {
    if (!el) return;
    const dot = el.querySelector('.dot');
    const txt = el.querySelector('.txt');
    if (dot) {
      dot.className = `dot ${state}`;
    }
    if (txt) {
      txt.textContent = text;
    }
  }

  updateSupportHint(isHeld, currentGun, isSupportAttached) {
    if (!this.supportHint) return;
    if (isHeld && currentGun && currentGun.hands === 'two' && !isSupportAttached) {
      this.supportHint.hidden = false;
    } else {
      this.supportHint.hidden = true;
    }
  }

  updateHUD(gun, ammoCount, isHeld, isReloading, isFiring, mode = 'cam', isSupportAttached = false) {
    const isCam = mode === 'cam';
    const step = !isHeld ? 1 : isFiring ? 3 : 2;

    this.hudLab.textContent = `Step ${step} of 3 · ${isReloading ? 'reloading' : isHeld ? (isFiring ? 'firing' : (gun.hands === 'two' && !isSupportAttached ? 'unsupported droop' : 'armed')) : 'resting'}`;

    this.hudIns.textContent = [
      isCam ? 'Hold a fist for 0.2s near the stand to pick up' : 'Click the stand circle to pick up',
      isCam ? 'Press thumb down to fire · hold open palm for 0.5s to put back' : 'Click or Space to fire · right-click to put back',
      isCam ? 'Hold open palm for 0.5s to put gun back' : 'Right-click or Esc to put it back'
    ][step - 1];

    const supportTag = (gun.hands === 'two') ? (isSupportAttached ? ' · 2-hand locked' : ' · needs 2nd hand') : '';
    this.hudAm.textContent = `${isReloading ? 'reloading…' : ammoCount + ' / ' + gun.mag + ' rounds'} · ${gun.name}${gun.auto ? ' · full auto' : ' · semi auto'}${supportTag}`;

    this.hudBar.style.width = `${isReloading ? 0 : (ammoCount / gun.mag) * 100}%`;
  }
}
