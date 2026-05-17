import * as THREE from 'three';
import { CLASSES }      from './classes.js';
import { createScene }  from './scene.js';
import { Controls }     from './controls.js';
import { Shooter }      from './shooter.js';
import { Crosshair }    from './crosshair.js';
import { spawnEnemies } from './enemies.js';
import { UI }           from './ui.js';
import { Network }      from './network.js';
import { Viewmodel }    from './viewmodel.js';
import { M4Viewmodel }  from './m4viewmodel.js';

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

// ── Clipboard helper (Clipboard API + execCommand fallback) ───
function copyToClipboard(text, btn, label = 'Copy link') {
  const succeed = () => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = label; }, 2000);
  };
  const fail = () => {
    btn.textContent = '❌ Failed — copy manually';
    setTimeout(() => { btn.textContent = label; }, 3000);
  };

  // Fallback: hidden textarea + execCommand (works even when Clipboard API is blocked)
  const execFallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy') ? succeed() : fail();
    } catch {
      fail();
    }
    document.body.removeChild(ta);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(succeed).catch(execFallback);
  } else {
    execFallback();
  }
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

  const crosshair  = new Crosshair(camera);
  crosshair.setWeapon(cls);

  // Pick the right viewmodel for this class (null-object for classes without one)
  const noVM = { show(){}, hide(){}, shoot(){}, setADS(){}, update(){} };
  const viewmodel = cls.id === 'rusher' ? new Viewmodel(camera)
                  : cls.id === 'sniper' ? new M4Viewmodel(camera)
                  : noVM;
  viewmodel.show();

  const enemies  = spawnEnemies(scene);
  const network  = new Network(scene);
  const ui       = new UI();
  ui.setClass(cls);

  let playerHealth = cls.health;
  let mouseDown    = false;
  let isDead       = false;

  // ── ADS (right-click) ─────────────────────────────────────
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('mousedown', e => {
    if (e.button === 2 && controls.locked) {
      crosshair.setADS(true);
      viewmodel.setADS(true);
      controls.isADS = true;
    }
  });
  renderer.domElement.addEventListener('mouseup', e => {
    if (e.button === 2) {
      crosshair.setADS(false);
      viewmodel.setADS(false);
      controls.isADS = false;
    }
  });

  // ── P2P connection ────────────────────────────────────────
  network.start(cls, camera).then(url => {
    document.getElementById('overlay-invite-url').textContent = url;
    document.getElementById('invite-panel').style.display = 'flex';
    document.getElementById('overlay-invite-copy').onclick = () => {
      copyToClipboard(url, document.getElementById('overlay-invite-copy'));
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
    viewmodel.setADS(false);
    controls.isADS = false;

    overlayEl.innerHTML = `
      <h2>PAUSED</h2>
      <p>Click to resume</p>
      <p class="sub">WASD move &nbsp;|&nbsp; Mouse aim &nbsp;|&nbsp; LMB shoot &nbsp;|&nbsp; <b>RMB</b> scope &nbsp;|&nbsp; <b>SPACE</b> jump &nbsp;|&nbsp; <b>SHIFT</b> sprint</p>`;
    overlayEl.style.display = 'flex';
  });

  // ── Death handler ─────────────────────────────────────────
  // NOTE: network.onDied is never called on the killed player's side because
  // RemotePlayer doesn't exist for self — death is detected via onHit reaching 0.
  // handleDeath() is the single source of truth; isDead prevents double-trigger.
  function handleDeath() {
    if (isDead) return;
    isDead       = true;
    playerHealth = 0;

    ui.addKillFeed('💀 You were killed! Respawning in 15s...');

    const cdEl = document.getElementById('respawn-countdown');
    cdEl.style.display = 'flex';
    let secs = 15;
    cdEl.innerHTML = `💀 YOU DIED<br><span id="cd-num">15</span>s`;
    const iv = setInterval(() => {
      secs--;
      const numEl = document.getElementById('cd-num');
      if (numEl) numEl.textContent = secs;
      if (secs <= 0) { clearInterval(iv); cdEl.style.display = 'none'; }
    }, 1000);

    setTimeout(() => {
      isDead         = false;
      playerHealth   = cls.health;
      controls._velX = 0;
      controls._velZ = 0;
      controls._vy   = 0;
      camera.position.set(0, 1.7, 5); // teleport back to spawn
    }, 15000);
  }

  // ── Network callbacks ─────────────────────────────────────
  network.onHit = (dmg) => {
    if (isDead) return;                          // ignore hits while already dead
    playerHealth = Math.max(0, playerHealth - dmg);
    if (playerHealth <= 0) handleDeath();        // trigger death screen on the killed player
  };
  network.onKill = (name) => {
    ui.addKillFeed(`You killed ${name} 💀`);
    ui.setKills(ui._kills + 1);
  };
  network.onDied = () => handleDeath();          // backup in case network fires it directly

  // ── Reload callbacks ──────────────────────────────────────
  shooter.onReloadStart = () => {
    viewmodel.reload(cls.reloadTime ?? 2200);
  };
  shooter.onReloadComplete = () => {
    // ammo display updates automatically via ui.update()
  };

  // R key → manual reload
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyR' && controls.locked && !shooter.isReloading) {
      shooter.startReload();
    }
  });

  // ── Shooting ──────────────────────────────────────────────
  shooter.onShot = ({ hit, remoteHitId }) => {
    ui.showFlash();
    viewmodel.shoot();
    if (hit) ui.showHit();
    if (remoteHitId) network.sendHit(remoteHitId, cls.damage);
  };

  const doShoot = () => {
    if (!controls.locked) return;
    if (isDead) return; // dead players can't shoot
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

      if (mouseDown && !shooter.isReloading) doShoot();
      shooter.update(delta);
      viewmodel.update(delta, controls.moveSpeed);
      const ammoDisplay = shooter.isReloading ? 'RELOADING...' : null;
      ui.update(playerHealth, cls.health, shooter.ammo, shooter.maxAmmo, ammoDisplay);
    }

    // Always update crosshair FOV lerp (even when not locked, so zoom is smooth)
    crosshair.update(delta);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
}
