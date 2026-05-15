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
  mesh.rotation.x = Math.PI / 2; // align along Z (barrel direction)
  mesh.renderOrder = 999;
  return mesh;
}

// ── AK-47 procedural build ────────────────────────────────────
function buildAK() {
  const g = new THREE.Group();
  g.renderOrder = 999;

  // Receiver (main body)
  const recv = box(0.365, 0.07, 0.058, M_METAL);
  recv.position.set(0, 0, 0);
  g.add(recv);

  // Top cover (slightly wider/taller than receiver)
  const cover = box(0.28, 0.02, 0.06, M_METAL);
  cover.position.set(0, 0.045, -0.06);
  g.add(cover);

  // Barrel
  const barrel = cyl(0.012, 0.42, M_STEEL);
  barrel.position.set(0, 0.013, -0.375);
  g.add(barrel);

  // Muzzle brake
  const muzzle = cyl(0.02, 0.05, M_METAL);
  muzzle.position.set(0, 0.013, -0.61);
  g.add(muzzle);

  // Gas tube (above barrel)
  const gas = cyl(0.008, 0.22, M_METAL);
  gas.position.set(0, 0.038, -0.27);
  g.add(gas);

  // Handguard (wood, below barrel)
  const hg = box(0.17, 0.05, 0.052, M_WOOD);
  hg.position.set(0, -0.01, -0.215);
  g.add(hg);

  // Magazine
  const mag = box(0.058, 0.2, 0.027, M_GRIP);
  mag.position.set(0, -0.148, -0.042);
  mag.rotation.x = 0.16;
  g.add(mag);

  // Pistol grip
  const grip = box(0.037, 0.1, 0.048, M_GRIP);
  grip.position.set(0, -0.094, 0.096);
  grip.rotation.x = 0.24;
  g.add(grip);

  // Trigger guard
  const guard = box(0.03, 0.008, 0.065, M_METAL);
  guard.position.set(0, -0.05, 0.055);
  g.add(guard);

  // Stock (wood)
  const stock = box(0.188, 0.046, 0.037, M_WOOD);
  stock.position.set(0, 0.002, 0.24);
  g.add(stock);

  // Stock heel (skeleton lower bar)
  const heel = box(0.13, 0.034, 0.035, M_WOOD);
  heel.position.set(0, -0.04, 0.305);
  g.add(heel);

  // Rear sight
  const rsight = box(0.05, 0.025, 0.012, M_METAL);
  rsight.position.set(0, 0.05, 0.04);
  g.add(rsight);

  // Front sight base
  const fsBase = box(0.038, 0.013, 0.025, M_METAL);
  fsBase.position.set(0, 0.032, -0.535);
  g.add(fsBase);

  // Front sight post
  const fsPost = box(0.008, 0.038, 0.008, M_METAL);
  fsPost.position.set(0, 0.052, -0.535);
  g.add(fsPost);

  return g;
}

// ── Resting positions ─────────────────────────────────────────
const HIP_POS = new THREE.Vector3(0.23, -0.26, -0.4);
const HIP_ROT = new THREE.Euler(-0.05, 0.09, 0.02, 'YXZ');
const ADS_POS = new THREE.Vector3(0, -0.135, -0.4);
const ADS_ROT = new THREE.Euler(-0.02, 0, 0, 'YXZ');

// ── Viewmodel class ───────────────────────────────────────────
export class Viewmodel {
  constructor(camera) {
    this.camera    = camera;
    this.group     = null;
    this._visible  = false;
    this._isADS    = false;
    this._adsBlend = 0;

    this._idleT = 0;
    this._walkT = 0;

    // Spring-physics recoil offsets
    this._rZ = 0; this._vZ = 0; // kick back (+Z toward player)
    this._rY = 0; this._vY = 0; // kick up
    this._rX = 0; this._vX = 0; // rotational pitch up
  }

  show() {
    if (this._visible) return;
    this.group = buildAK();
    this.group.position.copy(HIP_POS);
    this.group.rotation.copy(HIP_ROT);
    this.camera.add(this.group);
    this._visible = true;
  }

  hide() {
    if (this.group) { this.camera.remove(this.group); this.group = null; }
    this._visible = false;
  }

  // Call once per shot
  shoot() {
    if (!this._visible) return;
    this._vZ += 0.055; // push back
    this._vY += 0.028; // push up
    this._vX -= 0.07;  // rotate pitch up (negative = tip barrel upward)
  }

  setADS(on) { this._isADS = on; }

  update(delta, moveSpeed) {
    if (!this._visible || !this.group) return;

    this._idleT += delta;
    const walkFrac = Math.min(1, moveSpeed / 6);
    this._walkT += delta * walkFrac * 9;

    // Idle breath bob
    const idleY = Math.sin(this._idleT * 1.3) * 0.003;
    const idleX = Math.sin(this._idleT * 0.75) * 0.0012;

    // Walk bob (figure-8: Y at full frequency, X at half)
    const wY = Math.sin(this._walkT)       * 0.022 * walkFrac;
    const wX = Math.sin(this._walkT * 0.5) * 0.009 * walkFrac;

    // Spring physics — critically damped (no oscillation)
    const K = 22, D = 9;
    this._vZ += (-K * this._rZ - D * this._vZ) * delta; this._rZ += this._vZ * delta;
    this._vY += (-K * this._rY - D * this._vY) * delta; this._rY += this._vY * delta;
    this._vX += (-K * this._rX - D * this._vX) * delta; this._rX += this._vX * delta;

    // ADS lerp
    const adsT = this._isADS ? 1 : 0;
    this._adsBlend += (adsT - this._adsBlend) * Math.min(1, delta * 14);

    const px = HIP_POS.x + (ADS_POS.x - HIP_POS.x) * this._adsBlend;
    const py = HIP_POS.y + (ADS_POS.y - HIP_POS.y) * this._adsBlend;
    const pz = HIP_POS.z + (ADS_POS.z - HIP_POS.z) * this._adsBlend;
    const ry = HIP_ROT.y + (ADS_ROT.y - HIP_ROT.y) * this._adsBlend;
    const rz = HIP_ROT.z * (1 - this._adsBlend);

    this.group.position.set(
      px + idleX + wX,
      py + idleY + wY + this._rY,
      pz + this._rZ
    );
    this.group.rotation.set(
      HIP_ROT.x + this._rX,
      ry,
      rz,
      'YXZ'
    );
  }
}
