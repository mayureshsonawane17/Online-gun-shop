/**
 * Turntable.js
 * 3D showroom pedestal on the bottom-left where weapons rest and slowly rotate under a spotlight.
 * Manages smooth pick-up lift transitions into the player's hand and return to the pedestal.
 */
import * as THREE from 'three';

export class Turntable {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Showroom_Turntable';

    // Position pedestal in bottom-left in front of camera
    this.basePos = new THREE.Vector3(-0.48, -0.32, -1.05);
    this.group.position.copy(this.basePos);

    // Elegant Brass & Velvet Pedestal Base
    const baseGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.05, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xc49b38,
      metalness: 0.88,
      roughness: 0.25
    });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.receiveShadow = true;
    this.group.add(this.baseMesh);

    // Velvet turntable disc
    const discGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.015, 32);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x1f2229,
      metalness: 0.15,
      roughness: 0.8
    });
    this.discMesh = new THREE.Mesh(discGeo, discMat);
    this.discMesh.position.y = 0.03;
    this.discMesh.receiveShadow = true;
    this.group.add(this.discMesh);

    // Pedestal Spotlight
    this.spotlight = new THREE.SpotLight(0xfff3d6, 4.5, 3.5, Math.PI / 6, 0.45);
    this.spotlight.position.set(-0.48, 0.8, -0.85);
    this.spotlight.target = this.discMesh;
    this.spotlight.castShadow = true;
    this.scene.add(this.spotlight);

    this.scene.add(this.group);

    // Weapon mounting slot on turntable
    this.mountNode = new THREE.Group();
    this.mountNode.position.set(0, 0.08, 0);
    this.group.add(this.mountNode);

    this.rotationSpeed = 0.55; // radians per second
  }

  update(dt, isGunHeld = false) {
    // Rotate turntable disc and unheld gun slowly
    if (!isGunHeld) {
      this.mountNode.rotation.y += this.rotationSpeed * dt;
      // Gentle idle vertical breathing
      this.mountNode.position.y = 0.08 + Math.sin(performance.now() * 0.002) * 0.008;
    }
  }

  getStandWorldPosition() {
    const pos = new THREE.Vector3();
    this.mountNode.getWorldPosition(pos);
    return pos;
  }
}

