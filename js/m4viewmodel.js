import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Target length of the gun's longest dimension, in world units
const TARGET_LENGTH = 0.5;
// Orientation correction so the barrel points -Z (forward)
const MODEL_ROT = new THREE.Euler(0, Math.PI / 2, 0, 'YXZ');

// side: +1 = right gun, -1 = left gun
function hipPos(side) { return new THREE.Vector3(side * 0.27, -0.26, -0.42); }
function hipRot(side) { return new THREE.Euler(-0.03, side * 0.13, side * 0.05, 'YXZ'); }

function smoothstep(t) { return t * t * (3 - 2 * t); }
function clamp01(t)    { return Math.max(0, Math.min(1, t)); }

// Load + scale + centre one M4 model. Returns a Promise<Object3D>.
function loadM4() {
  return new Promise((resolve, reject) => {
    new FBXLoader().load('assets/M4a4.fbx', (fbx) => {
      fbx.rotation.copy(MODEL_ROT);
      fbx.updateMatrixWorld(true);

      let bb = new THREE.Box3().setFromObject(fbx);
      const size    = bb.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z) || 1;
      fbx.scale.setScalar(TARGET_LENGTH / longest);
      fbx.updateMatrixWorld(true);

      bb = new THREE.Box3().setFromObject(fbx);
      const center = bb.getCenter(new THREE.Vector3());
      fbx.position.sub(center);

      fbx.traverse(child => {
        if (child.isMesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => { m.depthTest = false; m.needsUpdate = true; });
          child.renderOrder = 999;
        }
      });
      resolve(fbx);
    }, undefined, reject);
  });
}

// ── Dual-wield M4 viewmodel ───────────────────────────────────
export class M4Viewmodel {
  constructor(camera) {
    this.camera   = camera;
    this._guns    = [];   // { holder, side, rZ,vZ, rY,vY, rX,vX }
    this._visible = false;
    this._loaded  = false;
    this._isADS   = false;

    this._idleT     = 0;
    this._walkT     = 0;
    this._shootSide = 0;  // alternates left/right recoil

    this._isReloading = false;
    this._reloadT     = 0;
    this._reloadDur   = 2.4;
  }

  show() {
    if (this._visible) return;
    this._visible = true;

    [+1, -1].forEach(async (side) => {
      const model  = await loadM4();
      const holder = new THREE.Group();
      holder.add(model);
      holder.position.copy(hipPos(side));
      holder.rotation.copy(hipRot(side));
      this.camera.add(holder);
      this._guns.push({ holder, side, rZ: 0, vZ: 0, rY: 0, vY: 0, rX: 0, vX: 0 });
      if (this._guns.length === 2) this._loaded = true;
    });
  }

  hide() {
    this._guns.forEach(g => this.camera.remove(g.holder));
    this._guns    = [];
    this._loaded  = false;
    this._visible = false;
  }

  // Alternating recoil — each shot kicks the opposite gun
  shoot() {
    if (!this._loaded || this._isReloading) return;
    const g = this._guns[this._shootSide % this._guns.length];
    g.vZ += 0.06;   // kick back
    g.vY += 0.03;   // kick up
    g.vX += 0.07;   // muzzle climb
    this._shootSide++;
  }

  reload(durationMs) {
    if (!this._loaded || this._isReloading) return;
    this._isReloading = true;
    this._reloadT     = 0;
    this._reloadDur   = (durationMs || 2400) / 1000;
  }

  setADS(on) { this._isADS = on; } // dual-wield: no ADS movement

  update(delta, moveSpeed) {
    if (!this._loaded) return;

    // ── Timers ────────────────────────────────────────────────
    this._idleT += delta;
    const walkFrac = Math.min(1, moveSpeed / 6);
    this._walkT += delta * walkFrac * 9;

    const idleY = Math.sin(this._idleT * 1.3)  * 0.003;
    const idleX = Math.sin(this._idleT * 0.75) * 0.0012;
    const wY = Math.sin(this._walkT)       * 0.02  * walkFrac;
    const wX = Math.sin(this._walkT * 0.5) * 0.008 * walkFrac;

    // ── Reload animation (shared progress) ────────────────────
    let tilt = 0, chargeZ = 0;
    if (this._isReloading) {
      this._reloadT += delta;
      const p = clamp01(this._reloadT / this._reloadDur);
      if      (p < 0.16) tilt = smoothstep(p / 0.16);          // bring guns down
      else if (p < 0.80) tilt = 1;                             // hold (mag swap)
      else               tilt = smoothstep(1 - (p - 0.80) / 0.20); // raise back up
      // Charge-handle jerk near the end
      if (p >= 0.66 && p <= 0.78) {
        chargeZ = Math.sin(((p - 0.66) / 0.12) * Math.PI) * 0.05;
      }
      if (p >= 1) this._isReloading = false;
    }
    const reloadRotX = -tilt * 0.5;   // barrels dip down
    const reloadPosY = -tilt * 0.07;  // guns lower

    // ── Per-gun spring + transform ────────────────────────────
    const K = 22, D = 9;
    for (const g of this._guns) {
      g.vZ += (-K * g.rZ - D * g.vZ) * delta; g.rZ += g.vZ * delta;
      g.vY += (-K * g.rY - D * g.vY) * delta; g.rY += g.vY * delta;
      g.vX += (-K * g.rX - D * g.vX) * delta; g.rX += g.vX * delta;

      const bp = hipPos(g.side);
      const br = hipRot(g.side);
      const reloadRotZ = -g.side * tilt * 0.3;   // tilt toward centre
      const reloadPosX = -g.side * tilt * 0.06;  // pull inward

      g.holder.position.set(
        bp.x + idleX + wX + reloadPosX,
        bp.y + idleY + wY + reloadPosY + g.rY,
        bp.z + g.rZ + chargeZ
      );
      g.holder.rotation.set(
        br.x + g.rX + reloadRotX,
        br.y,
        br.z + reloadRotZ,
        'YXZ'
      );
    }
  }
}
