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
import { ShieldPower }  from './shield.js';

// ── Menu music ────────────────────────────────────────────────
const menuMusic  = document.getElementById('menu-music');
const musicBtn   = document.getElementById('music-btn');
menuMusic.volume = 0.2;   // was 0.4 — halved
let musicOn = false;

// ── In-game music (plays with random breaks) ──────────────────
const gameMusic = document.getElementById('game-music');
gameMusic.volume = 0.11;  // was 0.22 — halved
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

// ── JOAB hit SFX (plays only when the local JOAB takes damage) ─
const joabHitSfx = new Audio('assets/joab-hit.mp3');
joabHitSfx.volume = 0.85;
function playJoabHit() {
  try {
    joabHitSfx.currentTime = 0;
    joabHitSfx.play().catch(() => {});
  } catch {}
}

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

// ── Team + class select ───────────────────────────────────────
const selectEl  = document.getElementById('class-select');
const overlayEl = document.getElementById('overlay');
const hudEl     = document.getElementById('hud');
const grid      = document.getElementById('class-grid');

let selectedTeam = null;

const teamHint    = document.getElementById('team-hint');
const blueBtnEl   = document.getElementById('team-blue-btn');
const redBtnEl    = document.getElementById('team-red-btn');

blueBtnEl.addEventListener('click', () => {
  selectedTeam = 'blue';
  blueBtnEl.classList.add('active');
  redBtnEl.classList.remove('active');
  teamHint.textContent = '🔵 Team Blue selected — now pick your fighter!';
  teamHint.style.color = '#88bbff';
});

redBtnEl.addEventListener('click', () => {
  selectedTeam = 'red';
  redBtnEl.classList.add('active');
  blueBtnEl.classList.remove('active');
  teamHint.textContent = '🔴 Team Red selected — now pick your fighter!';
  teamHint.style.color = '#ffaaaa';
});

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
  card.addEventListener('click', () => {
    if (!selectedTeam) {
      teamHint.textContent = '⚠️ Pick a team first!';
      teamHint.style.color = '#ffaa00';
      setTimeout(() => {
        teamHint.textContent = '↑ Pick a team to unlock your fighter';
        teamHint.style.color = '';
      }, 2000);
      return;
    }
    startGame(cls, selectedTeam);
  });
  grid.appendChild(card);
}

// ── Clipboard helper ──────────────────────────────────────────
// Runs the synchronous execCommand copy FIRST — it must execute inside the
// click's user-activation window. A deferred .catch() loses that activation,
// which is why the old Clipboard-API-first approach silently failed.
function copyToClipboard(text, btn, label = 'Copy link') {
  const succeed = () => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = label; }, 2000);
  };
  const fail = () => {
    btn.textContent = '❌ Select & Ctrl+C';
    // Select the on-screen URL so the user can copy it manually
    const urlEl = document.getElementById('overlay-invite-url');
    if (urlEl) {
      const range = document.createRange();
      range.selectNodeContents(urlEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setTimeout(() => { btn.textContent = label; }, 4000);
  };

  // Synchronous textarea + execCommand — reliable inside a click handler
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);

  if (ok) { succeed(); return; }

  // execCommand unavailable — try the async Clipboard API as a last resort
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(succeed).catch(fail);
  } else {
    fail();
  }
}

