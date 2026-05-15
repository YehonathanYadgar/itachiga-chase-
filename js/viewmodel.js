import * as THREE from 'three';

// ── Materials ─────────────────────────────────────────────────
function mat(color) {
  return new THREE.MeshLambertMaterial({ color, depthTest: false });
}
const M_METAL = mat(0x1c1c1c);
const M_STEEL = mat(0x303030);
const M_WOOD  = mat(0x5a3010);
const M_GRIP  = mat(0x111111);

// ── Geometry helpers ──────────────────────────────────────────
function box(w, h, d, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.renderOrder = 999;
  return mesh;
}
function cyl(r, len, m, segs = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segs), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.renderOrder = 999;
  return mesh;
}

// ── AK-47 build — returns {group, mag} ───────────────────────
function buildAK() {
  const g = new THREE.Group();
  g.renderOrder = 999;

  const recv = box(0.365, 0.07, 0.058, M_METAL);
  g.add(recv);

  const cover = box(0.28, 0.02, 0.06, M_METAL);
  cover.position.set(0, 0.045, -0.06);
  g.add(cover);

  const barrel = cyl(0.012, 0.42, M_STEEL);
  barrel.position.set(0, 0.013, -0.375);
  g.add(barrel);

  const muzzle = cyl(0.02, 0.05, M_METAL);
  muzzle.position.set(0, 0.013, -0.61);
  g.add(muzzle);

  const gas = cyl(0.008, 0.22, M_METAL);
  gas.position.set(0, 0.038, -0.27);
  g.add(gas);

  const hg = box(0.17, 0.05, 0.052, M_WOOD);
  hg.position.set(0, -0.01, -0.215);
  g.add(hg);

  // Magazine — kept as separate ref for reload animation
  const mag = box(0.058, 0.2, 0.027, M_GRIP);
  mag.position.set(0, -0.148, -0.042);
  mag.rotation.x = 0.16;
  g.add(mag);

  const grip = box(0.037, 0.1, 0.048, M_GRIP);
  grip.position.set(0, -0.094, 0.096);
  grip.rotation.x = 0.24;
  g.add(grip);

  const guard = box(0.03, 0.008, 0.065, M_METAL);
  guard.position.set(0, -0.05, 0.055);
  g.add(guard);

  const stock = box(0.188, 0.046, 0.037, M_WOOD);
  stock.position.set(0, 0.002, 0.24);
  g.add(stock);

  const heel = box(0.13, 0.034, 0.035, M_WOOD);
  heel.position.set(0, -0.04, 0.305);
  g.add(heel);

  const rsight = box(0.05, 0.025, 0.012, M_METAL);
  rsight.position.set(0, 0.05, 0.04);
  g.add(rsight);

  const fsBase = box(0.038, 0.013, 0.025, M_METAL);
  fsBase.position.set(0, 0.032, -0.535);
  g.add(fsBase);

  const fsPost = box(0.008, 0.038, 0.008, M_METAL);
  fsPost.position.set(0, 0.052, -0.535);
  g.add(fsPost);

  return { group: g, mag };
}

// ── Resting poses ─────────────────────────────────────────────
const HIP_POS = new THREE.Vector3(0.23, -0.26, -0.4);
const HIP_ROT = new THREE.Euler(-0.05, 0.09, 0.02, 'YXZ');
const ADS_POS = new THREE.Vector3(0, -0.135, -0.4);
const ADS_ROT = new THREE.Euler(-0.02, 0, 0, 'YXZ');

// Pose the gun tilts to during reload (gun rotated right, barrel down)
const RELOAD_ROT_Z =  0.48;
const RELOAD_ROT_X =  0.32;
const RELOAD_POS_Y = -0.07;

function smoothstep(t) { return t * t * (3 - 2 * t); }
function clamp01(t)    { return Math.max(0, Math.min(1, t)); }

// ── Viewmodel ─────────────────────────────────────────────────
export class Viewmodel {
  constructor(camera) {
    this.camera    = camera;
    this.group     = null;
    this._mag      = null;   // magazine mesh ref
    this._magBaseY = -0.148; // magazine's rest Y position
    this._visible  = false;
    this._isADS    = false;
    this._adsBlend = 0;

    this._idleT = 0;
    this._walkT = 0;

    // Shoot recoil spring
    this._rZ = 0; this._vZ = 0;
    this._rY = 0; this._vY = 0;
    this._rX = 0; this._vX = 0;

    // Reload animation
    this._isReloading = false;
    this._reloadT     = 0;
    this._reloadDur   = 2.2;
  }

  show() {
    if (this._visible) return;
    const { group, mag } = buildAK();
    this.group = group;
    this._mag  = mag;
    this.group.position.copy(HIP_POS);
    this.group.rotation.copy(HIP_ROT);
    this.camera.add(this.group);
    this._visible = true;
  }

