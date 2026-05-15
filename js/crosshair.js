/**
 * Per-weapon crosshair + sniper scope system.
 * Manages crosshair DOM classes, spread gap, ADS scope overlay, FOV zoom.
 */
export class Crosshair {
  constructor(camera) {
    this.camera       = camera;
    this.baseFOV      = 75;
    this._fovCurrent  = 75;
    this._fovTarget   = 75;
    this._weaponId    = '';
    this._isADS       = false;

    this.el      = document.getElementById('crosshair');
    this.scopeEl = document.getElementById('scope-overlay');
  }

  /** Call after class selection — wires up the right crosshair style */
  setWeapon(cls) {
    this._weaponId = cls.crosshairId ?? 'default';
    this.el.className = 'ch-' + this._weaponId;
    this._endADS();
    this._updateGap(0);
  }

  /** Right-click: enter / leave ADS */
  setADS(active) {
    if (active) {
      this._isADS = true;
      if (this._weaponId === 'sniper') {
        // Full scope overlay for sniper
        this.scopeEl.style.display = 'flex';
        this.el.style.display      = 'none';
        this._fovTarget = 20;
      } else {
        // Other weapons: just slow down + slight FOV change
        this._fovTarget = 62;
      }
    } else {
      this._endADS();
    }
  }

  _endADS() {
    this._isADS = false;
    this.scopeEl.style.display = 'none';
    this.el.style.display      = 'block';
    this._fovTarget = this.baseFOV;
  }

  /**
   * Update crosshair spread gap every frame.
   * spreadNorm: 0 = standing still, 1 = full sprint
   */
  setSpread(spreadNorm) {
    if (!this._isADS) this._updateGap(spreadNorm);
  }

  _updateGap(norm) {
    const gap = Math.round(4 + norm * 22);
    this.el.style.setProperty('--ch-gap', gap + 'px');
  }

  get isADS() { return this._isADS; }

  /** Call every frame for smooth FOV lerp */
  update(delta) {
    if (Math.abs(this._fovCurrent - this._fovTarget) > 0.05) {
      this._fovCurrent += (this._fovTarget - this._fovCurrent) * Math.min(1, delta * 14);
      this.camera.fov = this._fovCurrent;
      this.camera.updateProjectionMatrix();
    }
  }
}
