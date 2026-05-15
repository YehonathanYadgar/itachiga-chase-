import * as THREE from 'three';
import { CLASSES }      from './classes.js';
import { createScene }  from './scene.js';
import { Controls }     from './controls.js';
import { Shooter }      from './shooter.js';
import { Crosshair }    from './crosshair.js';
import { spawnEnemies } from './enemies.js';
import { UI }           from './ui.js';
import { Network }      from './network.js';

// ── Menu music ────────────────────────────────────────────────
const menuMusic  = document.getElementById('menu-music');
const musicBtn   = document.getElementById('music-btn');
menuMusic.volume = 0.4;
let musicOn = false;

// ── In-game music (plays with random breaks) ──────────────────
const gameMusic = document.getElementById('game-music');
gameMusic.volume = 0.22;
let gameMusicTimer = null;

function startGameMusic() {
  gameMusic.currentTime = 0;
  gameMusic.play().catch(() => {});
}
function stopGameMusic() {
  clearTimeout(gameMusicTimer);
  gameMusic.pause();
  gameMusic.currentTime = 0;
}
gameMusic.addEventListener('ended', () => {
  // Wait 15–45 s then play again
  const breakMs = (15 + Math.random() * 30) * 1000;
  gameMusicTimer = setTimeout(startGameMusic, breakMs);
});

musicBtn.addEventListener('click', () => {
  if (musicOn) {
    menuMusic.pause();
    musicOn = false;
    musicBtn.textContent = '🔇 Music off';
  } else {
    menuMusic.play().then(() => {
      musicOn = true;
      musicBtn.textContent = '🔊 Music on';
    }).catch(() => {});
  }
});

// ── Class select ──────────────────────────────────────────────
const selectEl  = document.getElementById('class-select');
const overlayEl = document.getElementById('overlay');
const hudEl     = document.getElementById('hud');
const grid      = document.getElementById('class-grid');

for (const cls of CLASSES) {
  const hex  = '#' + cls.bodyColor.toString(16).padStart(6, '0');
  const card = document.createElement('div');
  card.className = 'class-card';
  card.style.borderColor = hex;
  card.innerHTML = `
    <div class="c-emoji">${cls.emoji}</div>
    <div class="c-name" style="color:${hex}">${cls.friendName}</div>
    <div class="c-title">${cls.title}</div>
    <div class="c-weapon">🔫 ${cls.weapon}</div>
    <div class="c-stats">
      <span>❤️ ${cls.health}</span>
      <span>⚡ ${cls.speed}</span>
      <span>💥 ${cls.damage}</span>
    </div>
    <div class="c-desc">"${cls.desc}"</div>
  `;
  card.addEventListener('click', () => startGame(cls));
  grid.appendChild(card);
}