  hide() {
    if (this.group) { this.camera.remove(this.group); this.group = null; }
    this._visible = false;
  }

  shoot() {
    if (!this._visible || this._isReloading) return;
    this._vZ += 0.055;
    this._vY += 0.028;
    this._vX -= 0.07;
  }

  reload(durationMs) {
    if (!this._visible || this._isReloading) return;
    this._isReloading = true;
    this._reloadT     = 0;
    this._reloadDur   = durationMs / 1000;
  }

  setADS(on) { this._isADS = on; }

  update(delta, moveSpeed) {
    if (!this._visible || !this.group) return;

    // ── Timers ────────────────────────────────────────────────
    this._idleT += delta;
    const walkFrac = Math.min(1, moveSpeed / 6);
    this._walkT += delta * walkFrac * 9;

    // ── Reload animation ──────────────────────────────────────
    let reloadRotZ = 0, reloadRotX = 0, reloadPosY = 0, reloadPosZ = 0;

    if (this._isReloading) {
      this._reloadT += delta;
      const p = clamp01(this._reloadT / this._reloadDur);

      // Gun tilt: ramp in 0→0.15, hold, ramp out 0.78→1.0
      let tilt;
      if      (p < 0.15) tilt = smoothstep(p / 0.15);
      else if (p < 0.78) tilt = 1;
      else               tilt = smoothstep(1 - (p - 0.78) / 0.22);

      reloadRotZ = tilt * RELOAD_ROT_Z;
      reloadRotX = tilt * RELOAD_ROT_X;
      reloadPosY = tilt * RELOAD_POS_Y;

      // Charge-handle jerk at p≈0.68 (single sine spike)
      if (p >= 0.65 && p <= 0.76) {
        reloadPosZ = Math.sin(((p - 0.65) / 0.11) * Math.PI) * 0.05;
      }

      // Magazine drop: falls at p=0.18, gone until p=0.50, returns p=0.60
      if (this._mag) {
        let magOffY = 0;
        if (p >= 0.18 && p < 0.28) {
          magOffY = -smoothstep((p - 0.18) / 0.10) * 0.22;
        } else if (p >= 0.28 && p < 0.50) {
          magOffY = -0.22; // out
        } else if (p >= 0.50 && p < 0.62) {
          magOffY = -0.22 + smoothstep((p - 0.50) / 0.12) * 0.22; // new mag rising
        }
        this._mag.position.y = this._magBaseY + magOffY;
      }

      if (p >= 1) this._isReloading = false;
    } else {
      // Reset mag position between reloads
      if (this._mag) this._mag.position.y = this._magBaseY;
    }

    // ── Idle breath ───────────────────────────────────────────
    const idleY = Math.sin(this._idleT * 1.3)  * 0.003;
    const idleX = Math.sin(this._idleT * 0.75) * 0.0012;

    // ── Walk bob ──────────────────────────────────────────────
    const wY = Math.sin(this._walkT)       * 0.022 * walkFrac;
    const wX = Math.sin(this._walkT * 0.5) * 0.009 * walkFrac;

    // ── Shoot recoil spring ───────────────────────────────────
    const K = 22, D = 9;
    this._vZ += (-K * this._rZ - D * this._vZ) * delta; this._rZ += this._vZ * delta;
    this._vY += (-K * this._rY - D * this._vY) * delta; this._rY += this._vY * delta;
    this._vX += (-K * this._rX - D * this._vX) * delta; this._rX += this._vX * delta;

    // ── ADS blend ─────────────────────────────────────────────
    const adsT = (this._isADS && !this._isReloading) ? 1 : 0;
    this._adsBlend += (adsT - this._adsBlend) * Math.min(1, delta * 14);

    const px = HIP_POS.x + (ADS_POS.x - HIP_POS.x) * this._adsBlend;
    const py = HIP_POS.y + (ADS_POS.y - HIP_POS.y) * this._adsBlend;
    const pz = HIP_POS.z + (ADS_POS.z - HIP_POS.z) * this._adsBlend;
    const ry = HIP_ROT.y + (ADS_ROT.y - HIP_ROT.y) * this._adsBlend;
    const rz = HIP_ROT.z * (1 - this._adsBlend);

    // ── Apply everything ──────────────────────────────────────
    this.group.position.set(
      px + idleX + wX,
      py + idleY + wY + this._rY + reloadPosY,
      pz + this._rZ + reloadPosZ
    );
    this.group.rotation.set(
      HIP_ROT.x + this._rX + reloadRotX,
      ry,
      rz + reloadRotZ,
      'YXZ'
    );
  }
}
