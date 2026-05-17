import * as THREE from 'three';

export class Shooter {
  constructor(scene, camera) {
    this.scene     = scene;
    this.camera    = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 300;

    this.damage     = 20;
    this.fireRate   = 300;
    this.spread     = 0.04;
    this.pellets    = 1;
    this.ammo       = Infinity;
    this.maxAmmo    = Infinity;
    this.recoil     = 0.02;
    this.reloadTime = 0;
    this._lastShot  = 0;
    this._reloading = false;
    this._reloadTimer = 0;

    this._impacts = []; // impact spark spheres
    this._bullets = []; // animated flying projectiles

    this.onShot           = null;
    this.onReloadStart    = null;
    this.onReloadComplete = null;
    this.controls         = null;
    this.muzzleProvider   = null; // () => THREE.Vector3 world muzzle pos, or null
  }

  configure(cls) {
    this.damage     = cls.damage;
    this.fireRate   = cls.fireRate;
    this.spread     = cls.spread;
    this.pellets    = cls.pellets ?? 1;
    this.ammo       = cls.ammo;
    this.maxAmmo    = cls.ammo;
    this.recoil     = cls.recoil ?? 0.018;
    this.reloadTime = cls.reloadTime ?? 0;
  }

  get isReloading() { return this._reloading; }

  canShoot(now) {
    return !this._reloading && now - this._lastShot >= this.fireRate;
  }

  startReload() {
    if (this._reloading || this.ammo === Infinity || this.ammo === this.maxAmmo) return;
    this._reloading   = true;
    this._reloadTimer = this.reloadTime / 1000;
    if (this.onReloadStart) this.onReloadStart();
  }

  tryShoot(enemies, now, remoteMeshMap = new Map()) {
    if (!this.canShoot(now)) return false;
    if (this.ammo !== Infinity && this.ammo <= 0) { this.startReload(); return false; }

    this._lastShot = now;
    if (this.ammo !== Infinity) this.ammo--;
    if (this.controls) this.controls.addRecoil(this.recoil);

    const moving = this.controls && this.controls.moveSpeed > 0.4;
    const spread = moving ? this.spread * 1.75 : this.spread;

    let anyHit      = false;
    let remoteHitId = null;

    const localMeshes  = enemies.flatMap(e => e.alive ? e.meshes : []);
    const remoteMeshes = [...remoteMeshMap.keys()];
    const allMeshes    = [...localMeshes, ...remoteMeshes];

    for (let p = 0; p < this.pellets; p++) {
      // First pellet always travels exactly where the crosshair points.
      // Extra pellets (shotgun p>0) scatter around it.
      const offsetX = p === 0 ? 0 : (Math.random() - 0.5) * spread * 2;
      const offsetY = p === 0 ? 0 : (Math.random() - 0.5) * spread * 2;
      const dir = new THREE.Vector3(offsetX, offsetY, -1)
        .applyQuaternion(this.camera.quaternion).normalize();

      this.raycaster.set(this.camera.position, dir);
      const hits     = this.raycaster.intersectObjects(allMeshes, false);
      const hitPoint = hits.length > 0 ? hits[0].point : null;

      // Visual bullet: spawn from the gun's muzzle if one is available,
      // otherwise from the camera. Hit detection above always uses the camera.
      const aimEnd = hitPoint
        ? hitPoint.clone()
        : this.camera.position.clone().addScaledVector(dir, 120);
      const muzzle = this.muzzleProvider ? this.muzzleProvider() : null;
      const start  = muzzle
        ? muzzle
        : this.camera.position.clone().addScaledVector(dir, 0.7);
      const visualDir = aimEnd.clone().sub(start).normalize();
      this._spawnBullet(start, visualDir, aimEnd);

      if (hitPoint) {
        const mesh       = hits[0].object;
        const localEnemy = enemies.find(e => e.meshes.includes(mesh));
        if (localEnemy) { localEnemy.hit(this.damage); anyHit = true; }
        if (!localEnemy && remoteMeshMap.has(mesh)) {
          remoteHitId = remoteMeshMap.get(mesh).id;
          anyHit = true;
        }
        this._spawnImpact(hitPoint, anyHit);
      }
    }

    if (this.ammo === 0 && this.reloadTime > 0) this.startReload();

    const result = { hit: anyHit, remoteHitId };
    if (this.onShot) this.onShot(result);
    return result;
  }

  // ── Animated flying bullet ────────────────────────────────────
  // start: exact world spawn point. dir: normalized travel direction.
  // endPoint: where the bullet should stop (hit point or far point).
  _spawnBullet(start, dir, endPoint) {
    // Bullet core — elongated sphere oriented along travel direction
    const coreGeo = new THREE.SphereGeometry(0.055, 6, 4);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffdd33,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    core.quaternion.copy(quat);
    core.scale.set(0.7, 0.7, 4.5); // elongated along direction

    core.position.copy(start);
    this.scene.add(core);

    // Trail line — two-point line that follows bullet, length = 2 units
    const trailPts = [start.clone(), start.clone()];
    const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xff9900,
      transparent: true,
      opacity: 0.55,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    this.scene.add(trail);

    const maxDist = Math.max(1, start.distanceTo(endPoint));

    this._bullets.push({
      core, trail,
      pos: start.clone(),
      dir: dir.clone(),
      speed: 68,
      distTraveled: 0,
      maxDist,
    });
  }

  // ── Impact spark ──────────────────────────────────────────────
  _spawnImpact(point, isHit) {
    const size  = isHit ? 0.22 : 0.1;
    const color = isHit ? 0xff4400 : 0xffee88;
    const geo   = new THREE.SphereGeometry(size, 5, 5);
    const mat   = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this._impacts.push({ mesh, ttl: 6, maxTtl: 6 });
  }

  update(delta) {
    // ── Reload timer ──────────────────────────────────────────
    if (this._reloading && delta) {
      this._reloadTimer -= delta;
      if (this._reloadTimer <= 0) {
        this._reloading = false;
        this.ammo = this.maxAmmo;
        if (this.onReloadComplete) this.onReloadComplete();
      }
    }

    // ── Move bullets ──────────────────────────────────────────
    if (delta) {
      for (let i = this._bullets.length - 1; i >= 0; i--) {
        const b = this._bullets[i];
        const step = b.speed * delta;
        b.distTraveled += step;
        b.pos.addScaledVector(b.dir, step);
        b.core.position.copy(b.pos);

        // Trail: start 2 units behind bullet, end at bullet
        const trailStart = b.pos.clone().addScaledVector(b.dir, -2.0);
        const attr = b.trail.geometry.attributes.position;
        attr.setXYZ(0, trailStart.x, trailStart.y, trailStart.z);
        attr.setXYZ(1, b.pos.x, b.pos.y, b.pos.z);
        attr.needsUpdate = true;

        // Fade out in last 3 units
        const remaining = b.maxDist - b.distTraveled;
        if (remaining < 3) {
          const f = Math.max(0, remaining / 3);
          b.core.material.opacity  = f;
          b.trail.material.opacity = f * 0.55;
        }

        if (b.distTraveled >= b.maxDist) {
          this.scene.remove(b.core);
          this.scene.remove(b.trail);
          b.core.geometry.dispose();  b.core.material.dispose();
          b.trail.geometry.dispose(); b.trail.material.dispose();
          this._bullets.splice(i, 1);
        }
      }
    }

    // ── Fade impact sparks ────────────────────────────────────
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const f = this._impacts[i];
      f.ttl--;
      f.mesh.material.opacity = f.ttl / f.maxTtl;
      if (f.ttl <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this._impacts.splice(i, 1);
      }
    }
  }
}
