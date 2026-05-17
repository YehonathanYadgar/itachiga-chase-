export class UI {
  constructor() {
    this.hp        = document.getElementById('hp');
    this.ammoEl    = document.getElementById('ammo');
    this.className = document.getElementById('class-name');
    this.weaponEl  = document.getElementById('weapon-name');
    this.killsEl   = document.getElementById('kills');
    this.flashEl   = document.getElementById('muzzle-flash');
    this.hitEl     = document.getElementById('hitmarker');
    this.statusEl  = document.getElementById('mp-status');
    this.feedEl    = document.getElementById('kill-feed');
    this.inviteEl  = document.getElementById('invite-bar');
    this._hitTimer   = 0;
    this._flashTimer = 0;
    this._kills      = 0;
    this._blueScore  = 0;
    this._redScore   = 0;
    this._scoreEl    = document.getElementById('team-score');
    this._blueEl     = document.getElementById('score-blue');
    this._redEl      = document.getElementById('score-red');
  }

  // Call once when game starts — shows the score bar with team colours
  setTeam(team) {
    if (this._scoreEl) this._scoreEl.style.display = 'flex';
    // Highlight your own team name
    if (this._blueEl) this._blueEl.style.fontWeight = team === 'blue' ? 'bold' : 'normal';
    if (this._redEl)  this._redEl.style.fontWeight  = team === 'red'  ? 'bold' : 'normal';
  }

  // Returns winning team string ('blue'|'red') when WIN_SCORE reached, else null
  addTeamKill(team, winScore = 30) {
    if (team === 'blue') this._blueScore++;
    else                 this._redScore++;
    if (this._blueEl) this._blueEl.textContent = `🔵 ${this._blueScore}`;
    if (this._redEl)  this._redEl.textContent  = `${this._redScore} 🔴`;
    if (this._blueScore >= winScore) return 'blue';
    if (this._redScore  >= winScore) return 'red';
    return null;
  }

  setClass(cls) {
    this.className.textContent = `${cls.emoji} ${cls.friendName}`;
    this.weaponEl.textContent  = cls.weapon;
    document.getElementById('hud').style.setProperty(
      '--class-color', `#${cls.bodyColor.toString(16).padStart(6,'0')}`
    );
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  showInviteLink(url) {
    if (!this.inviteEl) return;
    this.inviteEl.style.display = 'flex';
    const linkEl = document.getElementById('invite-url');
    if (linkEl) linkEl.textContent = url;
    const btn = document.getElementById('invite-copy');
    if (btn) {
      btn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
          btn.textContent = '✅ Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
      };
    }
  }

  setKills(n) {
    this._kills = n;
    this.killsEl.textContent = n;
  }

  showHit()   { this._hitTimer   = 10; }
  showFlash() { this._flashTimer = 3;  }

  addKillFeed(msg) {
    if (!this.feedEl) return;
    const el = document.createElement('div');
    el.className   = 'feed-item';
    el.textContent = msg;
    this.feedEl.prepend(el);
    setTimeout(() => el.remove(), 4000);
  }

  update(health, maxHealth, ammo, maxAmmo, ammoOverride = null) {
    const ratio = health / maxHealth;
    this.hp.textContent = Math.max(0, Math.round(health));
    this.hp.style.color = ratio > 0.5 ? '#44ff44' : ratio > 0.25 ? '#ffcc00' : '#ff3333';
    if (ammoOverride) {
      this.ammoEl.textContent = ammoOverride;
      this.ammoEl.style.color = '#ffaa00';
    } else {
      this.ammoEl.textContent = maxAmmo === Infinity ? '∞' : `${ammo} / ${maxAmmo}`;
      this.ammoEl.style.color = '';
    }
    this._hitTimer--;
    this.hitEl.style.opacity = this._hitTimer > 0 ? '1' : '0';
    this._flashTimer--;
    this.flashEl.style.opacity = this._flashTimer > 0 ? '0.8' : '0';
  }
}
