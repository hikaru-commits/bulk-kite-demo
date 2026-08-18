import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const app = document.getElementById('app');
const altitudeEl = document.getElementById('altitude');
const lineLengthEl = document.getElementById('lineLength');
const forceEl = document.getElementById('force');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d8ff);
scene.fog = new THREE.Fog(0xa9d8ff, 220, 650);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(-130, 70, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(20, 25, 0);
controls.minDistance = 55;
controls.maxDistance = 420;

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6b78, 2.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(-80, 140, 70);
sun.castShadow = true;
scene.add(sun);

// Ocean
const oceanGeo = new THREE.PlaneGeometry(900, 700, 110, 90);
const oceanMat = new THREE.MeshStandardMaterial({
  color: 0x17688e,
  roughness: 0.36,
  metalness: 0.08,
  side: THREE.DoubleSide
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -1.5;
ocean.receiveShadow = true;
scene.add(ocean);

const oceanBase = oceanGeo.attributes.position.array.slice();

// Ship group: fixed in world space except tiny roll/pitch visual motion.
const ship = new THREE.Group();
scene.add(ship);

const hullMat = new THREE.MeshStandardMaterial({ color: 0x222b31, roughness: 0.72 });
const deckMat = new THREE.MeshStandardMaterial({ color: 0x7c8388, roughness: 0.8 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.65 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xc7352b, roughness: 0.6 });

// Main hull oriented along X axis, bow at +X.
const hull = new THREE.Mesh(new THREE.BoxGeometry(125, 12, 25), hullMat);
hull.position.set(0, 4.5, 0);
hull.castShadow = true;
ship.add(hull);

// Bow wedge
const bowShape = new THREE.Shape();
bowShape.moveTo(-12, -12);
bowShape.lineTo(12, -8);
bowShape.lineTo(12, 8);
bowShape.lineTo(-12, 12);
bowShape.closePath();
const bowGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 18, bevelEnabled: false });
bowGeo.rotateY(Math.PI / 2);
const bow = new THREE.Mesh(bowGeo, hullMat);
bow.scale.set(1.45, 0.5, 1);
bow.position.set(73, 5, -9);
bow.castShadow = true;
ship.add(bow);

const deck = new THREE.Mesh(new THREE.BoxGeometry(118, 1.5, 22), deckMat);
deck.position.set(-2, 11, 0);
ship.add(deck);

// Cargo hatch covers
for (let i = 0; i < 6; i++) {
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(13, 2.2, 16), new THREE.MeshStandardMaterial({ color: 0x6a7774, roughness: .8 }));
  hatch.position.set(35 - i * 17, 13, 0);
  hatch.castShadow = true;
  ship.add(hatch);
}

// Accommodation / bridge at stern
const accom = new THREE.Mesh(new THREE.BoxGeometry(20, 22, 20), whiteMat);
accom.position.set(-49, 22, 0);
accom.castShadow = true;
ship.add(accom);
const bridge = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 22), whiteMat);
bridge.position.set(-47, 36, 0);
bridge.castShadow = true;
ship.add(bridge);
const funnel = new THREE.Mesh(new THREE.BoxGeometry(7, 14, 9), redMat);
funnel.position.set(-56, 44, 0);
funnel.castShadow = true;
ship.add(funnel);

// Forecastle deck and towing unit
const forecastle = new THREE.Mesh(new THREE.BoxGeometry(21, 4, 20), deckMat);
forecastle.position.set(51, 14, 0);
ship.add(forecastle);

const towingUnit = new THREE.Group();
towingUnit.position.set(53, 18.2, 0);
ship.add(towingUnit);

const unitBody = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xe7e8e9, roughness: .55 }));
unitBody.castShadow = true;
towingUnit.add(unitBody);
const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5, 24), new THREE.MeshStandardMaterial({ color: 0x555c62, roughness: .5 }));
drum.rotation.x = Math.PI / 2;
drum.position.set(0, 2.6, 0);
towingUnit.add(drum);

const towOrigin = new THREE.Vector3();
const kitePosition = new THREE.Vector3();

// Kite with arched paraglider-like shape
const kite = new THREE.Group();
scene.add(kite);
const kiteMat = new THREE.MeshStandardMaterial({ color: 0xd8322c, side: THREE.DoubleSide, roughness: .5 });
for (let i = -4; i <= 4; i++) {
  const span = 7.5;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.8, 7.5), kiteMat);
  panel.position.z = i * 6.4;
  panel.position.y = -0.42 * i * i;
  panel.rotation.x = 0.045 * i;
  panel.castShadow = true;
  kite.add(panel);
}
const kiteWhite = new THREE.Mesh(new THREE.BoxGeometry(8, 1.0, 7.3), whiteMat);
kiteWhite.position.set(0.2, 0.5, 0);
kiteWhite.scale.z = 0.72;
kite.add(kiteWhite);
kite.scale.set(1.4, 1.4, 1.4);

