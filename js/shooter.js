import * as THREE from 'three';

export class Shooter {
  constructor(scene, camera) {
    this.scene     = scene;
    this.camera    = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 300;

    // Weapon stats (set by configure)
    this.damage   = 20;
    this.fireRate = 300;
    this.spread   = 0.04;
    this.pellets  = 1;
    this.ammo     = Infinity;
    this.maxAmmo  = Infinity;
    this.recoil   = 0.02;
    this._lastShot = 0;

    // Short-lived impact flashes (no trails — instant feedback)
    this._flashes = [];

    this.onShot   = null;
    this.controls = null;  // injected from main.js after construction
  }

  configure(cls) {
    this.damage   = cls.damage;
    this.fireRate = cls.fireRate;
    this.spread   = cls.spread;
    this.pellets  = cls.pellets ?? 1;
    this.ammo     = cls.ammo;
    this.maxAmmo  = cls.ammo;
    this.recoil   = cls.recoil ?? 0.018;
  }

  canShoot(now) {
    return now - this._lastShot >= this.fireRate;
  }

  tryShoot(enemies, now, remoteMeshMap = new Map()) {
    if (!this.canShoot(now)) return false;
    if (this.ammo !== Infinity && this.ammo <= 0) return false;

    this._lastShot = now;
    if (this.ammo !== Infinity) this.ammo--;

    // Instant recoil kick
    if (this.controls) this.controls.addRecoil(this.recoil);

    // Spread increases while moving
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

      if (hits.length > 0) {
        const mesh       = hits[0].object;
        const localEnemy = enemies.find(e => e.meshes.includes(mesh));
        if (localEnemy) { localEnemy.hit(this.damage); anyHit = true; }
        if (!localEnemy && remoteMeshMap.has(mesh)) {
          remoteHitId = remoteMeshMap.get(mesh).id;
          anyHit = true;
        }
        this._spawnFlash(hits[0].point, anyHit);
      }
    }

    const result = { hit: anyHit, remoteHitId };
    if (this.onShot) this.onShot(result);
    return result;
  }

  _spawnFlash(point, isHit) {
    const size  = isHit ? 0.16 : 0.07;
    const color = isHit ? 0xff4400 : 0xffee88;
    const geo   = new THREE.SphereGeometry(size, 5, 5);
    const mat   = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this._flashes.push({ mesh, ttl: 3, maxTtl: 3 });
  }

  update() {
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
