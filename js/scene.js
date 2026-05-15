import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 30, 90);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.7, 10);
  scene.add(camera);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(25, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100, 40, 40),
    new THREE.MeshLambertMaterial({ color: 0x4a7c3f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ground grid lines (feel of arena floor)
  const gridHelper = new THREE.GridHelper(100, 20, 0x336622, 0x336622);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Arena walls
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x777766 });
  [
    { pos: [0, 4, -50],  size: [100, 8, 1] },
    { pos: [0, 4,  50],  size: [100, 8, 1] },
    { pos: [-50, 4, 0],  size: [1, 8, 100] },
    { pos: [ 50, 4, 0],  size: [1, 8, 100] },
  ].forEach(({ pos, size }) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat);
    w.position.set(...pos);
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  });

  // Cover boxes
  const coverMat = new THREE.MeshLambertMaterial({ color: 0xaa8855 });
  const coverPositions = [
    [0, 1.5, -18], [12, 1.5, -14], [-12, 1.5, -14],
    [20, 1.5, -25], [-20, 1.5, -25], [6, 1.5, -30],
    [-6, 1.5, -30], [0, 1.5, -38], [16, 1.5, 4],
    [-16, 1.5, 4],
  ];
  coverPositions.forEach(([x, y, z]) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), coverMat);
    box.position.set(x, y, z);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
