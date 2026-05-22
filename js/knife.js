import * as THREE from 'three';

// ── Where the knife sits at rest (left hand, bottom-left of view) ────────────
const REST_POS = new THREE.Vector3(-0.19, -0.23, -0.36);
const REST_ROT = new THREE.Euler(0.22, 0.28, -0.18, 'YXZ');

const STAB_DUR       = 0.44;   // total stab animation time (seconds)
const STAB_THRUST    = 0.30;   // how far the knife lunges forward
const STAB_HIT_AT    = 0.38;   // fraction of animation when hit is checked (peak)

// ── Helpers ──────────────────────────────────────────────────────────────────
function mat(color) {
  return new THREE.MeshLambertMaterial({ color, depthTest: false });
}
function box(w, h, d, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.renderOrder = 999;
  return mesh;
}
function smoothstep(t) { return t * t * (3 - 2 * t); }
function clamp01(t)    { return Math.max(0, Math.min(1, t)); }

// ── Build the 3-D knife mesh ─────────────────────────────────────────────────
function buildKnife() {
  const g = new THREE.Group();
  g.renderOrder = 999;

  const mBlade  = mat(0xbacedd);   // cool steel
  const mShine  = mat(0xdcecf8);   // bright edge
  const mHandle = mat(0x1c0f07);   // dark wood
  const mGuard  = mat(0x252525);   // dark metal

  // ── Blade body (points in -Z = forward in camera space) ────────────────────
  const blade = box(0.017, 0.007, 0.21, mBlade);
  blade.position.set(0, 0.004, -0.135);
  g.add(blade);

  // Sharpened edge highlight strip
  const shine = box(0.005, 0.003, 0.21, mShine);
  shine.position.set(0.008, 0.007, -0.135);
  g.add(shine);

  // Tip (gets narrower)
  const tip = box(0.009, 0.005, 0.07, mBlade);
  tip.position.set(0, 0.003, -0.275);
  g.add(tip);

  // ── Guard (crosspiece) ─────────────────────────────────────────────────────
  const guard = box(0.068, 0.015, 0.017, mGuard);
  guard.position.set(0, 0.001, -0.022);
  g.add(guard);

  // ── Handle ────────────────────────────────────────────────────────────────
  const handle = box(0.023, 0.023, 0.135, mHandle);
  handle.position.set(0, -0.002, 0.082);
  g.add(handle);

  // Grip rings (gives the handle a wrapped look)
  [-0.01, 0.055, 0.115, 0.155].forEach(z => {
    const ring = box(0.027, 0.027, 0.009, mGuard);
    ring.position.set(0, -0.002, z + 0.07);
    g.add(ring);
  });

  // Pommel (end cap)
  const pommel = box(0.030, 0.030, 0.018, mGuard);
  pommel.position.set(0, -0.002, 0.16);
  g.add(pommel);

  return g;
}

// ── KnifeViewmodel ────────────────────────────────────────────────────────────
export class KnifeViewmodel {
  constructor(camera) {
    this.camera      = camera;
    this._group      = null;
    this._visible    = false;
    this._idleT      = 0;

    // Stab animation state
    this._stabbing   = false;
    this._stabT      = 0;
    this._hitChecked = false;

    /**
     * Assign a function here — it is called at the peak of the stab
     * so main.js can do the melee raycast and deal damage at the right moment.
     */
    this.onHitCheck = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  show() {
    if (this._visible) return;
    this._group = buildKnife();
    this._group.position.copy(REST_POS);
    this._group.rotation.copy(REST_ROT);
    this.camera.add(this._group);
    this._group.visible = false;   // hidden until V is pressed
    this._visible = true;
  }

  hide() {
    if (this._group) { this.camera.remove(this._group); this._group = null; }
    this._visible = false;
  }

  // ── Trigger a stab (ignored if one is already in progress) ───────────────
  stab() {
    if (!this._visible || this._stabbing) return;
    if (this._group) this._group.visible = true;   // reveal for the animation
    this._stabbing   = true;
    this._stabT      = 0;
    this._hitChecked = false;
  }

  get isStabbing() { return this._stabbing; }

  // ── Update — called every frame from the game loop ───────────────────────
  update(delta, moveSpeed) {
    if (!this._visible || !this._group) return;

    this._idleT += delta;

    // Gentle idle sway (breathing feel)
    const idleY = Math.sin(this._idleT * 1.22) * 0.0028;
    const idleX = Math.sin(this._idleT * 0.68) * 0.0010;

    // Walk bob
    const walkFrac = Math.min(1, moveSpeed / 6);
    const walkY    = Math.sin(this._idleT * 9)   * 0.017 * walkFrac;
    const walkX    = Math.sin(this._idleT * 4.5) * 0.006 * walkFrac;

    // Stab offsets (all zero when idle)
    let stabZ = 0, stabY = 0, stabRotX = 0, stabRotZ = 0;

    if (this._stabbing) {
      this._stabT += delta;
      const p = clamp01(this._stabT / STAB_DUR);

      if (p < 0.40) {
        // ── Lunge forward ────────────────────────────────────────
        const t  = smoothstep(p / 0.40);
        stabZ    = -t * STAB_THRUST;   // surge toward target
        stabY    =  t * 0.042;          // slight upward drive
        stabRotX = -t * 0.26;           // tip tilts down toward victim
        stabRotZ =  t * 0.07;
      } else {
        // ── Pull back ────────────────────────────────────────────
        const t  = smoothstep((p - 0.40) / 0.60);
        stabZ    = -(1 - t) * STAB_THRUST;
        stabY    =  (1 - t) * 0.042;
        stabRotX = -(1 - t) * 0.26;
        stabRotZ =  (1 - t) * 0.07;
      }

      // ── Fire hit check at the peak of the lunge ────────────────
      if (p >= STAB_HIT_AT && !this._hitChecked) {
        this._hitChecked = true;
        if (this.onHitCheck) this.onHitCheck();
      }

      if (p >= 1.0) {
        this._stabbing = false;
        this._stabT    = 0;
        if (this._group) this._group.visible = false;  // hide after stab
      }
    }

    this._group.position.set(
      REST_POS.x + idleX + walkX,
      REST_POS.y + idleY + walkY + stabY,
      REST_POS.z + stabZ,
    );
    this._group.rotation.set(
      REST_ROT.x + stabRotX,
      REST_ROT.y,
      REST_ROT.z + stabRotZ,
      'YXZ',
    );
  }
}
