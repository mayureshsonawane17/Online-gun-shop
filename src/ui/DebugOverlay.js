/**
 * DebugOverlay.js
 * Real-time diagnostic HUD toggled with the 'D' key
 * Shows detected pose, thumb ratio, index ratio, trigger state, FPS counter,
 * and logs the first runtime error to the developer console.
 */
export class DebugOverlay {
  constructor() {
    this.visible = false;
    this.firstErrorLogged = false;

    // Create DOM element
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.style.cssText = `
      position: fixed;
      top: 236px;
      left: 40px;
      background: rgba(25, 27, 34, 0.88);
      color: #79f2c3;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.6;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(121, 242, 195, 0.4);
      z-index: 9999;
      pointer-events: none;
      display: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
    `;
    document.body.appendChild(this.el);

    // Frame rate counting
    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsUpdate = performance.now();

    // Catch first error
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

  update(trackingData, mode = 'cam') {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    if (!this.visible) return;

    const g = trackingData ? trackingData.gestures : null;
    const dbg = g ? g.debug : {};

    this.el.innerHTML = `
      <div style="font-weight:bold;color:#fff;border-bottom:1px solid #444;padding-bottom:4px;margin-bottom:6px">
        GUN SHOP DEBUG [D]
      </div>
      <div>FPS: <b style="color:#fff">${this.fps}</b></div>
      <div>Mode: <b style="color:#fff">${mode}</b></div>
      <div>Hand: <b style="color:#fff">${dbg.handedness || 'None'}</b></div>
      <div>Pose: <b style="color:#ffea75">${dbg.pose || 'none'}</b></div>
      <div>Thumb Ratio: <b>${dbg.thumbRatio || '0.00'}</b></div>
      <div>Index Ratio: <b>${dbg.indexRatio || '0.00'}</b></div>
      <div>Z-Velocity: <b>${dbg.wristVelZ || '0.0'}</b></div>
      <div>Trigger: <b style="color:${dbg.triggerState === 'FIRING' ? '#ff4d4d' : '#79f2c3'}">${dbg.triggerState || 'IDLE'}</b></div>
    `;
  }
}
