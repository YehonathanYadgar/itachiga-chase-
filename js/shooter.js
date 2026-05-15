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
    this.reloadTime = 0;      // ms, 0 = no reload
    this._lastShot  = 0;
    this._reloading = false;
    this._reloadTimer = 0;    // seconds remaining

    this._flashes = [];

    this.onShot           = null;
    this.onReloadStart    = null;
    this.onReloadComplete = null;
    this.controls         = null;
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
    if (this.ammo !== Infinity && this.ammo <= 0) {
      this.startReload();
      return false;
    }

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
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread * 2,
        (Math.random() - 0.5) * spread * 2,
        -1
      ).applyQuaternion(this.camera.quaternion).normalize();

      this.raycaster.set(this.camera.position, dir);
      const hits = this.raycaster.intersectObjects(allMeshes, false);

      const hitPoint = hits.length > 0 ? hits[0].point : null;
      this._spawnTracer(this.camera.position, dir, hitPoint);

      if (hitPoint) {
        const mesh       = hits[0].object;
        const localEnemy = enemies.find(e => e.meshes.includes(mesh));
        if (localEnemy) { localEnemy.hit(this.damage); anyHit = true; }
        if (!localEnemy && remoteMeshMap.has(mesh)) {
          remoteHitId = remoteMeshMap.get(mesh).id;
          anyHit = true;
        }
        this._spawnFlash(hitPoint, anyHit);
      }
    }

    // Auto-reload on last bullet
    if (this.ammo === 0 && this.reloadTime > 0) this.startReload();

    const result = { hit: anyHit, remoteHitId };
    if (this.onShot) this.onShot(result);
    return result;
  }

  _spawnFlash(point, isHit) {
    const size  = isHit ? 0.22 : 0.1;
    const color = isHit ? 0xff4400 : 0xffee88;
    const geo   = new THREE.SphereGeometry(size, 5, 5);
    const mat   = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this._flashes.push({ mesh, ttl: 6, maxTtl: 6 });
  }

  _spawnTracer(origin, direction, hitPoint) {
    const end = hitPoint
      ? hitPoint.clone()
      : origin.clone().addScaledVector(direction, 150);
    // Start slightly in front of camera so it doesn't clip the near plane
    const start = origin.clone().addScaledVector(direction, 0.4);
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this._flashes.push({ mesh: line, ttl: 10, maxTtl: 10 });
  }

  update(delta) {
    // Reload countdown
    if (this._reloading && delta) {
      this._reloadTimer -= delta;
      if (this._reloadTimer <= 0) {
        this._reloading = false;
        this.ammo = this.maxAmmo;
        if (this.onReloadComplete) this.onReloadComplete();
      }
    }

    // Flash fade
    for (let i = this._flashes.length - 1; i >= 0; i--) {
      const f = this._flashes[i];
      f.ttl--;
      f.mesh.material.opacity = f.ttl / f.maxTtl;
      if (f.ttl <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this._flashes.splice(i, 1);
      }
    }
  }
}
