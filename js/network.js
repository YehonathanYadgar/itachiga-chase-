/**
 * Peer-to-peer multiplayer via PeerJS (free public signalling server).
 * Host/relay model:
 *   - First player creates a room (random code → URL hash)
 *   - Others open the shared URL and auto-join
 *   - Host relays all messages between clients
 * Zero setup, zero cost, no accounts.
 */

import * as THREE from 'three';

const PEER_PREFIX = 'fsh-'; // avoids ID collisions on public PeerJS server
const PEER_CFG = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  debug: 0,
};

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export class Network {
  constructor(scene) {
    this.scene    = scene;
    this.peer     = null;
    this.myId     = null;
    this.isHost   = false;
    this.camera   = null;
    this.cls      = null;
    this._syncId  = null;

    // host only  → Map<peerId, DataConnection>
    this._conns   = new Map();
    // client only → single connection to host
    this._hostConn = null;

    // rendered remote players → Map<peerId, RemotePlayer>
    this.remote   = {};

    // Callbacks
    this.onKill      = null; // (name) => void
    this.onDied      = null; // () => void
    this.onPeerCount = null; // (n) => void
    this.onHit       = null; // (dmg) => void  — called when WE take damage
  }

  // Call once, right after pointer lock. Returns the shareable URL.
  start(cls, camera) {
    this.cls    = cls;
    this.camera = camera;

    const hash = window.location.hash.slice(1);
    if (hash.length === 6) {
      return this._joinRoom(hash);
    } else {
      const code = makeCode();
      window.location.hash = code;
      return this._createRoom(code);
    }
  }

  // ── HOST ─────────────────────────────────────────────────────
  _createRoom(code) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.peer   = new Peer(PEER_PREFIX + code, PEER_CFG);

      this.peer.on('open', () => {
        this.myId = code;
        this._startSync();
        resolve(window.location.href);
      });

      this.peer.on('connection', conn => this._hostOnConn(conn));
      this.peer.on('error', err => {
        if (err.type === 'unavailable-id') {
          // code taken → try a new one
          const newCode = makeCode();
          window.location.hash = newCode;
          this.peer.destroy();
          this._createRoom(newCode).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  _hostOnConn(conn) {
    const pid = conn.peer;

    conn.on('open', () => {
      this._conns.set(pid, conn);
      if (this.onPeerCount) this.onPeerCount(this._conns.size);

      // Send world state to new joiner — include host + all current clients
      const worldPlayers = {
        [this.myId]: { name: this.cls.friendName, color: this.cls.bodyColor,
                       health: this.cls.health, maxHealth: this.cls.health },
      };
      for (const [id, rp] of Object.entries(this.remote)) {
        worldPlayers[id] = { name: rp.name, color: rp._color, health: rp.health, maxHealth: rp.maxHealth };
      }
      conn.send({ t: 'world', players: worldPlayers });
    });

    conn.on('data', msg => {
      // Relay to all other clients (add sender ID)
      msg.from = pid;
      this._relay(msg, pid);
      // Process locally
      this._handle(msg);
    });

    conn.on('close', () => {
      this._conns.delete(pid);
      this._removeRemote(pid);
      this._relay({ t: 'left', from: pid });
      if (this.onPeerCount) this.onPeerCount(this._conns.size);
    });
    conn.on('error', () => conn.close());
  }

  _relay(msg, excludeId = null) {
    for (const [pid, conn] of this._conns) {
      if (pid !== excludeId && conn.open) conn.send(msg);
    }
  }

  // ── CLIENT ────────────────────────────────────────────────────
  _joinRoom(code) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.peer   = new Peer(PEER_CFG); // random PeerJS ID

      this.peer.on('open', id => {
        this.myId    = id;
        const conn   = this.peer.connect(PEER_PREFIX + code, { reliable: true });
        this._hostConn = conn;

        conn.on('open', () => {
          // Introduce ourselves to host
          conn.send({ t: 'join', name: this.cls.friendName, color: this.cls.bodyColor,
                      health: this.cls.health, maxHealth: this.cls.health });
          this._startSync();
          resolve(window.location.href);
        });

        conn.on('data', msg => this._handle(msg));
        conn.on('close', () => { /* host left */ });
        conn.on('error', reject);
      });

      this.peer.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 8000);
    });
  }

  _send(msg) {
    if (this.isHost) {
      this._relay(msg);
    } else {
      if (this._hostConn?.open) this._hostConn.send(msg);
    }
  }

  // ── Shared message handler ────────────────────────────────────
  _handle(msg) {
    const id = msg.from;

    switch (msg.t) {
      case 'world': {
        for (const [pid, data] of Object.entries(msg.players)) {
          if (pid !== this.myId) this._addRemote(pid, data);
        }
        break;
      }
      case 'join': {
        if (!this.remote[id]) {
          this._addRemote(id, { name: msg.name, color: msg.color,
                                health: msg.health, maxHealth: msg.maxHealth });
          // HOST: tell everyone else about this new joiner
          if (this.isHost) {
            this._relay({ t: 'joined', from: id, name: msg.name, color: msg.color,
                          health: msg.health, maxHealth: msg.maxHealth }, id);
          }
        }
        break;
      }
      case 'joined': {
        if (id !== this.myId && !this.remote[id]) {
          this._addRemote(id, { name: msg.name, color: msg.color,
                                health: msg.health, maxHealth: msg.maxHealth });
        }
        break;
      }
      case 'move': {
        this.remote[id]?.moveTo(msg.pos, msg.yaw);
        break;
      }
      case 'hit': {
        const target = this.remote[msg.targetId];
        if (target) {
          target.setHealth(Math.max(0, target.health - msg.dmg));
          if (target.health <= 0) {
            target.die();
            if (msg.targetId === this.myId && this.onDied) this.onDied();
            if (id === this.myId && this.onKill) this.onKill(target.name);
            setTimeout(() => target.respawn(), 15000);
          }
        }
        // Self-damage when WE are hit
        if (msg.targetId === this.myId) {
          if (this.onHit) this.onHit(msg.dmg);
          document.getElementById('damage-flash').style.opacity = '0.4';
          setTimeout(() => { document.getElementById('damage-flash').style.opacity = '0'; }, 180);
        }
        break;
      }
      case 'left': {
        this._removeRemote(id);
        break;
      }
    }
  }

  // ── Position sync ─────────────────────────────────────────────
  _startSync() {
    this._syncId = setInterval(() => {
      if (!this.camera) return;
      const msg = {
        t: this.isHost ? 'move' : 'move',
        from: this.myId,
        pos: { x: +this.camera.position.x.toFixed(2),
               z: +this.camera.position.z.toFixed(2) },
        yaw: +this.camera.rotation.y.toFixed(3),
      };
      if (this.isHost) {
        this._relay(msg);
      } else {
        if (this._hostConn?.open) this._hostConn.send(msg);
      }
    }, 50);
  }

  // ── Public shoot/hit API ──────────────────────────────────────
  sendShoot() { /* visual only for now — trails handled locally */ }

  sendHit(targetId, dmg) {
    const msg = { t: 'hit', from: this.myId, targetId, dmg };
    this._send(msg);
    this._handle(msg); // always apply locally — updates health bar for shooter
  }

  getMeshMap() {
    const map = new Map();
    for (const rp of Object.values(this.remote)) {
      for (const m of rp.meshes) map.set(m, rp);
    }
    return map;
  }

  // ── Remote player management ──────────────────────────────────
  _addRemote(id, data) {
    if (this.remote[id]) return;
    this.remote[id] = new RemotePlayer(this.scene, id, data);
    if (this.onPeerCount) this.onPeerCount(Object.keys(this.remote).length);
  }

  _removeRemote(id) {
    const rp = this.remote[id];
    if (rp) { this.scene.remove(rp.group); delete this.remote[id]; }
    if (this.onPeerCount) this.onPeerCount(Object.keys(this.remote).length);
  }

  destroy() {
    clearInterval(this._syncId);
    this.peer?.destroy();
  }
}

