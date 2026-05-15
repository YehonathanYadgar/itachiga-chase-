import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const BOUND       = 48;
const EYE_HEIGHT  = 1.7;
const GRAVITY     = 26;
const JUMP_FORCE  = 9.5;
const ACCEL       = 22;    // snappy acceleration (higher = more responsive)
const FRICTION    = 18;    // fast stop
const SPRINT_MULT = 1.65;
const ADS_MULT    = 0.45;

export class Controls {
  constructor(camera, domElement) {
    this.camera    = camera;
    this.plc       = new PointerLockControls(camera, domElement);
    this.keys      = {};
    this.speed     = 8;   // base speed, overridden per class
    this.locked    = false;
    this.isADS     = false;

    // Physics
    this._velX    = 0;
    this._velZ    = 0;
    this._vy      = 0;
    this.onGround = true;

    this.plc.addEventListener('lock',   () => { this.locked = true;  });
    this.plc.addEventListener('unlock', () => { this.locked = false; });

    document.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && this.onGround && this.locked) {
        this._vy      = JUMP_FORCE;
        this.onGround = false;
        this._bobAmp  = 0;
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  lock()   { this.plc.lock();   }
  unlock() { this.plc.unlock(); }

  get isSprinting() {
    return (this.keys['ShiftLeft'] || this.keys['ShiftRight'])
        && !this.isADS
        && this.onGround;
  }

  /** Horizontal speed magnitude — used by crosshair spread */
  get moveSpeed() {
    return Math.sqrt(this._velX * this._velX + this._velZ * this._velZ);
  }

  /** Instant camera pitch kick (recoil) */
  addRecoil(amount) {
    this.camera.rotation.x += amount;
  }

  update(delta) {
    if (!this.locked) return;

    // ── Wish direction ─────────────────────────────
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));

    let wX = 0, wZ = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    { wX += fwd.x;   wZ += fwd.z;   }
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  { wX -= fwd.x;   wZ -= fwd.z;   }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { wX += right.x; wZ += right.z; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  { wX -= right.x; wZ -= right.z; }

    const wLen = Math.sqrt(wX * wX + wZ * wZ);
    const targetSpeed = this.isSprinting ? this.speed * SPRINT_MULT
                      : this.isADS       ? this.speed * ADS_MULT
                      : this.speed;

    if (wLen > 0) {
      const n = targetSpeed / wLen;
      wX *= n; wZ *= n;
      const t = Math.min(1, ACCEL * delta);
      this._velX += (wX - this._velX) * t;
      this._velZ += (wZ - this._velZ) * t;
    } else {
      const t = Math.min(1, FRICTION * delta);
      this._velX *= (1 - t);
      this._velZ *= (1 - t);
    }

    this.camera.position.x = Math.max(-BOUND, Math.min(BOUND,
      this.camera.position.x + this._velX * delta));
    this.camera.position.z = Math.max(-BOUND, Math.min(BOUND,
      this.camera.position.z + this._velZ * delta));

    // ── Gravity & jump ─────────────────────────────
    this._vy -= GRAVITY * delta;
    this.camera.position.y += this._vy * delta;

    if (this.camera.position.y <= EYE_HEIGHT) {
      this.camera.position.y = EYE_HEIGHT;
      this._vy      = 0;
      this.onGround = true;
    }
  }
}
