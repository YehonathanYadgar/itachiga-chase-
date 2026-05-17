import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Target length of the gun's longest dimension, in world units
const TARGET_LENGTH = 0.5;
// Orientation correction so the barrel points -Z (forward)
const MODEL_ROT = new THREE.Euler(0, Math.PI / 2, 0, 'YXZ');
// Local offset (in holder space) of the barrel muzzle tip
const MUZZLE_LOCAL = new THREE.Vector3(0, 0.0, -0.27);

// side: +1 = right gun, -1 = left gun
function hipPos(side) { return new THREE.Vector3(side * 0.27, -0.26, -0.42); }
function hipRot(side) { return new THREE.Euler(-0.03, side * 0.13, side * 0.05, 'YXZ'); }

function smoothstep(t)  { return t * t * (3 - 2 * t); }
function clamp01(t)     { return Math.max(0, Math.min(1, t)); }
function easeInOut(t)   { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }

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

// Bright additive muzzle-flash group (hidden until shoot()).
function makeMuzzleFlash() {
  const grp = new THREE.Group();
  const mkMat = () => new THREE.MeshBasicMaterial({
    color: 0xffd95e, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
  });

  // Forward flame cone
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 7), mkMat());
  cone.rotation.x = -Math.PI / 2; // apex points -Z
  cone.position.z = -0.12;
  cone.renderOrder = 1000;
  grp.add(cone);

  // Hot core glow
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), mkMat());
  core.renderOrder = 1000;
  grp.add(core);

  grp.visible = false;
  return grp;
}

// ── Dual-wield M4 viewmodel ───────────────────────────────────
export class M4Viewmodel {
  constructor(camera) {
    this.camera   = camera;
    this._guns    = [];   // { holder, muzzle, flash, side, flashTtl, rZ,vZ, rY,vY, rX,vX }
    this._visible = false;
    this._loaded  = false;
    this._isADS   = false;

    this._idleT     = 0;
    this._walkT     = 0;
    this._shootSide = 0;  // alternates left/right recoil + flash

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

      // Muzzle marker — read for bullet spawn position
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(MUZZLE_LOCAL);
      holder.add(muzzle);

      // Muzzle flash at the barrel tip
      const flash = makeMuzzleFlash();
      flash.position.copy(MUZZLE_LOCAL);
      holder.add(flash);

      this.camera.add(holder);
      this._guns.push({
        holder, muzzle, flash, side, flashTtl: 0,
        rZ: 0, vZ: 0, rY: 0, vY: 0, rX: 0, vX: 0,
      });
      if (this._guns.length === 2) this._loaded = true;
    });
  }

  hide() {
    this._guns.forEach(g => this.camera.remove(g.holder));
    this._guns    = [];
    this._loaded  = false;
    this._visible = false;
  }

  // World position of the muzzle that will fire next (queried by the shooter).
  getNextMuzzlePos() {
    if (!this._loaded) return null;
    const g = this._guns[this._shootSide % this._guns.length];
    return g.muzzle.getWorldPosition(new THREE.Vector3());
  }

  // Alternating recoil + muzzle flash — each shot uses the opposite gun
  shoot() {
    if (!this._loaded || this._isReloading) return;
    const g = this._guns[this._shootSide % this._guns.length];
    g.vZ += 0.06;   // kick back
    g.vY += 0.03;   // kick up
    g.vX += 0.07;   // muzzle climb
    // Trigger muzzle flash
    g.flash.visible    = true;
    g.flash.rotation.z = Math.random() * Math.PI;
    g.flashTtl         = 3;
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

    // ── Reload: full 360° spin of both guns ───────────────────
    let spin = 0;
    if (this._isReloading) {
      this._reloadT += delta;
      const p = clamp01(this._reloadT / this._reloadDur);
      spin = easeInOut(p) * Math.PI * 2; // one full rotation, eased
      if (p >= 1) this._isReloading = false;
    }

    // ── Per-gun spring + transform ────────────────────────────
    const K = 22, D = 9;
    for (const g of this._guns) {
      g.vZ += (-K * g.rZ - D * g.vZ) * delta; g.rZ += g.vZ * delta;
      g.vY += (-K * g.rY - D * g.vY) * delta; g.rY += g.vY * delta;
      g.vX += (-K * g.rX - D * g.vX) * delta; g.rX += g.vX * delta;

      const bp = hipPos(g.side);
      const br = hipRot(g.side);

      g.holder.position.set(
        bp.x + idleX + wX,
        bp.y + idleY + wY + g.rY,
        bp.z + g.rZ
      );
      g.holder.rotation.set(
        br.x + g.rX + spin,  // spin rotates the gun a full 360° on reload
        br.y,
        br.z,
        'YXZ'
      );

      // ── Muzzle flash fade ───────────────────────────────────
      if (g.flashTtl > 0) {
        g.flashTtl -= 1;
        const f = g.flashTtl / 3;
        g.flash.scale.setScalar(0.7 + f * 0.6);
        g.flash.traverse(o => { if (o.material) o.material.opacity = f; });
        if (g.flashTtl <= 0) g.flash.visible = false;
      }
    }
  }
}
