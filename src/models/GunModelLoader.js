/**
 * GunModelLoader.js
 * Loads GLB/GLTF 3D gun models from /models/ with fallback to ProceduralGuns
 * Normalizes pivot at grip (0,0,0), scales to target real-world length,
 * and ensures muzzle and shell-ejection locators exist.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralGuns } from './ProceduralGuns.js';

export class GunModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
  }

  /**
   * Load and normalize a gun model
   * @param {Object} gun - Gun metadata definition
   * @returns {Promise<THREE.Group>} Normalized Three.js Group
   */
  async loadGun(gun) {
    const key = gun.id || gun.name;
    if (this.cache.has(key)) {
      const cloned = this.cache.get(key).clone(true);
      this.bindWeaponParts(cloned, gun);
      return cloned;
    }

    const modelPath = `/models/${gun.model || gun.category.toLowerCase()}.glb`;

    let modelGroup = null;
    try {
      const gltf = await this.loader.loadAsync(modelPath);
      modelGroup = gltf.scene;
    } catch (err) {
      // Clean fallback to procedural 3D model
      modelGroup = ProceduralGuns.createGun(gun.category, {
        isAK: gun.name.includes('AK'),
        isTan: gun.name.toLowerCase().includes('tan')
      });
    }

    const normalized = this.normalizeModel(modelGroup, gun);
    this.cache.set(key, normalized);
    const cloned = normalized.clone(true);
    this.bindWeaponParts(cloned, gun);
    return cloned;
  }

  bindWeaponParts(root, gun) {
    let muzzle = root.getObjectByName('muzzle');
    if (!muzzle) {
      muzzle = new THREE.Object3D();
      muzzle.name = 'muzzle';
      const box = new THREE.Box3().setFromObject(root);
      muzzle.position.set(0, box.max.y * 0.8, box.max.z);
      root.add(muzzle);
    }

    let ejection = root.getObjectByName('ejection');
    if (!ejection) {
      ejection = new THREE.Object3D();
      ejection.name = 'ejection';
      const box = new THREE.Box3().setFromObject(root);
      ejection.position.set(box.max.x * 0.75, box.max.y * 0.7, box.min.z + 0.15);
      root.add(ejection);
    }

    root.userData = {
      length: gun.length || 0.45,
      muzzle,
      ejection,
      slide: root.getObjectByName('slide'),
      pump: root.getObjectByName('pump'),
      cylinder: root.getObjectByName('cylinder'),
      barrels: root.getObjectByName('barrels')
    };
  }

  /**
   * Normalizes scale, grip pivot, muzzle, and ejection ports
   */
  normalizeModel(group, gun) {
    const root = new THREE.Group();
    root.name = `Normalized_${gun.name}`;

    // Target lengths normalized for first-person webcam viewport (in meters)
    const targetLengths = {
      Pistol: 0.20,
      Revolver: 0.24,
      SMG: 0.32,
      Rifle: 0.46,
      Sniper: 0.55,
      Shotgun: 0.48,
      LMG: 0.52,
      Minigun: 0.54,
      Launcher: 0.60
    };
    const targetLength = gun.length || targetLengths[gun.category] || 0.45;

    // Compute bounding box
    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Primary length axis is usually Z or X
    const currentLength = Math.max(size.z, size.x, 0.01);
    const scaleFactor = targetLength / currentLength;
    group.scale.setScalar(scaleFactor);

    // If model was oriented along X, rotate to Z
    if (size.x > size.z * 1.5) {
      group.rotation.y = Math.PI / 2;
    }

    // Recompute after scaling/rotation
    const scaledBox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    // Locate or compute grip pivot: place grip at (0, 0, 0)
    let gripNode = group.getObjectByName('grip');
    if (gripNode) {
      const gripWorld = new THREE.Vector3();
      gripNode.getWorldPosition(gripWorld);
      group.position.sub(gripWorld);
    } else {
      // Offset so center X=0, grip base Y=0, and trigger region is at Z=0
      group.position.set(-center.x, -scaledBox.min.y - 0.05, -scaledBox.min.z - targetLength * 0.35);
    }
    root.add(group);

    // Find or create Muzzle Locator
    let muzzle = group.getObjectByName('muzzle');
    if (!muzzle) {
      muzzle = new THREE.Object3D();
      muzzle.name = 'muzzle';
      const updatedBox = new THREE.Box3().setFromObject(root);
      muzzle.position.set(0, updatedBox.max.y * 0.8, updatedBox.max.z);
      root.add(muzzle);
    }

    // Find or create Ejection Port Locator
    let ejection = group.getObjectByName('ejection');
    if (!ejection) {
      ejection = new THREE.Object3D();
      ejection.name = 'ejection';
      const updatedBox = new THREE.Box3().setFromObject(root);
      ejection.position.set(updatedBox.max.x * 0.75, updatedBox.max.y * 0.7, updatedBox.min.z + targetLength * 0.4);
      root.add(ejection);
    }

    // Enable shadows on all meshes
    root.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) {
          node.material.envMapIntensity = 1.2;
        }
      }
    });

    root.userData = {
      muzzle,
      ejection,
      length: targetLength,
      slide: group.getObjectByName('slide'),
      pump: group.getObjectByName('pump'),
      cylinder: group.getObjectByName('cylinder'),
      barrels: group.getObjectByName('barrels')
    };

    return root;
  }
}
