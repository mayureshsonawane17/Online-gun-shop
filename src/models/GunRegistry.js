/**
 * GunRegistry.js
 * Definitions and specifications for all 48 firearms in the online armoury
 */

export const CATEGORIES = {
  Pistol: { category: 'Pistol', mag: 15, rate: 220, auto: false, reloadTime: 1100, recoilKick: 0.8, length: 0.20, big: false, hands: 'one', weight: 1.0, followSpeed: 22, requiresSupport: false },
  Revolver: { category: 'Revolver', mag: 6, rate: 450, auto: false, reloadTime: 1900, recoilKick: 1.2, length: 0.24, big: false, hands: 'one', weight: 1.3, followSpeed: 20, requiresSupport: false },
  SMG: { category: 'SMG', mag: 30, rate: 70, auto: true, reloadTime: 1300, recoilKick: 0.45, length: 0.32, big: false, hands: 'optional-two', weight: 2.6, followSpeed: 14, foregripDist: 0.18, requiresSupport: false },
  Rifle: { category: 'Rifle', mag: 30, rate: 95, auto: true, reloadTime: 1500, recoilKick: 0.65, length: 0.46, big: false, hands: 'two', weight: 3.6, followSpeed: 9.5, foregripDist: 0.26, requiresSupport: false },
  Sniper: { category: 'Sniper', mag: 5, rate: 1100, auto: false, reloadTime: 1900, recoilKick: 1.5, length: 0.55, big: true, hands: 'two', weight: 6.8, followSpeed: 5.5, foregripDist: 0.32, requiresSupport: true },
  Shotgun: { category: 'Shotgun', mag: 6, rate: 800, auto: false, reloadTime: 1700, recoilKick: 1.6, length: 0.48, big: true, hands: 'two', weight: 4.2, followSpeed: 8.5, foregripDist: 0.25, requiresSupport: false },
  LMG: { category: 'LMG', mag: 100, rate: 100, auto: true, reloadTime: 2800, recoilKick: 0.75, length: 0.52, big: true, hands: 'two', weight: 8.5, followSpeed: 4.8, foregripDist: 0.30, requiresSupport: true },
  Minigun: { category: 'Minigun', mag: 300, rate: 35, auto: true, reloadTime: 3200, recoilKick: 0.85, length: 0.54, big: true, hands: 'two', weight: 18.0, followSpeed: 3.2, foregripDist: 0.28, requiresSupport: true },
  Launcher: { category: 'Launcher', mag: 1, rate: 1500, auto: false, reloadTime: 2800, recoilKick: 1.8, length: 0.60, big: true, backblast: true, hands: 'two', weight: 7.2, followSpeed: 5.0, foregripDist: 0.29, requiresSupport: true }
};

const AK_OVERRIDE = { rate: 105, recoilKick: 0.75 };

