import * as THREE from 'three';

export function noise(x: number, y: number, z: number) {
  return (
    Math.sin(x * 2.4 + z * 1.8) + Math.cos(y * 3.2 - x * 0.6) * 0.6 + Math.sin(z * 4.5 + y) * 0.28
  );
}

export function createTerrainGeometry() {
  const geometry = new THREE.IcosahedronGeometry(2.22, 4);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const palette = ['#608c87', '#70a39a', '#91bda5', '#a4c9a9', '#b2ceab', '#ced9b8'].map(
    (c) => new THREE.Color(c),
  );
  const center = new THREE.Vector3(),
    point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    center.set(0, 0, 0);
    for (let j = 0; j < 3; j++) center.add(point.fromBufferAttribute(position, i + j));
    center.divideScalar(3);
    const n = noise(center.x, center.y, center.z);
    const color =
      palette[n > 0.12 ? Math.min(5, 2 + Math.floor((n + 0.1) * 1.7)) : n < -0.7 ? 0 : 1];
    for (let j = 0; j < 3; j++) {
      point.fromBufferAttribute(position, i + j);
      // Shared positions receive exactly the same continuous displacement, even
      // when neighboring faces have different colors and flat normals.
      const height = Math.max(0, noise(point.x, point.y, point.z) - 0.12);
      point.multiplyScalar(1 + height * 0.022);
      position.setXYZ(i + j, point.x, point.y, point.z);
      color.toArray(colors, (i + j) * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
