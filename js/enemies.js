import * as THREE from 'three';

const RESPAWN_TIME = 5000;

export class Enemy {
  constructor(scene, position, name, color, maxHealth = 100) {
    this.name = name;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.alive = true;
    this._color = color;

    this.group = new THREE.Group();
    this.group.position.copy(position);

    // Body
    this.bodyMat = new THREE.MeshLambertMaterial({ color });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.45), this.bodyMat);
    this.body.position.y = 0.65;
    this.body.castShadow  = true;
    this.body.userData    = { type: 'enemy' };

    // Head
    this.headMat = new THREE.MeshLambertMaterial({ color: 0xffcc88 });
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), this.headMat);
    this.head.position.y  = 1.55;
    this.head.castShadow  = true;
    this.head.userData    = { type: 'enemy' };

    this.group.add(this.body, this.head);
    this.meshes = [this.body, this.head];

    // Health bar sprite
    this.hpCanvas = document.createElement('canvas');
    this.hpCanvas.width = 160;
    this.hpCanvas.height = 40;
    this.hpTexture = new THREE.CanvasTexture(this.hpCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: this.hpTexture, depthTest: false });
    this.hpSprite = new THREE.Sprite(spriteMat);
    this.hpSprite.scale.set(2.2, 0.55, 1);
    this.hpSprite.position.y = 2.4;
    this.group.add(this.hpSprite);

    scene.add(this.group);
    this._updateBar();
  }

  _updateBar() {
    const ctx = this.hpCanvas.getContext('2d');
    ctx.clearRect(0, 0, 160, 40);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect(0, 0, 160, 40, 6);
    ctx.fill();

    // HP track
    ctx.fillStyle = '#333';
    ctx.fillRect(6, 6, 148, 14);

    // HP fill
    const ratio = this.health / this.maxHealth;
    ctx.fillStyle = ratio > 0.5 ? '#33ee55' : ratio > 0.25 ? '#ffcc00' : '#ff3333';
    ctx.fillRect(6, 6, 148 * ratio, 14);

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, 80, 34);

    this.hpTexture.needsUpdate = true;
  }

  hit(damage) {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - damage);
    this._updateBar();

    // Flash white
    this.bodyMat.color.setHex(0xffffff);
    this.headMat.color.setHex(0xffffff);
    setTimeout(() => {
      if (this.health > 0) {
        this.bodyMat.color.setHex(this._color);
        this.headMat.color.setHex(0xffcc88);
      }
    }, 60);

    if (this.health <= 0) this._die();
    return true;
  }

  _die() {
    this.alive = false;
    this.group.rotation.z = Math.PI / 2;
    this.group.position.y = -0.35;
    this.meshes.forEach(m => m.material.color.setHex(0x444444));

    setTimeout(() => {
      this.health = this.maxHealth;
      this.alive = true;
      this.group.rotation.z = 0;
      this.group.position.y = 0;
      this.bodyMat.color.setHex(this._color);
      this.headMat.color.setHex(0xffcc88);
      this._updateBar();
    }, RESPAWN_TIME);
  }
}

export function spawnEnemies(scene) {
  const defs = [
    { pos: [0,  0, -20], name: 'TARGET A', color: 0xff3333 },
    { pos: [-12, 0, -18], name: 'TARGET B', color: 0x3355ff },
    { pos: [ 12, 0, -18], name: 'TARGET C', color: 0xff8800 },
    { pos: [-22, 0,  -8], name: 'TARGET D', color: 0x22cc55 },
    { pos: [ 22, 0,  -8], name: 'TARGET E', color: 0xaa44ff },
    { pos: [  0, 0, -36], name: 'TARGET F', color: 0xff44aa },
    { pos: [-10, 0, -30], name: 'TARGET G', color: 0x44ccff },
    { pos: [ 10, 0, -30], name: 'TARGET H', color: 0xffdd00 },
  ];
  return defs.map(d =>
    new Enemy(scene, new THREE.Vector3(...d.pos), d.name, d.color, 100)
  );
}