// ── Remote player 3-D mesh ────────────────────────────────────
class RemotePlayer {
  constructor(scene, id, data) {
    this.id        = id;
    this.name      = data.name      ?? '???';
    this.maxHealth = data.maxHealth ?? 100;
    this.health    = data.health    ?? this.maxHealth;
    this._color    = data.color     ?? 0xff4444;

    this.group = new THREE.Group();

    this.bodyMat = new THREE.MeshLambertMaterial({ color: this._color });
    this.body    = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.45), this.bodyMat);
    this.body.position.y = 0.65;
    this.body.castShadow = true;
    this.body.userData   = { type: 'remote', id };

    this.headMat = new THREE.MeshLambertMaterial({ color: 0xffcc88 });
    this.head    = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), this.headMat);
    this.head.position.y = 1.55;
    this.head.userData   = { type: 'remote', id };

    this.meshes = [this.body, this.head];
    this.group.add(this.body, this.head);

    // Name + HP bar
    this._canvas = document.createElement('canvas');
    this._canvas.width = 160; this._canvas.height = 40;
    this._tex    = new THREE.CanvasTexture(this._canvas);
    const smat   = new THREE.SpriteMaterial({ map: this._tex, depthTest: false });
    this._sprite = new THREE.Sprite(smat);
    this._sprite.scale.set(2.2, 0.55, 1);
    this._sprite.position.y = 2.5;
    this.group.add(this._sprite);

    scene.add(this.group);
    this._drawBar();
  }

  moveTo(pos, yaw) {
    this.group.position.set(pos.x, 0, pos.z);
    this.group.rotation.y = yaw;
  }

  setHealth(hp) {
    this.health = Math.max(0, hp);
    this._drawBar();
    this.bodyMat.color.setHex(0xffffff);
    setTimeout(() => this.bodyMat.color.setHex(this._color), 70);
  }

  die() {
    this.group.visible = false; // disappear completely, not lie on floor
  }

  respawn() {
    this.health           = this.maxHealth;
    this.group.visible    = true;
    this.group.rotation.z = 0;
    this.group.position.y = 0;
    this._drawBar();
  }

  _drawBar() {
    const ctx = this._canvas.getContext('2d');
    ctx.clearRect(0, 0, 160, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect(0, 0, 160, 40, 6);
    ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillRect(6, 6, 148, 14);
    const r = this.health / this.maxHealth;
    ctx.fillStyle = r > 0.5 ? '#33ee55' : r > 0.25 ? '#ffcc00' : '#ff3333';
    ctx.fillRect(6, 6, 148 * r, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, 80, 34);
    this._tex.needsUpdate = true;
  }
}
