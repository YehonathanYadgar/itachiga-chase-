import * as THREE from 'three';

const BULLET_SPEED  = 180;   // units per second — fast but visible
const BULLET_SIZE   = 0.055; // radius of the tracer sphere

export class Shooter {
  constructor(scene, camera) {
    this.scene     = scene;
    this.camera    = camera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 300;

    this.damage   = 20;
    this.fireRate = 300;
    this.spread   = 0.04;
    this.pellets  = 1;
    this.recoil   = 0.018;
    this.ammo     = Infinity;
    this.maxAmmo  = Infinity;
    this._lastShot = 0;

    this._bullets = [];  // moving tracer bullets
    this._flashes = [];  // hit impact flashes

    this.onShot   = null;
    this.controls = null;
  }

  configure(cls) {
    this.damage   = cls.damage;
    this.fireRate = cls.fireRate;
    this.spread   = cls.spread;
    this.pellets  = cls.pellets ?? 1;
    this.recoil   = cls.recoil ?? 0.018;
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

    // Recoil — kick sight upward
    if (this.controls) this.controls.addRecoil(this.recoil);

    let anyHit      = false;
    let remoteHitId = null;

    const localMeshes  = enemies.flatMap(e => e.alive ? e.meshes : []);
    const remoteMeshes = [...remoteMeshMap.keys()];
    const allMeshes    = [...localMeshes, ...remoteMeshes];

    for (let p = 0; p < this.pellets; p++) {
      // First pellet always goes dead center; extra pellets (shotgun) spread
      const offsetX = p === 0 ? 0 : (Math.random() - 0.5) * this.spread * 2;
      const offsetY = p === 0 ? 0 : (Math.random() - 0.5) * this.spread * 2;
      const dir = new THREE.Vector3(offsetX, offsetY, -1)
        .applyQuaternion(this.camera.quaternion).normalize();

      this.raycaster.set(this.camera.position, dir);
      const hits = this.raycaster.intersectObjects(allMeshes, false);

      const from = this.camera.position.clone();

      if (hits.length > 0) {
        const mesh       = hits[0].object;
        const localEnemy = enemies.find(e => e.meshes.includes(mesh));
        if (localEnemy) { localEnemy.hit(this.damage); anyHit = true; }
        if (!localEnemy && remoteMeshMap.has(mesh)) {
          remoteHitId = remoteMeshMap.get(mesh).id;
          anyHit = true;
        }
        this._spawnBullet(from, hits[0].point, dir);
        this._spawnFlash(hits[0].point);
      } else {
        // Bullet goes to max range
        const to = from.clone().addScaledVector(dir, 120);
        this._spawnBullet(from, to, dir);
      }
    }

    const result = { hit: anyHit, remoteHitId };
    if (this.onShot) this.onShot(result);
    return result;
  }

  /** Bright moving tracer bullet */
  _spawnBullet(from, to, dir) {
    const geo  = new THREE.SphereGeometry(BULLET_SIZE, 5, 5);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    this.scene.add(mesh);

    const dist = from.distanceTo(to);
    this._bullets.push({ mesh, dir: dir.clone(), dist, traveled: 0 });
  }

  /** Small flash at impact point */
  _spawnFlash(point) {
    const geo  = new THREE.SphereGeometry(0.18, 5, 5);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this._flashes.push({ mesh, ttl: 4, maxTtl: 4 });
  }

  update(delta) {
    // Move tracer bullets
    const step = BULLET_SPEED * delta;
    for (let i = this._bullets.length - 1; i >= 0; i--) {
      const b = this._bullets[i];
      b.traveled += step;
      b.mesh.position.addScaledVector(b.dir, step);

      if (b.traveled >= b.dist) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this._bullets.splice(i, 1);
      }
    }

    // Fade impact flashes
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
