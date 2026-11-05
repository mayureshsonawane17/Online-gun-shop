/**
 * DebugOverlay.js
 * Diagnostic telemetry HUD toggled via the 'D' key
 * Shows detected pose, thumb ratio r, r-velocity, trigger state, grip stability gate,
 * two-hand support status, and FPS.
 */
export class DebugOverlay {
  constructor() {
    this.visible = false;
    this.firstErrorLogged = false;

    // Create HUD container
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.style.cssText = `
      position: fixed;
      top: 236px;
      left: 40px;
      background: rgba(25, 27, 34, 0.90);
      color: #79f2c3;
      font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.6;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid rgba(121, 242, 195, 0.4);
      z-index: 9999;
      pointer-events: none;
      display: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      backdrop-filter: blur(6px);
      min-width: 200px;
    `;
    document.body.appendChild(this.el);

    // FPS counter
    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsUpdate = performance.now();

    // Catch runtime errors
    window.addEventListener('error', (e) => {
      if (!this.firstErrorLogged) {
        console.error('[GunShop First Error]:', e.error || e.message);
        this.firstErrorLogged = true;
      }
    });

    window.addEventListener('unhandledrejection', (e) => {
      if (!this.firstErrorLogged) {
        console.error('[GunShop First Promise Rejection]:', e.reason);
        this.firstErrorLogged = true;
      }
    });

    // 'D' key toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') {
        this.toggle();
      }
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(trackingData, mode = 'cam', isSupportAttached = false, currentGun = null, section = 'guns', magicData = null) {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    if (!this.visible) return;

    if (section === 'magic' && magicData) {
      const power = magicData.activePower;
      const energy = Math.round(magicData.energy);
      const actions = magicData.actions || {};
      const numHands = trackingData ? (trackingData.numHands || 0) : 0;

      let actionText = 'IDLE';
      let actionColor = '#aaa';
      if (actions.isBeamFiring) { actionText = 'BEAM FIRING'; actionColor = '#00e5ff'; }
      else if (actions.isCuppedCharging) { actionText = `CHARGING (${Math.round(actions.chargeAmount * 100)}%)`; actionColor = '#ffea75'; }
      else if (actions.isVortexActive) { actionText = 'AIR VORTEX'; actionColor = '#69f0ae'; }
      else if (actions.isLiftingWaterOrb) { actionText = 'WATER ORB'; actionColor = '#00b0ff'; }
      else if (actions.isFistRaised) { actionText = 'EARTH SUMMON'; actionColor = '#ff9100'; }
      else if (actions.isFlamethrower) { actionText = 'INFERNO'; actionColor = '#ff3d00'; }
      else if (actions.isHexShieldActive) { actionText = 'HEX BARRIER'; actionColor = '#b388ff'; }

      this.el.innerHTML = `
        <div style="font-weight:bold;color:#fff;border-bottom:1px solid #444;padding-bottom:4px;margin-bottom:6px;display:flex;justify-content:space-between">
          <span>MAGIC SANCTUM TELEMETRY</span>
          <span style="color:#aaa">[D]</span>
        </div>
        <div>FPS: <b style="color:#fff">${this.fps}</b></div>
        <div>Mode: <b style="color:#fff">${mode}</b></div>
        <div>Hands: <b style="color:#fff">${numHands}</b></div>
        <div>Power: <b style="color:${power.themeColor}">${power.name}</b> (${power.badge})</div>
        <div>Energy: <b style="color:#fff">${energy} / 100</b></div>
        <div>Action: <b style="color:${actionColor}">${actionText}</b></div>
        <div>Hint: <i style="color:#bbb">${power.controlsHint}</i></div>
      `;
      return;
    }

    const primary = trackingData?.primaryHand || trackingData;
    const secondary = trackingData?.secondaryHand || null;
    const g = primary ? primary.gestures : null;
    const dbg = g ? g.debug : {};
    const numHands = trackingData ? (trackingData.numHands || (trackingData.position ? 1 : 0)) : 0;

    const triggerColor = dbg.triggerState === 'FIRED' ? '#ff4d4d' : (dbg.isArmed ? '#3df0a0' : '#aaa');
    const gripColor = dbg.gripChanging ? '#ffaa33' : '#79f2c3';
    const supportColor = isSupportAttached ? '#3df0a0' : (currentGun?.hands === 'two' ? '#ff5555' : '#888');

    const aimVec = primary?.position ? `[${(primary.position.x).toFixed(2)}, ${(primary.position.y).toFixed(2)}, ${(primary.position.z).toFixed(2)}]` : 'N/A';
    const isSingleHand = currentGun?.hands === 'one' || (currentGun?.hands === 'optional-two' && !isSupportAttached);

    this.el.innerHTML = `
      <div style="font-weight:bold;color:#fff;border-bottom:1px solid #444;padding-bottom:4px;margin-bottom:6px;display:flex;justify-content:space-between">
        <span>GUN SHOP TELEMETRY</span>
        <span style="color:#aaa">[D]</span>
      </div>
      <div>FPS: <b style="color:#fff">${this.fps}</b></div>
      <div>Mode: <b style="color:#fff">${mode}</b></div>
      <div>Hands: <b style="color:#fff">${numHands}</b> ${secondary ? '(2-Hand Active)' : ''}</div>
      <div>Pose: <b style="color:#ffea75">${dbg.pose || 'none'}</b> ${dbg.pose === 'two_finger_gun' ? '🎯' : ''}</div>
      <div>Finger Angle: <b style="color:#fff">${dbg.fingerAngle || '0.0°'}</b> (≤20° Parallel)</div>
      <div>Thumb Ratio (r): <b style="color:#fff">${dbg.r || '0.00'}</b> (Arm: >0.62, Fire: <0.42)</div>
      <div>r Velocity: <b>${dbg.rVel || '0.0'}</b> /s</div>
      <div>Armed State: <b style="color:${dbg.isArmed ? '#3df0a0' : '#888'}">${dbg.isArmed ? 'ARMED (READY)' : 'DISARMED'}</b></div>
      <div>Trigger: <b style="color:${triggerColor}">${dbg.triggerState || 'IDLE'}</b></div>
      <div>Aim Vector: <b style="color:#fff">${aimVec}</b></div>
      <div>Grip Gate: <b style="color:${gripColor}">${dbg.gripChanging ? 'CHANGING (GATED)' : 'STABLE'}</b></div>
      ${isSingleHand ? `<div>Scheme: <b style="color:#3df0a0">TWO-FINGER GUN (Single Hand)</b></div>` : `<div>Support Hand: <b style="color:${supportColor}">${isSupportAttached ? 'ATTACHED (LOCKED)' : (currentGun?.hands === 'two' ? 'NEEDED (DROOPING)' : 'NOT NEEDED')}</b></div>`}
      <div>Fist Hold: <b>${dbg.fistTime || '0.00'}s</b> (grab at 0.2s)</div>
      <div>Open Palm: <b>${dbg.openTime || '0.00'}s</b> (drop at 0.5s)</div>
    `;
  }
}
