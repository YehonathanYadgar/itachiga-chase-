import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const BOUND = 48;
const EYE_HEIGHT = 1.7;
const GRAVITY = 20;
const JUMP_FORCE = 8;
const SPRINT_MULTIPLIER = 1.8;

export class Controls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.plc = new PointerLockControls(camera, domElement);
    this.keys = {};
    this.speed = 8;
    this.locked = false;
    this.vy = 0;          // vertical velocity
    this.onGround = true;

    this.plc.addEventListener('lock',   () => { this.locked = true; });
    this.plc.addEventListener('unlock', () => { this.locked = false; });

    document.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      // Jump on Space
      if (e.code === 'Space' && this.onGround && this.locked) {
        this.vy = JUMP_FORCE;
        this.onGround = false;
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  lock() { this.plc.lock(); }
  unlock() { this.plc.unlock(); }

  get isSprinting() {
    return this.keys['ShiftLeft'] || this.keys['ShiftRight'];
  }

  update(delta) {
    if (!this.locked) return;

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    move.add(fwd);
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  move.sub(fwd);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(right);
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  move.sub(right);

    const currentSpeed = this.isSprinting
      ? this.speed * SPRINT_MULTIPLIER
      : this.speed;

    if (move.length() > 0) {
      move.normalize().multiplyScalar(currentSpeed * delta);
      this.camera.position.add(move);
    }

    // Apply gravity & jump
    this.vy -= GRAVITY * delta;
    this.camera.position.y += this.vy * delta;

    // Land on ground
    if (this.camera.position.y <= EYE_HEIGHT) {
      this.camera.position.y = EYE_HEIGHT;
      this.vy = 0;
      this.onGround = true;
    }

    // Clamp inside arena
    this.camera.position.x = Math.max(-BOUND, Math.min(BOUND, this.camera.position.x));
    this.camera.position.z = Math.max(-BOUND, Math.min(BOUND, this.camera.position.z));
  }
}
