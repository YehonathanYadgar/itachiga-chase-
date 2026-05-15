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

  update(health, maxHealth, ammo, maxAmmo) {
    const ratio = health / maxHealth;
    this.hp.textContent = Math.max(0, Math.round(health));
    this.hp.style.color = ratio > 0.5 ? '#44ff44' : ratio > 0.25 ? '#ffcc00' : '#ff3333';
    this.ammoEl.textContent = maxAmmo === Infinity ? '∞' : `${ammo} / ${maxAmmo}`;
    this._hitTimer--;
    this.hitEl.style.opacity = this._hitTimer > 0 ? '1' : '0';
    this._flashTimer--;
    this.flashEl.style.opacity = this._flashTimer > 0 ? '0.8' : '0';
  }
}
