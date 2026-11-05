/**
 * ProceduralGuns.js
 * Generates high-fidelity low-poly 3D PBR weapon models in Three.js
 * Features proper grip pivot (0,0,0), muzzle tip locator, ejection port locator,
 * and separable moving parts (slide, bolt, cylinder, pump, minigun barrels).
 */
import * as THREE from 'three';

// Shared PBR Materials
const matSteel = new THREE.MeshStandardMaterial({
  color: 0x2b2e34,
  metalness: 0.82,
  roughness: 0.32
});

const matDarkSteel = new THREE.MeshStandardMaterial({
  color: 0x18191c,
  metalness: 0.9,
  roughness: 0.25
});

const matPolymer = new THREE.MeshStandardMaterial({
  color: 0x1c1e22,
  metalness: 0.15,
  roughness: 0.75
});

const matWood = new THREE.MeshStandardMaterial({
  color: 0x6e3b20,
  metalness: 0.05,
  roughness: 0.65
});

const matGoldBrass = new THREE.MeshStandardMaterial({
  color: 0xd4af37,
  metalness: 0.95,
  roughness: 0.2
});

const matTan = new THREE.MeshStandardMaterial({
  color: 0xa89168,
  metalness: 0.2,
  roughness: 0.7
});

const matRedShell = new THREE.MeshStandardMaterial({
  color: 0xaa2222,
  metalness: 0.3,
  roughness: 0.4
});

const matGlass = new THREE.MeshStandardMaterial({
  color: 0x5599cc,
  metalness: 0.9,
  roughness: 0.1,
  transparent: true,
  opacity: 0.75
});

export class ProceduralGuns {
  /**
   * Builds a gun model by category name
   */
  static createGun(category = 'Pistol', options = {}) {
    switch (category) {
      case 'Revolver':
        return this.createRevolver(options);
      case 'SMG':
        return this.createSMG(options);
      case 'Rifle':
        return this.createRifle(options);
      case 'Sniper':
        return this.createSniper(options);
      case 'Shotgun':
        return this.createShotgun(options);
      case 'LMG':
        return this.createLMG(options);
      case 'Minigun':
        return this.createMinigun(options);
      case 'Launcher':
        return this.createLauncher(options);
      case 'Pistol':
      default:
        return this.createPistol(options);
    }
  }

  // -------------------------------------------------------------
  // 1. PISTOL (e.g. Glock 17 / M1911)
  // -------------------------------------------------------------
  static createPistol(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Pistol';

    // Grip (centered at 0, 0, 0)
    const gripGeo = new THREE.BoxGeometry(0.038, 0.12, 0.045);
    const grip = new THREE.Mesh(gripGeo, options.isTan ? matTan : matPolymer);
    grip.position.set(0, -0.05, 0.015);
    grip.rotation.x = 0.2; // angled grip
    root.add(grip);

    // Trigger Guard & Trigger
    const guardGeo = new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI);
    const guard = new THREE.Mesh(guardGeo, matSteel);
    guard.position.set(0, -0.012, 0.042);
    guard.rotation.y = Math.PI / 2;
    guard.rotation.x = Math.PI;
    root.add(guard);

    const triggerGeo = new THREE.BoxGeometry(0.005, 0.016, 0.008);
    const trigger = new THREE.Mesh(triggerGeo, matDarkSteel);
    trigger.position.set(0, -0.012, 0.042);
    trigger.rotation.x = -0.3;
    root.add(trigger);

    // Frame (receiver)
    const frameGeo = new THREE.BoxGeometry(0.035, 0.03, 0.19);
    const frame = new THREE.Mesh(frameGeo, matSteel);
    frame.position.set(0, 0.015, 0.06);
    root.add(frame);

    // Separable Slide (moves back during recoil)
    const slideGroup = new THREE.Group();
    slideGroup.name = 'slide';

    const slideGeo = new THREE.BoxGeometry(0.033, 0.032, 0.20);
    const slide = new THREE.Mesh(slideGeo, matDarkSteel);
    slide.position.set(0, 0.045, 0.06);
    slideGroup.add(slide);

