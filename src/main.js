import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const app = document.getElementById('app');
const altitudeEl = document.getElementById('altitude');
const lineLengthEl = document.getElementById('lineLength');
const elevationEl = document.getElementById('elevation');
const forceEl = document.getElementById('force');

const SHIP = { loa: 299.99, lpp: 296.00, breadth: 50.00, depth: 25.00 };
const KITE = { area: 600, cableLength: 600, elevationDeg: 30 };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d8ff);
scene.fog = new THREE.Fog(0xa9d8ff, 700, 1800);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 2400);
camera.position.set(-330, 190, 390);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(80, 105, 0);
controls.minDistance = 140;
controls.maxDistance = 1300;

scene.add(new THREE.HemisphereLight(0xffffff, 0x4e6472, 2.3));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(-250, 500, 260);
sun.castShadow = true;
scene.add(sun);

// Ocean
const oceanGeo = new THREE.PlaneGeometry(2200, 1600, 150, 110);
const oceanMat = new THREE.MeshStandardMaterial({
  color: 0x17688e, roughness: 0.34, metalness: 0.06, side: THREE.DoubleSide
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = 0;
scene.add(ocean);
const oceanBase = oceanGeo.attributes.position.array.slice();

// Ship
const ship = new THREE.Group();
scene.add(ship);

const hullMat = new THREE.MeshStandardMaterial({ color: 0x202a30, roughness: 0.73 });
const lowerHullMat = new THREE.MeshStandardMaterial({ color: 0x8b2e27, roughness: 0.78 });
const deckMat = new THREE.MeshStandardMaterial({ color: 0x858d90, roughness: 0.82 });
const hatchMat = new THREE.MeshStandardMaterial({ color: 0x6b7773, roughness: 0.82 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0f3f5, roughness: 0.64 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xc8342d, roughness: 0.6 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x485159, roughness: 0.7 });

function taperedPrism(x0, x1, w0, w1, y0, y1, mat) {
  const v = new Float32Array([
    x0,y0,-w0, x0,y0,w0, x0,y1,-w0, x0,y1,w0,
    x1,y0,-w1, x1,y0,w1, x1,y1,-w1, x1,y1,w1
  ]);
  const idx = [
    0,4,6, 0,6,2, 1,3,7, 1,7,5, 2,6,7, 2,7,3,
    0,1,5, 0,5,4, 0,2,3, 0,3,1, 4,5,7, 4,7,6
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  return mesh;
}

// Main parallel body + integrated bow/stern.
// This removes the old detached object in front of the ship.
const mainHull = new THREE.Mesh(new THREE.BoxGeometry(260, SHIP.depth, SHIP.breadth), hullMat);
mainHull.position.set(-2, 2.5, 0);
mainHull.castShadow = true;
ship.add(mainHull);
ship.add(taperedPrism(128, 150, 25, 1.5, -10, 15, hullMat));
ship.add(taperedPrism(-150, -132, 19, 25, -10, 15, hullMat));

const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(262, 5.5, 48), lowerHullMat);
lowerHull.position.set(-2, -7.2, 0);
ship.add(lowerHull);

const deck = new THREE.Mesh(new THREE.BoxGeometry(264, 1.3, 48), deckMat);
deck.position.set(-1, 15.6, 0);
ship.add(deck);

const forecastle = new THREE.Mesh(new THREE.BoxGeometry(31, 3.2, 44), deckMat);
forecastle.position.set(126, 17.5, 0);
ship.add(forecastle);

// 7 hatch covers
for (const x of [82, 49, 16, -17, -50, -83, -110]) {
  const coaming = new THREE.Mesh(new THREE.BoxGeometry(27, 1.5, 39), darkMat);
  coaming.position.set(x, 16.3, 0);
  ship.add(coaming);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(25, 2.1, 37), hatchMat);
  hatch.position.set(x, 17.4, 0);
  hatch.castShadow = true;
  ship.add(hatch);
}

// Accommodation
const accom = new THREE.Mesh(new THREE.BoxGeometry(27, 27, 40), whiteMat);
accom.position.set(-129, 29.5, 0);
ship.add(accom);
const bridge = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 44), whiteMat);
bridge.position.set(-126, 46, 0);
ship.add(bridge);
const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(23, 4, 32), whiteMat);
bridgeTop.position.set(-126, 51.5, 0);
ship.add(bridgeTop);
const funnel = new THREE.Mesh(new THREE.BoxGeometry(10, 18, 14), redMat);
funnel.position.set(-139, 55, 0);
ship.add(funnel);

// Towing unit ON forecastle
const towingUnit = new THREE.Group();
towingUnit.position.set(124, 22, 0);
ship.add(towingUnit);
const unitBody = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 7), whiteMat);
unitBody.position.y = 2.5;
towingUnit.add(unitBody);
const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 6, 28), darkMat);
drum.rotation.x = Math.PI / 2;
drum.position.set(0, 6.2, 0);
towingUnit.add(drum);

