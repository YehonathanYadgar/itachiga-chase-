export const CLASSES = [
  {
    id:           'tank',
    friendName:   'AMIT',
    title:        'The Tank',
    emoji:        '💪',
    bodyColor:    0xcc2222,
    crosshairId:  'minigun',   // red 4-line crosshair
    health:       200,
    speed:        5,
    damage:       28,
    fireRate:     110,          // fast burst (minigun feel)
    recoil:       0.04,
    weapon:       'MINIGUN',
    pellets:      1,
    spread:       0.055,
    ammo:         Infinity,
    desc:         'Slow but absolutely built different'
  },
  {
    id:           'sniper',
    friendName:   'YOSSI',
    title:        'The Sniper',
    emoji:        '🎯',
    bodyColor:    0x2244cc,
    crosshairId:  'sniper',    // thin lines + blue dot + scope on RMB
    health:       80,
    speed:        6,
    damage:       95,
    fireRate:     1100,
    recoil:       0.08,
    weapon:       'RIFLE',
    pellets:      1,
    spread:       0.002,        // near-perfect accuracy
    ammo:         Infinity,
    desc:         'One tap or go home'
  },
  {
    id:           'rusher',
    friendName:   'KOBI',
    title:        'The Rusher',
    emoji:        '⚡',
    bodyColor:    0x22aa44,
    crosshairId:  'smg',       // green diamond crosshair
    health:       90,
    speed:        13,
    damage:       12,
    fireRate:     75,           // very fast SMG
    recoil:       0.028,
    weapon:       'AK-47',
    pellets:      1,
    spread:       0.07,
    ammo:         Infinity,
    desc:         'Runs faster than he thinks'
  },
  {
    id:           'shotgunner',
    friendName:   'MOSHE',
    title:        'The Wildcard',
    emoji:        '💥',
    bodyColor:    0xff7700,
    crosshairId:  'shotgun',   // orange circle crosshair
    health:       130,
    speed:        7,
    damage:       18,
    fireRate:     700,
    recoil:       0.065,
    weapon:       'SHOTGUN',
    pellets:      8,
    spread:       0.16,
    ammo:         Infinity,
    desc:         'Why aim? Just spray and pray'
  }
];
