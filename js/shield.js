import * as THREE from 'three';

// ─── Tunable constants ───────────────────────────────────────────────────────
const CHARGE_TIME     = 25;    // seconds to fully charge
const SHIELD_DURATION = 10;    // wall stays for EXACTLY 10 seconds
const WALL_DIST       = 1.5;   // metres in front of the camera
const PARTICLE_COUNT  = 38;

// ─── ShieldPower class ───────────────────────────────────────────────────────
export class ShieldPower {
  constructor(scene, camera) {
    this.scene  = scene;
    this.camera = camera;

    // State
    this.charge      = 0;      // counts 0 → CHARGE_TIME
    this.isReady     = false;
    this.isActive    = false;
    this.shieldTimer = 0;      // counts 0 → SHIELD_DURATION while active

    // 3-D objects
    this._wallGroup       = new THREE.Group();
    this._particlePool    = [];
    this._activeParticles = [];

    scene.add(this._wallGroup);
    this._buildWall();
    this._buildParticlePool();
  }

  // ── Build the glowing wall (3 stacked planes for a bloom effect) ─────────
  _buildWall() {
    // Core: solid-ish white  ← bigger so it actually covers Joab's body
    const geo  = new THREE.PlaneGeometry(2.4, 3.4);
    this._wallCore = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xd8f0ff, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    }));

    // Inner glow: slightly larger, additive
    const geoG = new THREE.PlaneGeometry(3.2, 4.4);
    this._wallGlow = new THREE.Mesh(geoG, new THREE.MeshBasicMaterial({
      color: 0x80d0ff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));

    // Outer bloom: even larger, very faint
    const geoO = new THREE.PlaneGeometry(4.4, 6.0);
    this._wallOuter = new THREE.Mesh(geoO, new THREE.MeshBasicMaterial({
      color: 0x3080cc, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));

    this._wallGroup.add(this._wallOuter, this._wallGlow, this._wallCore);
    this._wallGroup.visible = false;
  }

  // ── Pool of white liquid droplets (re-used each activation) ─────────────
  _buildParticlePool() {
    const geo = new THREE.SphereGeometry(0.055, 5, 5);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xe8f8ff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      mesh.visible = false;
      this.scene.add(mesh);
      this._particlePool.push(mesh);
    }
  }

  // ── Called when the player presses F ────────────────────────────────────
  activate() {
    if (!this.isReady || this.isActive) return false;

    this.isReady     = false;
    this.charge      = 0;
    this.isActive    = true;
    this.shieldTimer = 0;

    this._wallGroup.visible         = true;
    this._wallCore.material.opacity  = 0;
    this._wallGlow.material.opacity  = 0;
    this._wallOuter.material.opacity = 0;

    // Place the wall in the world once — it will NOT move after this
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const wallPos = this.camera.position.clone().addScaledVector(dir, WALL_DIST);
    wallPos.y = this.camera.position.y;
    this._wallGroup.position.copy(wallPos);
    this._wallGroup.lookAt(this.camera.position);  // face toward the player

    this._launchParticles();
    return true;
  }

  // ── Shoot liquid particles from the player's feet up to the wall ────────
  _launchParticles() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    // Where the wall will be
    const wallCenter = this.camera.position.clone()
      .addScaledVector(dir, WALL_DIST);
    wallCenter.y = this.camera.position.y;

    // Start: player feet (1.5 m below camera / eye level)
    const feet = this.camera.position.clone();
    feet.y -= 1.5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const mesh = this._particlePool[i];
      mesh.visible = true;

      // Random horizontal spread at feet
      const ox = (Math.random() - 0.5) * 0.45;
      const oz = (Math.random() - 0.5) * 0.45;

      const start = new THREE.Vector3(feet.x + ox, feet.y, feet.z + oz);
      const end   = wallCenter.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.28,
        (Math.random() - 0.5) * 0.28,
        0,
      ));

      // Control point: arc upward between start and end
      const ctrl = new THREE.Vector3(
        (start.x + end.x) / 2 + (Math.random() - 0.5) * 0.25,
        Math.max(start.y, end.y) + 0.5 + Math.random() * 0.55,
        (start.z + end.z) / 2,
      );

      this._activeParticles.push({
        mesh, start, ctrl, end,
        t:     0,
        speed: 0.75 + Math.random() * 0.85,
        delay: i * 0.017,   // stagger so they look like a stream
        done:  false,
      });
    }
  }

  // ── Call every frame from the game loop ──────────────────────────────────
  update(dt) {
    // Charge up when idle
    if (!this.isActive && !this.isReady) {
      this.charge += dt;
      if (this.charge >= CHARGE_TIME) {
        this.charge  = CHARGE_TIME;
        this.isReady = true;
      }
    }

    if (!this.isActive) return;

    this.shieldTimer += dt;

    // ── Fade in, then pulse / warn ─────────────────────────────────────────
    const fadeIn   = Math.min(1, this.shieldTimer / 0.35);
    const timeLeft = SHIELD_DURATION - this.shieldTimer;
    const warn     = timeLeft < 2.5;
    const pulse    = warn ? 0.5 + 0.5 * Math.sin(Date.now() * 0.016) : 1;

    this._wallCore.material.opacity  = fadeIn * 0.22 * pulse;
    this._wallGlow.material.opacity  = fadeIn * 0.12 * pulse;
    this._wallOuter.material.opacity = fadeIn * 0.05 * pulse;

    // Wall turns red when about to expire
    const coreCol = warn ? 0xffd0d0 : 0xd8f0ff;
    const glowCol = warn ? 0xff8888 : 0x80d0ff;
    this._wallCore.material.color.set(coreCol);
    this._wallGlow.material.color.set(glowCol);

    // ── Animate liquid particles ───────────────────────────────────────────
    for (let i = this._activeParticles.length - 1; i >= 0; i--) {
      const p = this._activeParticles[i];
      if (p.done) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }

      p.t += p.speed * dt;
      if (p.t >= 1) {
        p.mesh.visible = false;
        p.done = true;
        this._activeParticles.splice(i, 1);
        continue;
      }

      // Quadratic bezier: feet → arc → wall
      const t  = p.t, mt = 1 - t;
      p.mesh.position.set(
        mt*mt*p.start.x + 2*mt*t*p.ctrl.x + t*t*p.end.x,
        mt*mt*p.start.y + 2*mt*t*p.ctrl.y + t*t*p.end.y,
        mt*mt*p.start.z + 2*mt*t*p.ctrl.z + t*t*p.end.z,
      );
      p.mesh.material.opacity = (1 - Math.pow(t, 1.6)) * 0.92;
    }

    // ── Expire after exactly SHIELD_DURATION seconds ───────────────────────
    if (this.shieldTimer >= SHIELD_DURATION) {
      this._deactivate();
    }
  }

  _deactivate() {
    this.isActive    = false;
    this.shieldTimer = 0;
    this._wallGroup.visible = false;

    for (const p of this._activeParticles) p.mesh.visible = false;
    this._activeParticles = [];
    for (const m of this._particlePool) m.visible = false;

    // Recharge from zero
    this.charge  = 0;
    this.isReady = false;
  }

  /** 0–1: how full the charge ring should appear */
  get chargeRatio() {
    return this.isReady ? 1 : this.charge / CHARGE_TIME;
  }

  /** Seconds remaining while shield is active */
  get timeLeft() {
    return Math.max(0, SHIELD_DURATION - this.shieldTimer);
  }

  /**
   * Returns the wall's solid mesh when active so the raycaster can
   * treat it as a physical blocker — bullets stop here, no damage.
   */
  getBlockingMeshes() {
    return this.isActive ? [this._wallCore] : [];
  }

  dispose() {
    this.scene.remove(this._wallGroup);
    for (const m of this._particlePool) this.scene.remove(m);
  }
}
