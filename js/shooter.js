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
    this._lastShot = 0;

    // Short-lived impact flashes (no trails — instant feedback)
    this._flashes = [];

    this.onShot   = null;
    this.controls = null;  // used only for moveSpeed spread check
  }

  configure(cls) {
    this.damage   = cls.damage;
    this.fireRate = cls.fireRate;
    this.spread   = cls.spread;
    this.pellets  = cls.pellets ?? 1;
    this.ammo     = cls.ammo;
    this.maxAmmo  = cls.ammo;
  }

  canShoot(now) {
    return now - this._lastShot >= this.fireRate;
  }

  tryShoot(enemies, now, remoteMeshMap = new Map()) {
    if (!this.canShoot(now)) return false;
    if (this.ammo !== Infinity && this.ammo <= 0) return false;

    this._lastShot = now;
    if (this.ammo !== Infinity) this.ammo--;

    let anyHit      = false;
    let remoteHitId = null;

    const localMeshes  = enemies.flatMap(e => e.alive ? e.meshes : []);
    const remoteMeshes = [...remoteMeshMap.keys()];
    const allMeshes    = [...localMeshes, ...remoteMeshes];

    for (let p = 0; p < this.pellets; p++) {
      // First pellet (or only pellet) always goes dead center — exactly where you aim.
      // Extra shotgun pellets spread around the center.
      const offsetX = p === 0 ? 0 : (Math.random() - 0.5) * this.spread * 2;
      const offsetY = p === 0 ? 0 : (Math.random() - 0.5) * this.spread * 2;
      const dir = new THREE.Vector3(offsetX, offsetY, -1)
        .applyQuaternion(this.camera.quaternion).normalize();

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