    // Barrel inside slide
    const barrelGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.21, 12);
    const barrel = new THREE.Mesh(barrelGeo, matSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.045, 0.065);
    slideGroup.add(barrel);

    // Front & Rear Sights
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.006), matDarkSteel);
    frontSight.position.set(0, 0.065, 0.155);
    slideGroup.add(frontSight);

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.008), matDarkSteel);
    rearSight.position.set(0, 0.065, -0.035);
    slideGroup.add(rearSight);

    root.add(slideGroup);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.045, 0.175);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.022, 0.045, 0.03);
    root.add(ejection);

    root.userData = { length: 0.22, muzzle, ejection, slide: slideGroup };
    return root;
  }

  // -------------------------------------------------------------
  // 2. REVOLVER (e.g. Python .357)
  // -------------------------------------------------------------
  static createRevolver(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Revolver';

    // Wood/polymer curved grip
    const gripGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.11, 8);
    const grip = new THREE.Mesh(gripGeo, matWood);
    grip.position.set(0, -0.05, 0.01);
    grip.rotation.x = 0.35;
    root.add(grip);

    // Frame
    const frameGeo = new THREE.BoxGeometry(0.036, 0.048, 0.12);
    const frame = new THREE.Mesh(frameGeo, matSteel);
    frame.position.set(0, 0.02, 0.03);
    root.add(frame);

    // Fluted 6-shot Cylinder
    const cylinderGroup = new THREE.Group();
    cylinderGroup.name = 'cylinder';
    const cylGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.052, 16);
    const cylinder = new THREE.Mesh(cylGeo, matDarkSteel);
    cylinder.rotation.x = Math.PI / 2;
    cylinderGroup.add(cylinder);

    // Chamber indentations
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.054, 8), matSteel);
      chamber.rotation.x = Math.PI / 2;
      chamber.position.set(Math.cos(angle) * 0.015, Math.sin(angle) * 0.015, 0);
      cylinderGroup.add(chamber);
    }
    cylinderGroup.position.set(0, 0.022, 0.035);
    root.add(cylinderGroup);

    // Heavy Underlug Barrel with ventilated top rib
    const barrelGeo = new THREE.BoxGeometry(0.024, 0.042, 0.16);
    const barrel = new THREE.Mesh(barrelGeo, matSteel);
    barrel.position.set(0, 0.028, 0.14);
    root.add(barrel);

    const innerBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.17, 12), matDarkSteel);
    innerBarrel.rotation.x = Math.PI / 2;
    innerBarrel.position.set(0, 0.034, 0.145);
    root.add(innerBarrel);

    // Hammer
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.014), matDarkSteel);
    hammer.position.set(0, 0.042, -0.032);
    hammer.rotation.x = -0.4;
    root.add(hammer);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.034, 0.225);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.028, 0.025, 0.035);
    root.add(ejection);

    root.userData = { length: 0.28, muzzle, ejection, cylinder: cylinderGroup };
    return root;
  }

  // -------------------------------------------------------------
  // 3. SMG (e.g. MP5 / Vector / P90)
  // -------------------------------------------------------------
  static createSMG(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_SMG';

    // Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.13, 0.048), matPolymer);
    grip.position.set(0, -0.06, 0.01);
    grip.rotation.x = 0.2;
    root.add(grip);

    // Receiver Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.075, 0.32), matPolymer);
    body.position.set(0, 0.035, 0.06);
    root.add(body);

    // Barrel with Shroud
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12), matDarkSteel);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.04, 0.28);
    root.add(shroud);

    // Curved 30-round Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.15, 0.045), matDarkSteel);
    mag.position.set(0, -0.08, 0.12);
    mag.rotation.x = -0.22;
    root.add(mag);

    // Front Grip
    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.1, 10), matPolymer);
    foregrip.position.set(0, -0.04, 0.21);
    root.add(foregrip);

    // Top Picatinny Rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.24), matDarkSteel);
    rail.position.set(0, 0.08, 0.06);
    root.add(rail);

    // Retractable Wire Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.16), matSteel);
    stock.position.set(0, 0.02, -0.16);
    root.add(stock);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.04, 0.365);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.03, 0.05, 0.08);
    root.add(ejection);

    root.userData = { length: 0.42, muzzle, ejection };
    return root;
  }

  // -------------------------------------------------------------
  // 4. ASSAULT RIFLE (e.g. M4A1 / AK-47 / SCAR)
  // -------------------------------------------------------------
  static createRifle(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Rifle';
    const isAK = options.isAK;

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.13, 0.05), isAK ? matWood : matPolymer);
    grip.position.set(0, -0.06, 0.02);
    grip.rotation.x = 0.22;
    root.add(grip);

    // Lower & Upper Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.28), isAK ? matDarkSteel : matSteel);
    receiver.position.set(0, 0.035, 0.04);
    root.add(receiver);

    // Handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.06, 0.25), isAK ? matWood : matPolymer);
    handguard.position.set(0, 0.04, 0.28);
    root.add(handguard);

    // Barrel + Birdcage Muzzle Brake
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 12), matDarkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, 0.45);
    root.add(barrel);

    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.04, 12), matSteel);
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.04, 0.62);
    root.add(brake);

    // Magazine (Curved banana mag for AK or STANAG box for M4)
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.18, 0.06), isAK ? matSteel : matDarkSteel);
    mag.position.set(0, -0.08, 0.11);
    mag.rotation.x = isAK ? -0.32 : -0.15;
    root.add(mag);

    // Tactical Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.12, 0.22), isAK ? matWood : matPolymer);
    stock.position.set(0, 0.01, -0.19);
    root.add(stock);

    // Red Dot / Holographic Optic Sight
    const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.08), matDarkSteel);
    opticBase.position.set(0, 0.09, 0.04);
    root.add(opticBase);

    const opticHousing = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.035, 0.05), matDarkSteel);
    opticHousing.position.set(0, 0.115, 0.04);
    root.add(opticHousing);

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.052, 12), matGlass);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.115, 0.04);
    root.add(lens);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.04, 0.645);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.032, 0.055, 0.05);
    root.add(ejection);

    root.userData = { length: 0.72, muzzle, ejection };
    return root;
  }

  // -------------------------------------------------------------
  // 5. SNIPER RIFLE (e.g. Barrett M82 / M24)
  // -------------------------------------------------------------
  static createSniper(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Sniper';

    // Ergonomic Stock & Grip
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.32), matPolymer);
    stock.position.set(0, -0.01, -0.22);
    root.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.12, 0.05), matPolymer);
    grip.position.set(0, -0.07, 0.01);
    grip.rotation.x = 0.25;
    root.add(grip);

    // Heavy Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.095, 0.36), matDarkSteel);
    receiver.position.set(0, 0.04, 0.06);
    root.add(receiver);

    // Long Fluted Precision Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.58, 16), matSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.045, 0.51);
    root.add(barrel);

    // Large Tank-Brake Muzzle
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.036, 0.07), matDarkSteel);
    brake.position.set(0, 0.045, 0.82);
    root.add(brake);

    // High-Power Optical Sniper Scope
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.30, 16), matDarkSteel);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.13, 0.08);
    root.add(scopeTube);

    const scopeLensFront = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 16), matGlass);
    scopeLensFront.rotation.x = Math.PI / 2;
    scopeLensFront.position.set(0, 0.13, 0.23);
    root.add(scopeLensFront);

    // Folded Bipod under barrel
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.18), matSteel);
    bipod.position.set(0, 0.015, 0.48);
    root.add(bipod);

    // Bolt handle
    const boltHandle = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), matSteel);
    boltHandle.position.set(0.04, 0.06, -0.02);
    root.add(boltHandle);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.045, 0.86);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.035, 0.06, 0.02);
    root.add(ejection);

    root.userData = { length: 0.95, muzzle, ejection };
    return root;
  }

  // -------------------------------------------------------------
  // 6. SHOTGUN (e.g. Mossberg 500 / Pump Action)
  // -------------------------------------------------------------
  static createShotgun(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Shotgun';

    // Stock & Wrist Grip (solid wood or polymer)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.28), matWood);
    stock.position.set(0, -0.02, -0.18);
    root.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.08, 0.08), matWood);
    grip.position.set(0, -0.04, 0.0);
    grip.rotation.x = 0.28;
    root.add(grip);

    // Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.24), matDarkSteel);
    receiver.position.set(0, 0.03, 0.08);
    root.add(receiver);

    // 12-Gauge Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 14), matSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.055, 0.40);
    root.add(barrel);

    // Magazine Tube underneath
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.42, 14), matDarkSteel);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.025, 0.38);
    root.add(magTube);

    // Separable Pump Slide with Ribbed Grip
    const pumpGroup = new THREE.Group();
    pumpGroup.name = 'pump';
    const pumpGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 12), matWood);
    pumpGrip.rotation.x = Math.PI / 2;
    pumpGrip.position.set(0, 0.025, 0.32);
    pumpGroup.add(pumpGrip);
    root.add(pumpGroup);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.055, 0.645);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.032, 0.045, 0.08);
    root.add(ejection);

    root.userData = { length: 0.75, muzzle, ejection, pump: pumpGroup };
    return root;
  }

  // -------------------------------------------------------------
  // 7. LMG (e.g. M249 SAW / M60)
  // -------------------------------------------------------------
  static createLMG(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_LMG';

    // Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.055), matPolymer);
    grip.position.set(0, -0.07, 0.02);
    grip.rotation.x = 0.2;
    root.add(grip);

    // Massive Receiver Box
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.38), matSteel);
    receiver.position.set(0, 0.05, 0.08);
    root.add(receiver);

    // Heavy Barrel with Heat Shroud
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.44, 16), matDarkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.055, 0.46);
    root.add(barrel);

    // Top Carry Handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.06, 0.14), matPolymer);
    handle.position.set(0, 0.14, 0.22);
    root.add(handle);

    // 100-round Ammo Drum Box
    const drum = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.14), matDarkSteel);
    drum.position.set(-0.04, -0.06, 0.12);
    root.add(drum);

    // Solid Heavy Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.24), matPolymer);
    stock.position.set(0, 0.03, -0.18);
    root.add(stock);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.055, 0.685);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.045, 0.06, 0.1);
    root.add(ejection);

    root.userData = { length: 0.82, muzzle, ejection };
    return root;
  }

  // -------------------------------------------------------------
  // 8. MINIGUN (6-Barrel Rotary Gatling)
  // -------------------------------------------------------------
  static createMinigun(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Minigun';

    // Central Motor Housing
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.28, 16), matDarkSteel);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(0, 0.02, 0.04);
    root.add(motor);

    // Dual Rear Spade Grips
    const gripCross = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 12), matSteel);
    gripCross.position.set(0, 0.02, -0.16);
    root.add(gripCross);

    const gripL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10), matPolymer);
    gripL.position.set(-0.08, -0.02, -0.16);
    root.add(gripL);

    const gripR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10), matPolymer);
    gripR.position.set(0.08, -0.02, -0.16);
    root.add(gripR);

    // Rotating 6-barrel cluster
    const barrelCluster = new THREE.Group();
    barrelCluster.name = 'barrels';

    const barrelLength = 0.52;
    const clusterRadius = 0.042;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, barrelLength, 10), matSteel);
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(angle) * clusterRadius, Math.sin(angle) * clusterRadius, barrelLength / 2);
      barrelCluster.add(b);
    }

    // Barrel support rings
    for (const zOffset of [0.15, 0.35, 0.5]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(clusterRadius, 0.006, 8, 16), matDarkSteel);
      ring.position.set(0, 0, zOffset);
      barrelCluster.add(ring);
    }

    barrelCluster.position.set(0, 0.02, 0.18);
    root.add(barrelCluster);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.02, 0.72);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0.06, -0.04, 0.05);
    root.add(ejection);

    root.userData = { length: 0.86, muzzle, ejection, barrels: barrelCluster };
    return root;
  }

  // -------------------------------------------------------------
  // 9. LAUNCHER (e.g. RPG-7)
  // -------------------------------------------------------------
  static createLauncher(options = {}) {
    const root = new THREE.Group();
    root.name = 'Gun_Launcher';

    // Wooden Heat Shield Tube
    const tubeCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.36, 16), matWood);
    tubeCenter.rotation.x = Math.PI / 2;
    tubeCenter.position.set(0, 0.02, 0.02);
    root.add(tubeCenter);

    // Steel Front & Rear Tube
    const tubeFront = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 16), matSteel);
    tubeFront.rotation.x = Math.PI / 2;
    tubeFront.position.set(0, 0.02, 0.34);
    root.add(tubeFront);

    // Rear Conical Venturi Exhaust Nozzle
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.036, 0.24, 16), matDarkSteel);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.02, -0.26);
    root.add(nozzle);

    // Large PG-7V Rocket Warhead
    const warhead = new THREE.Group();
    warhead.name = 'warhead';

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 16), matDarkSteel);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0, 0.58);
    warhead.add(cone);

    const rocketBody = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.18, 16), matDarkSteel);
    rocketBody.rotation.x = Math.PI / 2;
    rocketBody.position.set(0, 0, 0.44);
    warhead.add(rocketBody);

    warhead.position.set(0, 0.02, 0.08);
    root.add(warhead);

    // Dual Pistol Grips
    const frontGrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.045), matWood);
    frontGrip.position.set(0, -0.07, 0.14);
    frontGrip.rotation.x = 0.2;
    root.add(frontGrip);

    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.045), matWood);
    rearGrip.position.set(0, -0.07, -0.06);
    rearGrip.rotation.x = 0.2;
    root.add(rearGrip);

    // PGO-7 Optical Sight on left bracket
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.12), matDarkSteel);
    sight.position.set(-0.055, 0.08, 0.08);
    root.add(sight);

    // Locators
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0, 0.02, 0.78);
    root.add(muzzle);

    const ejection = new THREE.Object3D();
    ejection.name = 'ejection';
    ejection.position.set(0, 0.02, -0.38); // backblast ejection
    root.add(ejection);

    root.userData = { length: 1.05, muzzle, ejection, warhead };
    return root;
  }
}