// ── Game ──────────────────────────────────────────────────────
function startGame(cls, team) {
  // Hide class-select; show the dedicated invite screen FIRST.
  // The game overlay only appears after the player clicks "Start Game".
  selectEl.style.display = 'none';
  const inviteScreen = document.getElementById('invite-screen');
  inviteScreen.style.display = 'flex';

  const { scene, camera, renderer } = createScene();
  const controls  = new Controls(camera, renderer.domElement);
  controls.speed  = cls.speed;

  const shooter   = new Shooter(scene, camera);
  shooter.configure(cls);
  shooter.controls = controls;   // ← lets shooter read moveSpeed for spread

  const crosshair  = new Crosshair(camera);
  crosshair.setWeapon(cls);

  // Pick the right viewmodel for this class (null-object for classes without one)
  const noVM = { show(){}, hide(){}, shoot(){}, setADS(){}, update(){}, reload(){} };
  const viewmodel = cls.id === 'snake' ? new Viewmodel(camera)
                  : cls.id === 'joab'  ? new M4Viewmodel(camera)
                  : noVM;
  viewmodel.show();

  // JOAB's dual M4s: bullets spawn from whichever barrel fires next
  if (cls.id === 'joab') {
    shooter.muzzleProvider = () => viewmodel.getNextMuzzlePos();
  }

  // Shield power is exclusive to Joab — null for every other class
  const shield = cls.id === 'joab' ? new ShieldPower(scene, camera) : null;
  document.getElementById('shield-hud').style.display = cls.id === 'joab' ? 'flex' : 'none';
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

  // ── P2P connection (runs on the dedicated invite screen) ──
  const urlEl    = document.getElementById('overlay-invite-url');
  const peersEl  = document.getElementById('overlay-peers');
  const statusEl = document.getElementById('invite-status');
  const copyBtn  = document.getElementById('overlay-invite-copy');
  const enterBtn = document.getElementById('enter-game-btn');

  // Live peer count updates on the invite screen
  network.onPeerCount = (n) => {
    const total = n + 1;
    peersEl.textContent = `${total} player${total > 1 ? 's' : ''} in room`;
  };

  network.start(cls, camera, team).then(url => {
    urlEl.textContent = url;
    statusEl.textContent = network.isHost
      ? '✅ Hosting this room — share the link below to invite friends'
      : '✅ Joined the host — waiting for the host to start';
    statusEl.style.color = '#88ff88';
    console.log('[net] start ok, isHost =', network.isHost, 'url =', url, 'myId =', network.myId);
  }).catch(err => {
    console.warn('[net] start failed:', err);
    urlEl.textContent = window.location.href;
    statusEl.textContent = `⚠️ Couldn't reach the network (${err.message || err.type || 'unknown'}) — playing solo`;
    statusEl.style.color = '#ffaa66';
  });

  // Copy button — own click context, no pointer-lock interference
  copyBtn.onclick = () => copyToClipboard(urlEl.textContent, copyBtn);

  // "Start Game" — leaves the invite screen and shows the pointer-lock overlay
  enterBtn.onclick = () => {
    inviteScreen.style.display = 'none';
    overlayEl.style.display    = 'flex';
  };

  // ── Pointer lock ──────────────────────────────────────────
  overlayEl.addEventListener('click', () => {
    controls.lock();
  });

  controls.plc.addEventListener('lock', () => {
    if (musicOn) { menuMusic.pause(); menuMusic.currentTime = 0; musicOn = false; }
    startGameMusic();
    overlayEl.style.display = 'none';
    hudEl.style.display = 'block';
    ui.setTeam(team);
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
    if (isDead) return;
    // ── BULLETPROOF while shield is active (Joab only) ──
    if (shield && shield.isActive) {
      // Flash cyan instead of red so the player knows the wall absorbed the hit
      const df = document.getElementById('damage-flash');
      df.style.background = 'radial-gradient(ellipse at center, transparent 40%, rgba(0,200,255,0.35) 100%)';
      df.style.opacity = '1';
      setTimeout(() => {
        df.style.opacity   = '0';
        df.style.background = '';   // restore default red for next real hit
      }, 160);
      return;
    }
    playerHealth = Math.max(0, playerHealth - dmg);
    if (cls.id === 'joab') playJoabHit();        // JOAB-only damage SFX
    if (playerHealth <= 0) handleDeath();
  };
  network.onKill = (name) => {
    ui.addKillFeed(`You killed ${name} 💀`);
    ui.setKills(ui._kills + 1);
    network.sendTeamKill(team); // broadcast that our team scored
  };

  const WIN_SCORE = 30;
  network.onTeamKill = (scoringTeam) => {
    const winner = ui.addTeamKill(scoringTeam, WIN_SCORE);
    if (winner) {
      const banner  = document.getElementById('winner-banner');
      const textEl  = document.getElementById('winner-text');
      const isWin   = winner === team;
      const color   = winner === 'blue' ? '#66aaff' : '#ff6666';
      textEl.style.color = color;
      textEl.innerHTML   = isWin
        ? `🏆 TEAM ${winner.toUpperCase()} WINS!<br><span style="font-size:1.4rem">Your team won!</span>`
        : `💀 TEAM ${winner.toUpperCase()} WINS!<br><span style="font-size:1.4rem">Your team lost...</span>`;
      banner.style.display = 'flex';
      document.getElementById('winner-reload').onclick = () => location.reload();
    }
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

  // F key → activate shield power
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyF' && controls.locked && !isDead) {
      const activated = shield.activate();
      if (activated && cls.id === 'joab') playJoabHit();  // JOAB ability SFX
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
    shooter.tryShoot(enemies, performance.now(), network.getMeshMap(),
                     shield ? shield.getBlockingMeshes() : []);
  };

  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    mouseDown = true;
    doShoot();
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) mouseDown = false;
  });

  // ── Shield HUD elements ───────────────────────────────────
  const SHIELD_CIRC  = 150.8;  // SVG ring circumference (2 × π × 24)
  const shieldRingEl = document.getElementById('shield-ring');
  const shieldTextEl = document.getElementById('shield-status-text');
  const shieldOverEl = document.getElementById('shield-overlay');

  function updateShieldHUD() {
    if (!shield) return;
    // dashoffset: 150.8 = ring empty, 0 = ring fully filled
    shieldRingEl.style.strokeDashoffset = SHIELD_CIRC * (1 - shield.chargeRatio);

    if (shield.isActive) {
      const left = shield.timeLeft;
      const warn = left < 2.5;
      shieldRingEl.style.stroke  = warn ? '#ff4444' : '#00ffcc';
      shieldTextEl.textContent   = left.toFixed(1) + 's';
      shieldTextEl.style.color   = warn ? '#ff6666' : '#00ffcc';
      shieldOverEl.style.opacity = '1';
      shieldOverEl.style.background = warn
        ? 'radial-gradient(ellipse at center, transparent 30%, rgba(255,60,60,0.13) 100%)'
        : 'radial-gradient(ellipse at center, transparent 30%, rgba(0,180,255,0.13) 100%)';
    } else if (shield.isReady) {
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.006);
      shieldRingEl.style.stroke  = `rgba(0,255,200,${pulse})`;
      shieldTextEl.textContent   = 'READY';
      shieldTextEl.style.color   = '#00ffcc';
      shieldOverEl.style.opacity = '0';
    } else {
      shieldRingEl.style.stroke  = '#00ccff';
      shieldTextEl.textContent   = Math.ceil(25 - shield.charge) + 's';
      shieldTextEl.style.color   = 'rgba(200,240,255,0.75)';
      shieldOverEl.style.opacity = '0';
    }
  }

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
      if (shield) { shield.update(delta); updateShieldHUD(); }
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