// Towing line
const lineMat = new THREE.LineBasicMaterial({ color: 0xe8eef2 });
const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const towingLine = new THREE.Line(lineGeo, lineMat);
scene.add(towingLine);

// Kite flight-path trail
const trailMax = 220;
const trailPoints = [];
const trailGeo = new THREE.BufferGeometry();
const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .38 });
const trail = new THREE.Line(trailGeo, trailMat);
scene.add(trail);

// Simple foam streaks flowing aft to make the fixed ship feel underway.
const foam = [];
for (let i = 0; i < 34; i++) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(6 + Math.random() * 8, .5 + Math.random() * 1.1),
    new THREE.MeshBasicMaterial({ color: 0xe6f8ff, transparent: true, opacity: .65, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(-15 - Math.random() * 100, -1.2, (Math.random() - .5) * 35);
  scene.add(m);
  foam.push(m);
}

const clock = new THREE.Clock();
let elapsed = 0;
const prevKite = new THREE.Vector3();

function updateOcean(t) {
  const p = oceanGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = oceanBase[i * 3];
    const y = oceanBase[i * 3 + 1];
    const wave = 1.25 * Math.sin(x * 0.045 + t * 2.0)
               + 0.65 * Math.sin(y * 0.075 + t * 1.45)
               + 0.32 * Math.sin((x + y) * 0.095 + t * 2.5);
    p.setZ(i, wave);
  }
  p.needsUpdate = true;
  oceanGeo.computeVertexNormals();
}

function updateKite(t) {
  // Figure-eight flight centered forward and above the bow.
  const a = t * 0.55;
  const forwardCenter = 175;
  const lateralAmp = 70;
  const verticalAmp = 42;

  kitePosition.set(
    forwardCenter + 18 * Math.cos(a * 0.7),
    108 + verticalAmp * Math.sin(2 * a),
    lateralAmp * Math.sin(a)
  );
  kite.position.copy(kitePosition);

  // Orient the kite roughly along its instantaneous flight vector.
  if (prevKite.lengthSq() > 0) {
    const tangent = kitePosition.clone().sub(prevKite).normalize();
    kite.rotation.y = Math.atan2(-tangent.z, tangent.x);
    kite.rotation.z = THREE.MathUtils.clamp(-tangent.z * 0.65, -0.5, 0.5);
    kite.rotation.x = THREE.MathUtils.clamp(tangent.y * 0.35, -0.28, 0.28);
  }
  prevKite.copy(kitePosition);

  towingUnit.getWorldPosition(towOrigin);

  const midpoint = towOrigin.clone().lerp(kitePosition, 0.5);
  midpoint.y -= 3.5; // slight sag but visually taut
  const pts = [towOrigin.clone(), midpoint, kitePosition.clone()];
  lineGeo.setFromPoints(pts);

  if (trailPoints.length === 0 || trailPoints[trailPoints.length - 1].distanceToSquared(kitePosition) > 2.5) {
    trailPoints.push(kitePosition.clone());
    if (trailPoints.length > trailMax) trailPoints.shift();
    trailGeo.setFromPoints(trailPoints);
  }

  const lineLength = towOrigin.distanceTo(kitePosition);
  const altitude = kitePosition.y - towOrigin.y;
  const force = 82 + 18 * Math.abs(Math.sin(a * 2)) + 7 * Math.abs(Math.cos(a));
  altitudeEl.textContent = `${Math.round(altitude)} m`;
  lineLengthEl.textContent = `${Math.round(lineLength)} m`;
  forceEl.textContent = `${Math.round(force)} kN`;
}

function updateFoam(dt) {
  for (const m of foam) {
    m.position.x -= 24 * dt;
    if (m.position.x < -130) {
      m.position.x = 62 + Math.random() * 20;
      m.position.z = (Math.random() - .5) * 34;
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  elapsed += dt;

  updateOcean(elapsed);
  updateKite(elapsed);
  updateFoam(dt);

  ship.rotation.x = 0.008 * Math.sin(elapsed * 0.65);
  ship.rotation.z = 0.012 * Math.sin(elapsed * 0.47);

  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

animate();