const towOrigin = new THREE.Vector3();
const kitePosition = new THREE.Vector3();
const prevKite = new THREE.Vector3();

// 600 m2 kite: approx 30 m span x 20 m chord
const kite = new THREE.Group();
scene.add(kite);
const kiteRed = new THREE.MeshStandardMaterial({ color: 0xd52f29, side: THREE.DoubleSide, roughness: 0.48 });
const kiteWhite = new THREE.MeshStandardMaterial({ color: 0xf5f6f7, side: THREE.DoubleSide, roughness: 0.5 });
const spanTotal = 30, chord = 20, cells = 12, cellSpan = spanTotal / cells;
for (let i = 0; i < cells; i++) {
  const z = -spanTotal/2 + cellSpan/2 + i*cellSpan;
  const n = z / (spanTotal/2);
  const y = 5 - 5*n*n;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(chord * (0.92 + 0.08*Math.cos(n*Math.PI/2)), 0.75, cellSpan*0.97),
    (i === 5 || i === 6) ? kiteWhite : kiteRed
  );
  panel.position.set(0, y, z);
  panel.rotation.x = -0.20*n;
  kite.add(panel);
}

// Tether
const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const towingLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2f5f6 }));
scene.add(towingLine);

// Flight trail
const trailPoints = [];
const trailGeo = new THREE.BufferGeometry();
const trail = new THREE.Line(
  trailGeo,
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38 })
);
scene.add(trail);

// Wake only aft
const foam = [];
for (let i = 0; i < 55; i++) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(9 + Math.random()*16, 0.7 + Math.random()*1.5),
    new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI/2;
  m.position.set(-35 - Math.random()*230, 0.25, (Math.random()-0.5)*62);
  scene.add(m);
  foam.push(m);
}

const clock = new THREE.Clock();
let elapsed = 0;

function updateOcean(t) {
  const p = oceanGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = oceanBase[i*3], y = oceanBase[i*3+1];
    p.setZ(i,
      1.65*Math.sin(x*0.025 + t*1.55) +
      0.85*Math.sin(y*0.040 + t*1.15) +
      0.40*Math.sin((x+y)*0.060 + t*1.9)
    );
  }
  p.needsUpdate = true;
  oceanGeo.computeVertexNormals();
}

function updateKite(t) {
  towingUnit.getWorldPosition(towOrigin);

  // Figure-eight around nominal 30 deg elevation.
  // Tether remains exactly 600 m at every frame.
  const a = t * 0.48;
  const azDeg = 12 * Math.sin(a);
  const elDeg = KITE.elevationDeg + 5.5 * Math.sin(2*a);
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);

  const horizontal = KITE.cableLength * Math.cos(el);
  const vertical = KITE.cableLength * Math.sin(el);

  kitePosition.set(
    towOrigin.x + horizontal*Math.cos(az),
    towOrigin.y + vertical,
    towOrigin.z + horizontal*Math.sin(az)
  );
  kite.position.copy(kitePosition);

  if (prevKite.lengthSq() > 0) {
    const tangent = kitePosition.clone().sub(prevKite).normalize();
    kite.rotation.y = Math.atan2(-tangent.z, tangent.x);
    kite.rotation.z = THREE.MathUtils.clamp(-tangent.z*0.85, -0.62, 0.62);
    kite.rotation.x = THREE.MathUtils.clamp(tangent.y*0.45, -0.34, 0.34);
  }
  prevKite.copy(kitePosition);

  lineGeo.setFromPoints([towOrigin.clone(), kitePosition.clone()]);

  if (!trailPoints.length || trailPoints.at(-1).distanceToSquared(kitePosition) > 8) {
    trailPoints.push(kitePosition.clone());
    if (trailPoints.length > 300) trailPoints.shift();
    trailGeo.setFromPoints(trailPoints);
  }

  altitudeEl.textContent = `${Math.round(vertical)} m`;
  lineLengthEl.textContent = `${KITE.cableLength} m`;
  elevationEl.textContent = `${elDeg.toFixed(1)}°`;
  const force = 90 + 18*Math.abs(Math.sin(2*a)) + 7*Math.abs(Math.sin(a));
  forceEl.textContent = `${Math.round(force)} kN`;
}

function updateFoam(dt) {
  for (const m of foam) {
    m.position.x -= 34*dt;
    if (m.position.x < -420) {
      m.position.x = -50 + Math.random()*165;
      m.position.z = (Math.random()-0.5)*65;
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

  // Fixed position; only tiny pitch/roll.
  ship.rotation.x = 0.004*Math.sin(elapsed*0.65);
  ship.rotation.z = 0.007*Math.sin(elapsed*0.47);

  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

animate();
