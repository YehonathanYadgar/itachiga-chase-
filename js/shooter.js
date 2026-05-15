import * as THREE from 'three';

export class Shooter {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 200;

    this.damage   = 20;
    this.fireRate = 300;
    this.spread   = 0.05;
    this.pellets  = 1;
    this.ammo     = Infinity;
    this.maxAmmo  = Infinity;
    this._lastShot = 0;

    // Bullet trails pool
    this._trails = [];

    // Muzzle flash (DOM, handled by UI)
    this.onShot = null; // callback(hit: boolean)
  }

  configure(cls) {
    this.damage   = cls.damage;
    this.fireRate = cls.fireRate;
    this.spread   = cls.spread;
    this.pellets  = cls.pellets ?? 1;
    this.ammo     = cls.ammo;
    this.maxAmmo  = cls.ammo;
  }

  // remoteMeshMap: Map<mesh → RemotePlayer> from network.getMeshMap()
  tryShoot(enemies, now, remoteMeshMap = new Map()) {
    if (now - this._lastShot < this.fireRate) return false;
    if (this.ammo !== Infinity && this.ammo <= 0) return false;

    this._lastShot = now;
    if (this.ammo !== Infinity) this.ammo--;

    let anyHit      = false;
    let remoteHitId = null;

    const localMeshes  = enemies.flatMap(e => e.alive ? e.meshes : []);
    const remoteMeshes = [...remoteMeshMap.keys()];
    const allMeshes    = [...localMeshes, ...remoteMeshes];

    for (let p = 0; p < this.pellets; p++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * this.spread * 2,
        (Math.random() - 0.5) * this.spread * 2,
        -1
      ).applyQuaternion(this.camera.quaternion).normalize();

      this.raycaster.set(this.camera.position, dir);
      const hits = this.raycaster.intersectObjects(allMeshes, false);

      if (hits.length > 0) {
        const mesh = hits[0].object;

        // Local enemy?
        const localEnemy = enemies.find(e => e.meshes.includes(mesh));
        if (localEnemy) {
          localEnemy.hit(this.damage);
          anyHit = true;
        }

        // Remote player?
        if (!localEnemy && remoteMeshMap.has(mesh)) {
          const rp = remoteMeshMap.get(mesh);
          remoteHitId = rp.id;
          anyHit = true;
        }

        this._spawnTrail(this.camera.position.clone(), hits[0].point);
      } else {
        const far = this.camera.position.clone().addScaledVector(dir, 60);
        this._spawnTrail(this.camera.position.clone(), far);
      }
    }

    const result = { hit: anyHit, remoteHitId };
    if (this.onShot) this.onShot(result);
    return result;
  }

  _spawnTrail(from, to) {
    const points = [from, to];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this._trails.push({ line, ttl: 6 });
  }

  update() {
    for (let i = this._trails.length - 1; i >= 0; i--) {
      const t = this._trails[i];
      t.ttl--;
      t.line.material.opacity = t.ttl / 6 * 0.7;
      if (t.ttl <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this._trails.splice(i, 1);
      }
    }
  }
}
