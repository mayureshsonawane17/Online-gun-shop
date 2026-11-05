/**
 * PowerRegistry.js
 * Definitions and specifications for the mystical powers in the Magic section.
 */

export const POWER_LIST = [
  {
    id: 'energy_wave',
    name: 'Energy Wave',
    element: 'Energy',
    themeColor: '#00e5ff',
    glowHex: 0x00e5ff,
    coreHex: 0xffffff,
    energyCost: 40,
    drainRate: 28, // energy per second when sustaining beam
    icon: '⚡',
    badge: 'BEAM',
    hint: 'Cup hands at hip to charge, thrust forward to fire',
    tip: '🙌 Hold both hands cupped at hip. When charged, thrust both palms forward to unleash a sustained beam. Release for shockwave.',
    controlsHint: 'Cupped Hands (charge) → Thrust Forward (fire)'
  },
  {
    id: 'power_blast',
    name: 'Power Blast',
    element: 'Ki',
    themeColor: '#ffd700',
    glowHex: 0xffd700,
    coreHex: 0xfff9c4,
    energyCost: 14,
    drainRate: 0,
    icon: '💥',
    badge: 'BLAST',
    hint: 'Push palm for ki blast, 2-finger point for spirit shot',
    tip: '✋ Push an open palm forward for a rapid energy orb. ✌️ Point index & middle fingers together for a high-speed piercing spirit shot.',
    controlsHint: 'Open Palm Push (blast) / 2-Finger Point (spirit shot)'
  },
  {
    id: 'air',
    name: 'Air Tempest',
    element: 'Air',
    themeColor: '#69f0ae',
    glowHex: 0x69f0ae,
    coreHex: 0xe8f5e9,
    energyCost: 20,
    drainRate: 15,
    icon: '🌪️',
    badge: 'VORTEX',
    hint: 'Circle hand to vortex, palm push for shockwave, chop for blades',
    tip: '🌪️ Move hand in a circle to whip up a swirling wind vortex. ✋ Push palm forward to bend the screen with a shockwave. 🫲 Horizontal chop to slice air blades.',
    controlsHint: 'Circle (vortex) / Push (gust) / Chop (air blades)'
  },
  {
    id: 'water',
    name: 'Water Whip',
    element: 'Water',
    themeColor: '#00b0ff',
    glowHex: 0x00b0ff,
    coreHex: 0xe1f5fe,
    energyCost: 22,
    drainRate: 12,
    icon: '🌊',
    badge: 'FLUID',
    hint: 'Flow hand to draw water ribbon, lift hands for orb, throw to whip',
    tip: '🌊 Move hand smoothly to carve a flowing liquid ribbon. 🤲 Lift both hands upward to conjure a floating water sphere. 👋 Throw forward to lash a water whip.',
    controlsHint: 'Flow (ribbon) / Lift Both (orb) / Throw (water whip)'
  },
  {
    id: 'earth',
    name: 'Earth Shatter',
    element: 'Earth',
    themeColor: '#ff9100',
    glowHex: 0xff9100,
    coreHex: 0xffe0b2,
    energyCost: 28,
    drainRate: 0,
    icon: '🪨',
    badge: 'STONE',
    hint: 'Raise fist for orbiting boulders, punch to throw, smash to crack',
    tip: '✊ Raise a closed fist to summon boulders from the ground. 👊 Punch forward to hurl a boulder. ⬇️ Smash both fists down to shatter the ground in a shockwave.',
    controlsHint: 'Raise Fist (summon) / Punch (hurl) / Smash Down (quake)'
  },
  {
    id: 'fire',
    name: 'Dragon Fire',
    element: 'Fire',
    themeColor: '#ff3d00',
    glowHex: 0xff3d00,
    coreHex: 0xffeb3b,
    energyCost: 18,
    drainRate: 35,
    icon: '🔥',
    badge: 'FLAME',
    hint: 'Flick palm for fireball, hold both palms forward for flame stream',
    tip: '🔥 Flick open palm to launch fiery blast. 🙌 Push both open palms forward to channel a continuous stream of dragon breath fire.',
    controlsHint: 'Palm Flick (fireball) / Both Palms Forward (flamethrower)'
  },
  {
    id: 'lightning',
    name: 'Lightning Shield',
    element: 'Lightning',
    themeColor: '#b388ff',
    glowHex: 0xb388ff,
    coreHex: 0xffffff,
    energyCost: 22,
    drainRate: 20,
    icon: '🛡️',
    badge: 'BARRIER',
    hint: 'Spread fingers for lightning arcs, both palms forward for barrier',
    tip: '⚡ Spread your fingers wide to spark electric arcs between fingertips. 🛡️ Push both open palms forward to raise a glowing hexagonal energy shield.',
    controlsHint: 'Spread Fingers (arcs) / Both Palms Forward (hex shield)'
  }
];