// ── Game ──────────────────────────────────────────────────────
function startGame(cls) {
  selectEl.style.display = 'none';
  overlayEl.style.display = 'flex';

  const { scene, camera, renderer } = createScene();
  const controls  = new Controls(camera, renderer.domElement);
  controls.speed  = cls.speed;

  const shooter   = new Shooter(scene, camera);
  shooter.configure(cls);
  shooter.controls = controls;   // ← lets shooter read moveSpeed for spread

  const crosshair = new Crosshair(camera);
  crosshair.setWeapon(cls);

  const enemies  = spawnEnemies(scene);
  const network  = new Network(scene);
  const ui       = new UI();
  ui.setClass(cls);

  let playerHealth = cls.health;
  let mouseDown    = false;

  // ── ADS (right-click) ─────────────────────────────────────
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button === 2 && controls.locked) {
      crosshair.setADS(true);
      controls.isADS = true;
    }
  });
  renderer.domElement.addEventListener('mouseup', e => {
    if (e.button === 2) {
      crosshair.setADS(false);
      controls.isADS = false;
    }
  });

  // ── P2P connection ────────────────────────────────────────
  network.start(cls, camera).then(url => {
    document.getElementById('overlay-invite-url').textContent = url;
    document.getElementById('invite-panel').style.display = 'flex';
    document.getElementById('overlay-invite-copy').onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        document.getElementById('overlay-invite-copy').textContent = '✅ Copied!';
        setTimeout(() => {
          document.getElementById('overlay-invite-copy').textContent = 'Copy link';
        }, 2000);
      });
    };
    network.onPeerCount = (n) => {
      document.getElementById('overlay-peers').textContent =
        `${n + 1} player${n + 1 > 1 ? 's' : ''} in room`;
    };
  }).catch(err => {
    console.warn('P2P failed, solo mode:', err.message);
    document.getElementById('overlay-invite-url').textContent = 'P2P unavailable — solo mode';
    document.getElementById('invite-panel').style.display = 'flex';
  });

  // ── Pointer lock ──────────────────────────────────────────
  overlayEl.addEventListener('click', e => {
    if (e.target.id === 'overlay-invite-copy') return;
    controls.lock();
  });

  controls.plc.addEventListener('lock', () => {
    if (musicOn) { menuMusic.pause(); menuMusic.currentTime = 0; musicOn = false; }
    startGameMusic();
    overlayEl.style.display = 'none';
    hudEl.style.display = 'block';
    ui.setStatus(network.isHost ? '🟢 Hosting' : '🟢 Connected');
    network.onPeerCount = (n) => {
      ui.setStatus(`🟢 ${n + 1} player${n + 1 > 1 ? 's' : ''} online`);
    };
  });

  controls.plc.addEventListener('unlock', () => {
    stopGameMusic();
    // Cancel ADS on unlock
    crosshair.setADS(false);
    controls.isADS = false;

    overlayEl.innerHTML = `
      <h2>PAUSED</h2>
      <p>Click to resume</p>
      <p class="sub">WASD move &nbsp;|&nbsp; Mouse aim &nbsp;|&nbsp; LMB shoot &nbsp;|&nbsp; <b>RMB</b> scope &nbsp;|&nbsp; <b>SPACE</b> jump &nbsp;|&nbsp; <b>SHIFT</b> sprint</p>`;
    overlayEl.style.display = 'flex';
  });

  // ── Network callbacks ─────────────────────────────────────
  network.onHit = (dmg) => {
    playerHealth = Math.max(0, playerHealth - dmg);
  };
  network.onKill = (name) => {
    ui.addKillFeed(`You killed ${name} 💀`);
    ui.setKills(ui._kills + 1);
  };
  network.onDied = () => {
    ui.addKillFeed('You were killed! Respawning...');
    playerHealth = 0;
    setTimeout(() => { playerHealth = cls.health; }, 5000);
  };

  // ── Shooting ──────────────────────────────────────────────
  shooter.onShot = ({ hit, remoteHitId }) => {
    ui.showFlash();
    if (hit) ui.showHit();
    if (remoteHitId) network.sendHit(remoteHitId, cls.damage);
  };

  const doShoot = () => {
    if (!controls.locked) return;
    shooter.tryShoot(enemies, performance.now(), network.getMeshMap());
  };

  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    mouseDown = true;
    doShoot();
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) mouseDown = false;
  });

  // ── Game loop ─────────────────────────────────────────────
  const clock = new THREE.Clock();
  function loop() {
    const delta = Math.min(clock.getDelta(), 0.05);

    if (controls.locked) {
      controls.update(delta);

      // Crosshair spread: ratio of current speed vs max speed
      const maxSpd = cls.speed * 1.65;
      crosshair.setSpread(Math.min(1, controls.moveSpeed / maxSpd));

      if (mouseDown) doShoot();
      shooter.update(delta);
      ui.update(playerHealth, cls.health, shooter.ammo, shooter.maxAmmo);
    }

    // Always update crosshair FOV lerp (even when not locked, so zoom is smooth)
    crosshair.update(delta);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
}
