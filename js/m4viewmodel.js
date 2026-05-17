import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// ── Hip-fire and ADS poses (applied to the holder group) ──────
const HIP_POS = new THREE.Vector3(0.22, -0.24, -0.36);
const HIP_ROT = new THREE.Euler(-0.04, 0.08, 0.02, 'YXZ');
const ADS_POS = new THREE.Vector3(0, -0.13, -0.36);
const ADS_ROT = new THREE.Euler(-0.02, 0, 0, 'YXZ');

// Target length of the gun's longest dimension, in world units
const TARGET_LENGTH = 0.6;

// Orientation correction applied to the raw FBX (barrel should point -Z)
const MODEL_ROT = new THREE.Euler(0, 0, 0, 'YXZ');

export class M4Viewmodel {
  constructor(camera) {
    this.camera    = camera;
    this.group     = null;   // holder group, animated
    this._mixer    = null;
    this._loaded   = false;
    this._visible  = false;
    this._isADS    = false;
    this._adsBlend = 0;

    this._idleT = 0;
    this._walkT = 0;

    this._rZ = 0; this._vZ = 0;
    this._rY = 0; this._vY = 0;
    this._rX = 0; this._vX = 0;
  }

  show() {
    if (this._visible) return;
    this._visible = true;

    const loader = new FBXLoader();
    loader.load('assets/M4a4.fbx', (fbx) => {
      // Orientation correction first, so the bounding box reflects it
      fbx.rotation.copy(MODEL_ROT);
      fbx.updateMatrixWorld(true);

      // Measure the model's true size (works regardless of FBX native units)
      const bbox0   = new THREE.Box3().setFromObject(fbx);
      const size    = bbox0.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z) || 1;
      const scale   = TARGET_LENGTH / longest;
      fbx.scale.setScalar(scale);
      fbx.updateMatrixWorld(true);

      // Re-center so the model's geometric centre sits at the holder origin
      const bbox1  = new THREE.Box3().setFromObject(fbx);
      const center = bbox1.getCenter(new THREE.Vector3());
      fbx.position.sub(center);

      // Always render on top of world geometry
      fbx.traverse(child => {
        if (child.isMesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => { m.depthTest = false; m.needsUpdate = true; });
          child.renderOrder = 999;
        }
      });

      // Holder group — this is what gets positioned/animated
      const holder = new THREE.Group();
      holder.add(fbx);
      holder.position.copy(HIP_POS);
      holder.rotation.copy(HIP_ROT);
      this.group = holder;
      this.camera.add(holder);

      if (fbx.animations && fbx.animations.length > 0) {
        this._mixer = new THREE.AnimationMixer(fbx);
        const idle = this._mixer.clipAction(fbx.animations[0]);
        idle.setLoop(THREE.LoopRepeat);
        idle.play();
      }

      this._loaded = true;
    });
  }

  hide() {
    if (this.group) { this.camera.remove(this.group); this.group = null; }
    this._loaded  = false;
    this._visible = false;
  }

  shoot() {
    if (!this._loaded) return;
    this._vZ += 0.04;
    this._vY += 0.022;
    this._vX -= 0.055;
  }

  setADS(on) { this._isADS = on; }

  update(delta, moveSpeed) {
    if (!this._visible || !this.group) return;

    if (this._mixer) this._mixer.update(delta);

    this._idleT += delta;
    const walkFrac = Math.min(1, moveSpeed / 6);
    this._walkT += delta * walkFrac * 9;

    const idleY = Math.sin(this._idleT * 1.3)  * 0.003;
    const idleX = Math.sin(this._idleT * 0.75) * 0.0012;
    const wY = Math.sin(this._walkT)       * 0.022 * walkFrac;
    const wX = Math.sin(this._walkT * 0.5) * 0.009 * walkFrac;

    const K = 22, D = 9;
    this._vZ += (-K * this._rZ - D * this._vZ) * delta; this._rZ += this._vZ * delta;
    this._vY += (-K * this._rY - D * this._vY) * delta; this._rY += this._vY * delta;
    this._vX += (-K * this._rX - D * this._vX) * delta; this._rX += this._vX * delta;

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
    this.group.rotation.set(HIP_ROT.x + this._rX, ry, rz, 'YXZ');
  }
}