export const GUN_LIST = [
  { id: 'g00', name: 'Glock 17', category: 'Pistol' },
  { id: 'g01', name: 'M1911', category: 'Pistol', mag: 8, rate: 240 },
  { id: 'g02', name: 'Beretta 92', category: 'Pistol', rate: 230 },
  { id: 'g03', name: 'Python .357', category: 'Revolver' },
  { id: 'g04', name: 'MAC-10', category: 'SMG', rate: 50, mag: 30 },
  { id: 'g05', name: 'Glock 19 Tan', category: 'Pistol', isTan: true },
  { id: 'g06', name: 'MP5K', category: 'SMG' },
  { id: 'g07', name: 'Mini Uzi', category: 'SMG', rate: 60, mag: 32 },
  { id: 'g08', name: 'P90', category: 'SMG', mag: 50, rate: 60 },
  { id: 'g09', name: 'KRISS Vector', category: 'SMG', rate: 50, mag: 25 },
  { id: 'g10', name: 'MPX', category: 'SMG', rate: 70 },
  { id: 'g11', name: 'Compact Carbine', category: 'Rifle', rate: 85 },
  { id: 'g12', name: 'M4A1', category: 'Rifle' },
  { id: 'g13', name: 'Mk18 Tan', category: 'Rifle', isTan: true },
  { id: 'g14', name: 'M4 Optic', category: 'Rifle' },
  { id: 'g15', name: 'SCAR', category: 'Rifle', rate: 120, mag: 20, isTan: true },
  { id: 'g16', name: 'Tactical Shotgun', category: 'Shotgun', mag: 8, rate: 600 },
  { id: 'g17', name: 'Remington 870', category: 'Shotgun' },
  { id: 'g18', name: 'AK-47', category: 'Rifle', isAK: true, ...AK_OVERRIDE },
  { id: 'g19', name: 'AK-74', category: 'Rifle', isAK: true, ...AK_OVERRIDE },
  { id: 'g20', name: 'AK Blue Skin', category: 'Rifle', isAK: true, ...AK_OVERRIDE },
  { id: 'g21', name: 'Hunter Rifle', category: 'Sniper', mag: 5, rate: 900 },
  { id: 'g22', name: 'AWP', category: 'Sniper' },
  { id: 'g23', name: 'AWP Tan', category: 'Sniper', isTan: true },
  { id: 'g24', name: 'M24', category: 'Sniper', mag: 5 },
  { id: 'g25', name: 'Barrett M82', category: 'Sniper', mag: 10, rate: 900, recoilKick: 2.0 },
  { id: 'g26', name: 'Camo Sniper', category: 'Sniper', mag: 10, rate: 600 },
  { id: 'g27', name: 'AWM Tan', category: 'Sniper', isTan: true },
  { id: 'g28', name: 'Kar98', category: 'Sniper', mag: 5, rate: 1000 },
  { id: 'g29', name: 'Violet Sniper', category: 'Sniper', mag: 8, rate: 700 },
  { id: 'g30', name: 'Mossberg 500', category: 'Shotgun' },
  { id: 'g31', name: 'Coach Gun', category: 'Shotgun', mag: 2, rate: 350 },
  { id: 'g32', name: 'Pump Shotgun', category: 'Shotgun', mag: 6, rate: 700 },
  { id: 'g33', name: 'SPAS-12', category: 'Shotgun', mag: 8, rate: 600 },
  { id: 'g34', name: 'Striker', category: 'Shotgun', mag: 12, rate: 350 },
  { id: 'g35', name: 'KSG', category: 'Shotgun', mag: 14, rate: 550 },
  { id: 'g36', name: 'M249', category: 'LMG' },
  { id: 'g37', name: 'RPK', category: 'LMG', mag: 75, rate: 100 },
  { id: 'g38', name: 'M60', category: 'LMG', rate: 95 },
  { id: 'g39', name: 'Minigun', category: 'Minigun', rate: 35, mag: 300 },
  { id: 'g40', name: 'Siege MG', category: 'LMG', mag: 120, rate: 70 },
  { id: 'g41', name: 'Block Gun', category: 'LMG', mag: 60, rate: 80 },
  { id: 'g42', name: 'RPG-7', category: 'Launcher' },
  { id: 'g43', name: 'RPG-7 Open', category: 'Launcher' },
  { id: 'g44', name: 'AT4', category: 'Launcher' },
  { id: 'g45', name: 'Grenade Launcher', category: 'Launcher', mag: 6, rate: 700, reloadTime: 2500, backblast: false },
  { id: 'g46', name: 'Plasma Rifle', category: 'Rifle', rate: 90, isEnergy: true },
  { id: 'g47', name: 'Ion Cannon', category: 'LMG', mag: 80, rate: 90, isEnergy: true }
].map((item, index) => {
  const cat = CATEGORIES[item.category] || CATEGORIES.Pistol;
  return {
    index,
    ...cat,
    ...item
  };
});

