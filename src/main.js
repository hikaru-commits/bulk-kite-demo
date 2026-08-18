import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const altitudeEl=$('altitude'), lineLengthEl=$('lineLength'), elevationEl=$('elevation'),
forceEl=$('force'), statusEl=$('status'), kiteSpeedEl=$('kiteSpeed'),
breakTimeEl=$('breakTime'), impactSpeedEl=$('impactSpeed'), impactPositionEl=$('impactPosition'),
breakBtn=$('breakBtn'), resetBtn=$('resetBtn'), windSlider=$('windSlider'),
windValue=$('windValue'), eventBanner=$('eventBanner'),
shipSpeedSlider=$('shipSpeedSlider'), shipSpeedValue=$('shipSpeedValue'),
relAheadEl=$('relAhead'), relSideEl=$('relSide'), relDistanceEl=$('relDistance'),
windAngleSlider=$('windAngleSlider'), windAngleValue=$('windAngleValue'),
breakPositionSlider=$('breakPositionSlider'), breakPositionValue=$('breakPositionValue'),
kiteSideLineEl=$('kiteSideLine'), shipSideLineEl=$('shipSideLine'), lineMassEl=$('lineMass'),
waterFlowValue=$('waterFlowValue');

const SHIP={loa:299.99,lpp:296,breadth:50,depth:25};
const KITE={area:600,cableLength:600,elevationDeg:30,mass:650,CLmax:1.05,CD0:.22,inducedK:.16,waterCd:1.35};
const AIR_RHO=1.225, WATER_RHO=1025, G=9.81;

const STATES={TOWING:'TOWING',AIRBORNE:'AIRBORNE',IMPACT:'IMPACT',WATER:'WATER',DRIFT:'DRIFT'};
let state=STATES.TOWING;
let breakElapsed=0, simTime=0, windKnots=18, windAngleDeg=180, shipSpeedKnots=12, impactRecorded=false, waterEntryTime=0;

// Broken-rope reduced-order model.
// Replace provisional assumptions with actual vendor data when available.
const ROPE = {
  fullLength: KITE.cableLength,
  diameter: 0.030,          // m, provisional
  linearMass: 0.62,         // kg/m, provisional
  CdCylinder: 1.15,
  nodesMax: 41,
  waterCd: 3.2,
  // Simulation setting requested here: once submerged, line is treated as
  // negatively buoyant and settles instead of bouncing at the surface.
  submergedDownAccel: 1.25,   // m/s² downward
  surfaceEntryDamping: 0.18,

  // Numerical/visual sink lock:
  // after a node first enters the water, its permitted upper level moves
  // downward with time. PBD constraints may pull horizontally/vertically,
  // but cannot throw that node back above the sea surface.
  sinkLockRate: 0.55,          // m/s minimum settling envelope
  sinkLockMaxDepth: 35.0       // m
};

let breakPositionM = 300;      // m from ship terminal toward kite
let kiteSideLengthM = ROPE.fullLength * 0.5;
let shipSideLengthM = ROPE.fullLength * 0.5;
let ropeNodesActive = ROPE.nodesMax;
let ropeSegmentLength = ROPE.fullLength / (ROPE.nodesMax - 1);
let ropeKiteSideMass = ROPE.fullLength * 0.5 * ROPE.linearMass;

// WORLD FRAME:
// +X = ship's heading / advance direction
// +Y = upward
// +Z = starboard
//
// DISPLAY FRAME:
// Ship is fixed at origin.
// Displayed kite position = worldKitePosition - worldShipPosition.

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xa9d8ff);
scene.fog=new THREE.Fog(0xa9d8ff,700,1900);

const camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,2600);
camera.position.set(-330,190,390);

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
document.getElementById('app').appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.target.set(80,105,0);
controls.minDistance=140;
controls.maxDistance=1450;

scene.add(new THREE.HemisphereLight(0xffffff,0x4e6472,2.3));
const sun=new THREE.DirectionalLight(0xffffff,2.5);
sun.position.set(-250,500,260);
sun.castShadow=true;
scene.add(sun);

// Ocean
const oceanGeo=new THREE.PlaneGeometry(2400,1800,155,115);
const oceanMat=new THREE.MeshStandardMaterial({color:0x17688e,roughness:.34,metalness:.06,side:THREE.DoubleSide});
const ocean=new THREE.Mesh(oceanGeo,oceanMat);
ocean.rotation.x=-Math.PI/2;
scene.add(ocean);
const oceanBase=oceanGeo.attributes.position.array.slice();

// Ship visual geometry fixed in display frame.
const ship=new THREE.Group();
scene.add(ship);

const hullMat=new THREE.MeshStandardMaterial({color:0x202a30,roughness:.73});
const lowerHullMat=new THREE.MeshStandardMaterial({color:0x8b2e27,roughness:.78});
const deckMat=new THREE.MeshStandardMaterial({color:0x858d90,roughness:.82});
const hatchMat=new THREE.MeshStandardMaterial({color:0x6b7773,roughness:.82});
const whiteMat=new THREE.MeshStandardMaterial({color:0xf0f3f5,roughness:.64});
const redMat=new THREE.MeshStandardMaterial({color:0xc8342d,roughness:.6});
const darkMat=new THREE.MeshStandardMaterial({color:0x485159,roughness:.7});

function taperedPrism(x0,x1,w0,w1,y0,y1,mat){
  const v=new Float32Array([
    x0,y0,-w0,x0,y0,w0,x0,y1,-w0,x0,y1,w0,
    x1,y0,-w1,x1,y0,w1,x1,y1,-w1,x1,y1,w1
  ]);
  const idx=[0,4,6,0,6,2,1,3,7,1,7,5,2,6,7,2,7,3,0,1,5,0,5,4,0,2,3,0,3,1,4,5,7,4,7,6];
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(v,3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);
  m.castShadow=true;
  return m;
}

const mainHull=new THREE.Mesh(new THREE.BoxGeometry(260,SHIP.depth,SHIP.breadth),hullMat);
mainHull.position.set(-2,2.5,0); ship.add(mainHull);
ship.add(taperedPrism(128,150,25,1.5,-10,15,hullMat));
ship.add(taperedPrism(-150,-132,19,25,-10,15,hullMat));
const lowerHull=new THREE.Mesh(new THREE.BoxGeometry(262,5.5,48),lowerHullMat);
lowerHull.position.set(-2,-7.2,0); ship.add(lowerHull);
const deck=new THREE.Mesh(new THREE.BoxGeometry(264,1.3,48),deckMat);
deck.position.set(-1,15.6,0); ship.add(deck);
const forecastle=new THREE.Mesh(new THREE.BoxGeometry(31,3.2,44),deckMat);
forecastle.position.set(126,17.5,0); ship.add(forecastle);

for(const x of [82,49,16,-17,-50,-83,-110]){
  const c=new THREE.Mesh(new THREE.BoxGeometry(27,1.5,39),darkMat); c.position.set(x,16.3,0); ship.add(c);
  const h=new THREE.Mesh(new THREE.BoxGeometry(25,2.1,37),hatchMat); h.position.set(x,17.4,0); ship.add(h);
}

const accom=new THREE.Mesh(new THREE.BoxGeometry(27,27,40),whiteMat);
accom.position.set(-129,29.5,0); ship.add(accom);
const bridge=new THREE.Mesh(new THREE.BoxGeometry(30,7,44),whiteMat);
bridge.position.set(-126,46,0); ship.add(bridge);
const bridgeTop=new THREE.Mesh(new THREE.BoxGeometry(23,4,32),whiteMat);
bridgeTop.position.set(-126,51.5,0); ship.add(bridgeTop);
const funnel=new THREE.Mesh(new THREE.BoxGeometry(10,18,14),redMat);
funnel.position.set(-139,55,0); ship.add(funnel);

// Towing unit fixed to ship visual.
const towingUnit=new THREE.Group();
towingUnit.position.set(124,22,0);
ship.add(towingUnit);
const unitBody=new THREE.Mesh(new THREE.BoxGeometry(8,6,7),whiteMat);
unitBody.position.y=2.5; towingUnit.add(unitBody);
const drum=new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.15,6,28),darkMat);
drum.rotation.x=Math.PI/2; drum.position.set(0,6.2,0); towingUnit.add(drum);

// Display-space towing origin.
const towOriginDisplay=new THREE.Vector3();

// World-space state.
const shipWorldPos=new THREE.Vector3();
const kiteWorldPos=new THREE.Vector3();
const kiteWorldVel=new THREE.Vector3();
const lastTowingWorldPos=new THREE.Vector3();
const lastTowingWorldVel=new THREE.Vector3();

// Kite visual.
const kite=new THREE.Group(); scene.add(kite);
const kiteRed=new THREE.MeshStandardMaterial({color:0xd52f29,side:THREE.DoubleSide,roughness:.48});
const kiteWhite=new THREE.MeshStandardMaterial({color:0xf5f6f7,side:THREE.DoubleSide,roughness:.5});
const spanTotal=30,chord=20,cells=12,cellSpan=spanTotal/cells,kitePanels=[];
for(let i=0;i<cells;i++){
  const z=-spanTotal/2+cellSpan/2+i*cellSpan,n=z/(spanTotal/2),y=5-5*n*n;
  const p=new THREE.Mesh(
    new THREE.BoxGeometry(chord*(.92+.08*Math.cos(n*Math.PI/2)),.75,cellSpan*.97),
    (i===5||i===6)?kiteWhite:kiteRed
  );
  p.position.set(0,y,z); p.rotation.x=-.20*n; kite.add(p); kitePanels.push(p);
}

// Tether visuals in display frame.
const tetherGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const tetherLine=new THREE.Line(tetherGeo,new THREE.LineBasicMaterial({color:0xf2f5f6}));
scene.add(tetherLine);

const shipCableGeo=new THREE.BufferGeometry();
const shipCable=new THREE.Line(
  shipCableGeo,
  new THREE.LineBasicMaterial({
    color:0xffffff,
    transparent:true,
    opacity:0.98,
    depthTest:false,
    depthWrite:false
  })
);
shipCable.frustumCulled=false;
shipCable.renderOrder=100;
shipCable.visible=false;
scene.add(shipCable);

// The kite-side broken line is a particle rope, not a decorative line.
// This lets gravity pull the Dyneema line BELOW the kite after failure.
const kiteCableGeo=new THREE.BufferGeometry();
const kiteCable=new THREE.Line(
  kiteCableGeo,
  new THREE.LineBasicMaterial({
    color:0xf4f7f8,
    transparent:true,
    opacity:0.98,
    depthTest:false,
    depthWrite:false
  })
);
kiteCable.frustumCulled=false;
kiteCable.renderOrder=100;
kiteCable.visible=false;
scene.add(kiteCable);

const ropePos=[];
const ropePrev=[];
const shipRopePos=[];
const shipRopePrev=[];

// Once a rope node enters the sea it stays in the WATER state.
// This avoids the air/water mode flipping that caused surface bouncing.
const ropeWet=[];
const ropeWetTime=[];
const shipRopeWet=[];
const shipRopeWetTime=[];

let shipRopeNodesActive=2;
let shipRopeSegmentLength=0;

for(let i=0;i<ROPE.nodesMax;i++){
  ropePos.push(new THREE.Vector3());
  ropePrev.push(new THREE.Vector3());
  shipRopePos.push(new THREE.Vector3());
  shipRopePrev.push(new THREE.Vector3());

  ropeWet.push(false);
  ropeWetTime.push(0);
  shipRopeWet.push(false);
  shipRopeWetTime.push(0);
}

// v7 robust rope representation:
// Each broken half is represented physically by its free end.
// The rendered rope is a smooth sagging curve from attached end to free end.
// This avoids PBD fold-back / triangular artifacts.
const shipFreeEndWorld = new THREE.Vector3();
const shipFreeEndVel = new THREE.Vector3();
const kiteFreeEndWorld = new THREE.Vector3();
const kiteFreeEndVel = new THREE.Vector3();

let shipFreeWet = false;
let kiteFreeWet = false;
let shipFreeWetTime = 0;
let kiteFreeWetTime = 0;

// Progressive water-entry state.
// This represents how much of each broken rope half has actually entered water.
// It prevents the air/water transition point from remaining visually fixed.
let shipWetLengthM = 0;
let kiteWetLengthM = 0;



// Trail in display frame.
const trailPoints=[], trailGeo=new THREE.BufferGeometry();
const trail=new THREE.Line(
  trailGeo,
  new THREE.LineBasicMaterial({
    color:0x6fd7ff,
    transparent:true,
    opacity:.22
  })
);
scene.add(trail);
trail.visible=true;

const impactRing=new THREE.Mesh(
  new THREE.RingGeometry(8,11,48),
  new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,side:THREE.DoubleSide})
);
impactRing.rotation.x=-Math.PI/2; impactRing.position.y=.4; scene.add(impactRing);



// Wind direction visualization in the ship-fixed display frame.
const windArrow = new THREE.ArrowHelper(
  new THREE.Vector3(1,0,0),
  new THREE.Vector3(-40,115,-70),
  95,
  0xffef8a,
  16,
  8
);
scene.add(windArrow);

function updateWindArrow(){
  const w = trueWindWorld();
  const dir = w.lengthSq() > 0 ? w.clone().normalize() : new THREE.Vector3(1,0,0);
  windArrow.setDirection(dir);
  windArrow.setLength(75 + windKnots*1.5, 16, 8);
}

function updateBreakConfiguration(){
  breakPositionM = Number(breakPositionSlider.value);
  shipSideLengthM = THREE.MathUtils.clamp(breakPositionM, 0, ROPE.fullLength);
  kiteSideLengthM = ROPE.fullLength - shipSideLengthM;
  ropeKiteSideMass = kiteSideLengthM * ROPE.linearMass;

  ropeNodesActive = Math.max(2, Math.min(ROPE.nodesMax, Math.round((kiteSideLengthM / ROPE.fullLength) * (ROPE.nodesMax - 1)) + 1));
  ropeSegmentLength = kiteSideLengthM / Math.max(ropeNodesActive - 1, 1);

  shipRopeNodesActive = Math.max(
    2,
    Math.min(
      ROPE.nodesMax,
      Math.round((shipSideLengthM / ROPE.fullLength) * (ROPE.nodesMax - 1)) + 1
    )
  );
  shipRopeSegmentLength = shipSideLengthM / Math.max(shipRopeNodesActive - 1, 1);

  breakPositionValue.textContent = `${breakPositionM.toFixed(0)} m from ship`;
  kiteSideLineEl.textContent = `${kiteSideLengthM.toFixed(0)} m`;
  shipSideLineEl.textContent = `${shipSideLengthM.toFixed(0)} m`;
  lineMassEl.textContent = `${ropeKiteSideMass.toFixed(0)} kg`;
}

// Wake particles emphasize ship-fixed display frame.
const foam=[];
for(let i=0;i<55;i++){
  const m=new THREE.Mesh(
    new THREE.PlaneGeometry(9+Math.random()*16,.7+Math.random()*1.5),
    new THREE.MeshBasicMaterial({color:0xe8f8ff,transparent:true,opacity:.6,side:THREE.DoubleSide})
  );
  m.rotation.x=-Math.PI/2;
  m.position.set(-35-Math.random()*230,.25,(Math.random()-.5)*62);
  scene.add(m); foam.push(m);
}

function knotsToMs(kn){return kn*.514444;}

function shipVelocityWorld(){
  return new THREE.Vector3(knotsToMs(shipSpeedKnots),0,0);
}

// In the ship-fixed visual frame, still water appears to flow aft at ship speed.
// This is used for the submerged rope shape and free-end drift.
function waterVelocityRelativeToShip(){
  return new THREE.Vector3(-knotsToMs(shipSpeedKnots),0,0);
}


// True wind in earth/world frame.
// True Wind Angle (TWA) is the direction the wind COMES FROM,
// measured clockwise from the bow:
// 0° = from bow (head wind)
// 90° = from starboard
// 180° = from astern (following wind)
// 270° = from port
function trueWindWorld(){
  const s = knotsToMs(windKnots);
  const a = THREE.MathUtils.degToRad(windAngleDeg);
  return new THREE.Vector3(
    -s * Math.cos(a),
    0,
    -s * Math.sin(a)
  );
}

function displayPositionFromWorld(worldPos){
  return worldPos.clone().sub(shipWorldPos);
}

function setStatus(text,cls){
  statusEl.textContent=text;
  statusEl.className=cls;
}

function flash(text){
  eventBanner.textContent=text;
  eventBanner.classList.remove('hidden');
  setTimeout(()=>eventBanner.classList.add('hidden'),1500);
}

function updateRelativeHud(){
  const rel=displayPositionFromWorld(kiteWorldPos);
  const x=rel.x;
  const z=rel.z;
  relAheadEl.textContent = `${Math.abs(x).toFixed(0)} m ${x>=0?'AHEAD':'ASTERN'}`;
  relSideEl.textContent = `${Math.abs(z).toFixed(0)} m ${z>=0?'STBD':'PORT'}`;
  relDistanceEl.textContent = `${Math.sqrt(x*x+z*z).toFixed(0)} m`;
}

function updateOcean(t,dt){
  // Base wave animation.
  const p=oceanGeo.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=oceanBase[i*3], y=oceanBase[i*3+1];
    p.setZ(i,
      1.65*Math.sin(x*.025+t*1.55)+
      .85*Math.sin(y*.040+t*1.15)+
      .40*Math.sin((x+y)*.060+t*1.9)
    );
  }
  p.needsUpdate=true;
  oceanGeo.computeVertexNormals();

  // Because the display frame follows the ship, sea pattern moves aft.
  ocean.position.x -= knotsToMs(shipSpeedKnots)*dt;
  if(ocean.position.x < -150) ocean.position.x += 150;
}

function updateNormalTowing(t,dt){
  towingUnit.getWorldPosition(towOriginDisplay);

  // Ship advances in the world even though visual ship stays fixed.
  const shipVel=shipVelocityWorld();

  const a=t*.48;
  const azDeg=12*Math.sin(a);
  const elDeg=KITE.elevationDeg+5.5*Math.sin(2*a);
  const az=THREE.MathUtils.degToRad(azDeg);
  const el=THREE.MathUtils.degToRad(elDeg);

  const horizontal=KITE.cableLength*Math.cos(el);
  const vertical=KITE.cableLength*Math.sin(el);

  // Kite position is defined relative to the advancing ship.
  kiteWorldPos.set(
    shipWorldPos.x + towOriginDisplay.x + horizontal*Math.cos(az),
    towOriginDisplay.y + vertical,
    shipWorldPos.z + towOriginDisplay.z + horizontal*Math.sin(az)
  );

  if(lastTowingWorldPos.lengthSq()>0 && dt>0){
    lastTowingWorldVel.copy(kiteWorldPos).sub(lastTowingWorldPos).divideScalar(dt);
  }
  lastTowingWorldPos.copy(kiteWorldPos);

  const displayPos=displayPositionFromWorld(kiteWorldPos);
  kite.position.copy(displayPos);

  const tangent=lastTowingWorldVel.clone().sub(shipVel);
  if(tangent.lengthSq()>.01){
    tangent.normalize();
    kite.rotation.y=Math.atan2(-tangent.z,tangent.x);
    kite.rotation.z=THREE.MathUtils.clamp(-tangent.z*.85,-.62,.62);
    kite.rotation.x=THREE.MathUtils.clamp(tangent.y*.45,-.34,.34);
  }

  tetherGeo.setFromPoints([towOriginDisplay.clone(),displayPos.clone()]);
  tetherLine.visible=true; shipCable.visible=false; kiteCable.visible=false;

  altitudeEl.textContent=`${Math.max(0,Math.round(displayPos.y))} m`;
  lineLengthEl.textContent='600 m';
  kiteSideLineEl.textContent = `${kiteSideLengthM.toFixed(0)} m`;
  shipSideLineEl.textContent = `${shipSideLengthM.toFixed(0)} m`;
  lineMassEl.textContent = `${ropeKiteSideMass.toFixed(0)} kg`;
  elevationEl.textContent=`${elDeg.toFixed(1)}°`;
  kiteSpeedEl.textContent=`${lastTowingWorldVel.length().toFixed(1)} m/s`;
  forceEl.textContent=`${Math.round(90+18*Math.abs(Math.sin(2*a))+7*Math.abs(Math.sin(a)))} kN`;
  updateRelativeHud();
}

function breakTether(){
  if(state!==STATES.TOWING)return;

  state=STATES.AIRBORNE;
  breakElapsed=0;
  impactRecorded=false;

  // Critical correction:
  // Preserve the actual WORLD velocity of the kite at failure.
  kiteWorldVel.copy(lastTowingWorldVel);
  if(kiteWorldVel.length()>65) kiteWorldVel.setLength(65);

  tetherLine.visible=false;

  // After failure show ONLY the two physical rope halves.
  // The flight-path trail is visual aid only and otherwise looks like a third rope.
  trail.visible=false;

  // Actual visibility of each rope half is decided by updateBrokenRope()
  // according to the selected break position.
  shipCable.visible=false;
  kiteCable.visible=false;
  breakBtn.disabled=true;

  // Initialize only the kite-side remaining line according to break position.
  updateBreakConfiguration();

  towingUnit.getWorldPosition(towOriginDisplay);
  const towOriginWorld = shipWorldPos.clone().add(towOriginDisplay);
  const shipVel = shipVelocityWorld();
  const breakFraction = breakPositionM / ROPE.fullLength;
  const breakPointWorld = towOriginWorld.clone().lerp(kiteWorldPos, breakFraction);

  for(let i=0;i<ropeNodesActive;i++){
    const f=i/Math.max(ropeNodesActive-1,1);
    ropePos[i].copy(kiteWorldPos).lerp(breakPointWorld,f);
    const initVel=kiteWorldVel.clone().lerp(shipVel,f);
    ropePrev[i].copy(ropePos[i]).addScaledVector(initVel,-1/60);
    ropeWet[i]=ropePos[i].y<=0;
    ropeWetTime[i]=0;
  }

  // Ship-side half: node 0 stays attached to the towing unit and the last
  // node is the free broken end. This fixes mid-line breaks: both halves
  // originate from the same physical break point.
  for(let i=0;i<shipRopeNodesActive;i++){
    const f=i/Math.max(shipRopeNodesActive-1,1);
    shipRopePos[i].copy(towOriginWorld).lerp(breakPointWorld,f);
    const initVel=shipVel.clone().lerp(kiteWorldVel,f);
    shipRopePrev[i].copy(shipRopePos[i]).addScaledVector(initVel,-1/60);
    shipRopeWet[i]=shipRopePos[i].y<=0;
    shipRopeWetTime[i]=0;
  }

  // Both physical free ends start at exactly the same break point.
  const breakVel = shipVel.clone().lerp(
    kiteWorldVel,
    THREE.MathUtils.clamp(breakFraction,0,1)
  );

  shipFreeEndWorld.copy(breakPointWorld);
  shipFreeEndVel.copy(breakVel);
  kiteFreeEndWorld.copy(breakPointWorld);
  kiteFreeEndVel.copy(breakVel);

  shipFreeWet = breakPointWorld.y <= 0;
  kiteFreeWet = breakPointWorld.y <= 0;
  shipFreeWetTime = 0;
  kiteFreeWetTime = 0;
  shipWetLengthM = shipFreeWet ? Math.min(shipSideLengthM, 2) : 0;
  kiteWetLengthM = kiteFreeWet ? Math.min(kiteSideLengthM, 2) : 0;



  // Remove stale data from nodes that are not active for this break case.
  for(let i=ropeNodesActive;i<ROPE.nodesMax;i++){
    ropePos[i].copy(kiteWorldPos);
    ropePrev[i].copy(kiteWorldPos);
  }
  for(let i=shipRopeNodesActive;i<ROPE.nodesMax;i++){
    shipRopePos[i].copy(towOriginWorld);
    shipRopePrev[i].copy(towOriginWorld);
  }


  impactSpeedEl.textContent='--';
  impactPositionEl.textContent='--';

  console.info(
    `[TETHER BREAK] ${breakPositionM.toFixed(0)} m from ship | ` +
    `ship-side ${shipSideLengthM.toFixed(0)} m | ` +
    `kite-side ${kiteSideLengthM.toFixed(0)} m`
  );
  setStatus('UNCONTROLLED FLIGHT','status-flight');
  flash('TETHER BREAK');
}

function aeroForces(){
  // Aerodynamics use true wind minus kite WORLD velocity.
  // Ship speed is already represented separately in world motion.
  const relWind=trueWindWorld().sub(kiteWorldVel);
  const V=Math.max(relWind.length(),.1);
  const relDir=relWind.clone().normalize();

  const horiz=Math.max(Math.sqrt(relWind.x**2+relWind.z**2),.1);
  const aoa=THREE.MathUtils.clamp(
    Math.atan2(-relWind.y,horiz),
    THREE.MathUtils.degToRad(-8),
    THREE.MathUtils.degToRad(24)
  );

  let CL=.22+.055*THREE.MathUtils.radToDeg(aoa);
  CL=THREE.MathUtils.clamp(CL,.05,KITE.CLmax);
  const CD=KITE.CD0+KITE.inducedK*CL*CL;
  const q=.5*AIR_RHO*V*V;

  const drag=relDir.clone().multiplyScalar(q*KITE.area*CD);

  const spanAxis=new THREE.Vector3(0,0,1);
  let liftDir=new THREE.Vector3().crossVectors(relDir,spanAxis);
  if(liftDir.lengthSq()<.001) liftDir.set(0,1,0);
  liftDir.cross(relDir).normalize();
  if(liftDir.y<0) liftDir.multiplyScalar(-1);

  const lift=liftDir.multiplyScalar(q*KITE.area*CL);
  return {lift,drag};
}

function ropeNodeVelocity(pos,prev,i,dt){
  return pos[i].clone().sub(prev[i]).divideScalar(Math.max(dt,1e-4));
}

function integrateBrokenFreeEnd(anchorWorld,freePos,freeVel,lineLength,dt,wind,wetState){
  if(lineLength<=0.5){
    return wetState;
  }

  const substeps=6;
  const h=dt/substeps;

  for(let s=0;s<substeps;s++){
    if(!wetState.wet && freePos.y<=0){
      wetState.wet=true;
      wetState.time=0;
      freePos.y=-0.08;
      if(freeVel.y>0) freeVel.y=0;
      freeVel.multiplyScalar(0.22);
    }

    const accel=new THREE.Vector3();

    if(!wetState.wet){
      // AIR: gravity + aerodynamic drag.
      accel.y=-G;

      const relAir=wind.clone().sub(freeVel);
      const V=Math.max(relAir.length(),0.01);

      const area=Math.max(ROPE.diameter*lineLength*0.08,0.02);
      const drag=relAir.clone().normalize().multiplyScalar(
        0.5*AIR_RHO*ROPE.CdCylinder*area*V*V
      );
      const effectiveMass=Math.max(ROPE.linearMass*lineLength,1);
      accel.addScaledVector(drag,1/effectiveMass);

      freeVel.multiplyScalar(Math.exp(-0.18*h));
    }else{
      // WATER:
      // In world coordinates the sea is approximately stationary, but in the
      // ship-fixed display frame it moves aft at ship speed. We therefore drive
      // the submerged free end toward world-water velocity ~0, which naturally
      // appears as aft drift relative to the advancing ship.
      wetState.time+=h;

      const waterWorldVel=new THREE.Vector3(0,0,0);
      const relWater=waterWorldVel.clone().sub(freeVel);
      const V=Math.max(relWater.length(),0.01);

      const area=Math.max(ROPE.diameter*lineLength*0.10,0.02);
      const waterDrag=relWater.clone().normalize().multiplyScalar(
        0.5*WATER_RHO*ROPE.waterCd*area*V*V
      );
      const effectiveMass=Math.max(ROPE.linearMass*lineLength,1);

      accel.addScaledVector(waterDrag,1/effectiveMass);
      accel.y-=ROPE.submergedDownAccel;

      // Strong damping without rebound.
      freeVel.multiplyScalar(Math.exp(-4.2*h));
      if(freeVel.y>0) freeVel.y=0;
    }

    freeVel.addScaledVector(accel,h);
    freePos.addScaledVector(freeVel,h);

    // Maximum rope length constraint, inelastic.
    const delta=freePos.clone().sub(anchorWorld);
    const d=delta.length();

    if(d>lineLength && d>1e-6){
      const radial=delta.normalize();
      freePos.copy(anchorWorld).addScaledVector(radial,lineLength);

      const outward=freeVel.dot(radial);
      if(outward>0){
        freeVel.addScaledVector(radial,-outward);
      }
    }

    if(wetState.wet){
      const ceiling=-Math.min(
        0.08+wetState.time*ROPE.sinkLockRate,
        ROPE.sinkLockMaxDepth
      );
      if(freePos.y>ceiling){
        freePos.y=ceiling;
        if(freeVel.y>0) freeVel.y=0;
      }
    }
  }

  return wetState;
}
function polylineLength(points){
  let L=0;
  for(let i=1;i<points.length;i++){
    L+=points[i].distanceTo(points[i-1]);
  }
  return L;
}

function buildLengthPreservingRopePoints(
  anchorWorld,
  freeWorld,
  lineLength,
  wetFree,
  wetLengthM,
  pointCount=96
){
  const a=displayPositionFromWorld(anchorWorld);
  const b=displayPositionFromWorld(freeWorld);

  if(lineLength<=0.5) return [];

  const windVec=trueWindWorld();
  const windDir=windVec.lengthSq()>1e-6
    ? windVec.clone().normalize()
    : new THREE.Vector3();

  const waterVec=waterVelocityRelativeToShip();
  const waterDir=waterVec.lengthSq()>1e-6
    ? waterVec.clone().normalize()
    : new THREE.Vector3(-1,0,0);

  const wetFrac=THREE.MathUtils.clamp(
    wetLengthM/Math.max(lineLength,1e-6),
    0,1
  );

  // ==========================================================
  // AIR ONLY
  // ==========================================================
  if(!wetFree || wetFrac<=0.001){
    const direct=a.distanceTo(b);
    const slack=Math.max(lineLength-direct,0);

    const sag=Math.min(
      0.08*lineLength + 0.22*slack,
      0.20*lineLength
    );

    const windBend=Math.min(
      0.055*lineLength,
      1.5 + knotsToMs(windKnots)*0.45
    );

    const pts=[];
    for(let i=0;i<pointCount;i++){
      const t=i/(pointCount-1);
      const endpointSafeShape=4*t*(1-t); // exactly zero at both endpoints
      const q=a.clone().lerp(b,t);

      q.y-=sag*Math.sin(Math.PI*t);
      q.addScaledVector(windDir,windBend*endpointSafeShape);

      // Exact physical endpoints.
      if(i===0) q.copy(a);
      if(i===pointCount-1) q.copy(b);

      pts.push(q);
    }
    return pts;
  }

  // ==========================================================
  // PARTLY / FULLY SUBMERGED
  //
  // Three physically meaningful anchors:
  //   A = attached end
  //   E = unique sea-surface crossing
  //   B = physical free end
  //
  // A, E and B are NEVER displaced by flow-shape corrections.
  // Only intermediate points are bowed by air/water flow.
  // ==========================================================

  const dryFrac=1-wetFrac;
  const anchorAbove=a.y>0.05;

  let entry;
  let dryPointCount;

  const pts=[];

  if(anchorAbove && dryFrac>0.001){
    // Estimate where the remaining dry length reaches the sea.
    const tEntry=THREE.MathUtils.clamp(dryFrac,0.02,0.98);
    entry=a.clone().lerp(b,tEntry);
    entry.y=0;

    dryPointCount=Math.max(
      4,
      Math.round(pointCount*dryFrac)
    );

    // AIR SECTION: attached end -> sea entry.
    const dryNominalLength=lineLength*dryFrac;
    const dryDirect=a.distanceTo(entry);
    const drySlack=Math.max(dryNominalLength-dryDirect,0);

    const drySag=Math.min(
      0.06*dryNominalLength + 0.16*drySlack,
      Math.max(1.0,0.12*dryNominalLength)
    );

    const airBend=Math.min(
      0.045*dryNominalLength,
      1.5 + knotsToMs(windKnots)*0.35
    );

    for(let i=0;i<dryPointCount;i++){
      const t=i/(dryPointCount-1);
      const endpointSafeShape=4*t*(1-t);
      const q=a.clone().lerp(entry,t);

      q.y-=drySag*Math.sin(Math.PI*t);
      q.addScaledVector(windDir,airBend*endpointSafeShape);

      // Dry rope may touch the sea only at E.
      if(i===0){
        q.copy(a);
      }else if(i===dryPointCount-1){
        q.copy(entry);
      }else{
        q.y=Math.max(q.y,0.04);
      }

      pts.push(q);
    }
  }else{
    // Attached end itself is submerged.
    entry=a.clone();
    dryPointCount=1;
    pts.push(a.clone());
  }

  // ==========================================================
  // WATER SECTION: E -> B
  // ==========================================================

  const waterCount=Math.max(
    6,
    pointCount-dryPointCount+1
  );

  const wetNominalLength=Math.max(
    wetLengthM,
    lineLength*0.02
  );

  // Ship-fixed view: still water travels aft.
  // IMPORTANT: this bends only INTERMEDIATE points.
  const maxAftBow=Math.min(
    0.16*wetNominalLength,
    2.0 + knotsToMs(shipSpeedKnots)*1.8
  );

  // Side-flow contribution, if any, may be added later through a current vector.
  const depthEnd=Math.min(b.y,-0.05);

  for(let i=1;i<waterCount;i++){
    const u=i/(waterCount-1);

    // Physical base path between unique sea entry and actual free end.
    const q=entry.clone().lerp(b,u);

    // Bell shape = 0 at E and B.
    // This is the critical fix: flow cannot move the physical free end.
    const bowShape=4*u*(1-u);

    q.addScaledVector(
      waterDir,
      maxAftBow*bowShape
    );

    // Smooth monotonic descent from sea surface to physical free-end depth.
    // No U-shaped vertical sag is imposed underwater.
    const depthShape=u*u*(3-2*u);
    const desiredY=THREE.MathUtils.lerp(
      entry.y,
      depthEnd,
      depthShape
    );
    q.y=desiredY;

    // Guarantee only one sea crossing.
    if(i<waterCount-1){
      q.y=Math.min(q.y,-0.002);
    }else{
      // Exact physical free end.
      q.copy(b);
    }

    pts.push(q);
  }

  // Final safety guarantees.
  if(pts.length>0){
    pts[0].copy(a);
    pts[pts.length-1].copy(b);
  }

  return pts;
}
function computeKiteSideRopeLoad(dt){
  if(kiteSideLengthM<0.5){
    return new THREE.Vector3();
  }

  const wind=trueWindWorld();
  const mass=ropeKiteSideMass;

  // Full remaining line weight acts on the kite-side system.
  const total=new THREE.Vector3(0,-mass*G,0);

  // Distributed line aerodynamic drag.
  // Average rope velocity is approximated from kite and free-end velocities.
  const avgVel=kiteWorldVel.clone().add(kiteFreeEndVel).multiplyScalar(0.5);
  const relAir=wind.clone().sub(avgVel);
  const V=Math.max(relAir.length(),0.01);
  const projectedArea=ROPE.diameter*kiteSideLengthM;

  const ropeDrag=relAir.clone().normalize().multiplyScalar(
    0.5*AIR_RHO*ROPE.CdCylinder*projectedArea*V*V
  );
  total.addScaledVector(ropeDrag,0.55);

  // If nearly taut, transmit a bounded pulling load along the rope.
  const delta=kiteFreeEndWorld.clone().sub(kiteWorldPos);
  const d=delta.length();
  if(d>0.92*kiteSideLengthM && d>1e-6){
    const tautness=THREE.MathUtils.clamp(
      (d/kiteSideLengthM-0.92)/0.08,
      0,1
    );
    const pullMag=Math.min(
      tautness*(mass*G + ropeDrag.length()*0.4),
      1.2e5
    );
    total.addScaledVector(delta.normalize(),pullMag);
  }

  if(total.length()>2.0e5) total.setLength(2.0e5);
  return total;
}

function updateBrokenRopes(dt){
  towingUnit.getWorldPosition(towOriginDisplay);
  const towOriginWorld=shipWorldPos.clone().add(towOriginDisplay);
  const wind=trueWindWorld();

  // SHIP-SIDE HALF
  if(shipSideLengthM>0.5){
    const wetState={wet:shipFreeWet,time:shipFreeWetTime};
    integrateBrokenFreeEnd(
      towOriginWorld,
      shipFreeEndWorld,
      shipFreeEndVel,
      shipSideLengthM,
      dt,
      wind,
      wetState
    );
    shipFreeWet=wetState.wet;
    shipFreeWetTime=wetState.time;

    if(shipFreeWet){
      // Water progressively captures more rope. Ship speed increases the
      // ingestion/advection rate, but it remains finite and smooth.
      const entryRate=3.0 + knotsToMs(shipSpeedKnots)*1.15;
      shipWetLengthM=Math.min(
        shipSideLengthM,
        shipWetLengthM + entryRate*dt
      );
    }

    const shipPts=buildLengthPreservingRopePoints(
      towOriginWorld,
      shipFreeEndWorld,
      shipSideLengthM,
      shipFreeWet,
      shipWetLengthM,
      88
    );
    shipCableGeo.setFromPoints(shipPts);
    shipCableGeo.computeBoundingSphere();
    shipCable.visible=shipPts.length>=2;
  }else{
    shipCableGeo.setFromPoints([]);
    shipCable.visible=false;
  }

  // KITE-SIDE HALF
  if(kiteSideLengthM>0.5){
    const wetState={wet:kiteFreeWet,time:kiteFreeWetTime};
    integrateBrokenFreeEnd(
      kiteWorldPos,
      kiteFreeEndWorld,
      kiteFreeEndVel,
      kiteSideLengthM,
      dt,
      wind,
      wetState
    );
    kiteFreeWet=wetState.wet;
    kiteFreeWetTime=wetState.time;

    if(kiteFreeWet){
      const entryRate=3.0 + knotsToMs(shipSpeedKnots)*1.15;
      kiteWetLengthM=Math.min(
        kiteSideLengthM,
        kiteWetLengthM + entryRate*dt
      );
    }

    const kitePts=buildLengthPreservingRopePoints(
      kiteWorldPos,
      kiteFreeEndWorld,
      kiteSideLengthM,
      kiteFreeWet,
      kiteWetLengthM,
      96
    );
    kiteCableGeo.setFromPoints(kitePts);
    kiteCableGeo.computeBoundingSphere();
    kiteCable.visible=kitePts.length>=2;
  }else{
    kiteCableGeo.setFromPoints([]);
    kiteCable.visible=false;
  }
}

function updateAirborne(dt){
  const ropeLoad=computeKiteSideRopeLoad(dt);
  const {lift,drag}=aeroForces();
  const gravity=new THREE.Vector3(0,-KITE.mass*G,0);

  const totalForce=lift.add(drag).add(gravity).add(ropeLoad);
  const effectiveMass=Math.max(KITE.mass+ropeKiteSideMass,1);
  const acc=totalForce.divideScalar(effectiveMass);

  // Prevent NaN/Infinity from freezing the render loop.
  if(!Number.isFinite(acc.x) || !Number.isFinite(acc.y) || !Number.isFinite(acc.z)){
    acc.set(0,-G,0);
  }

  kiteWorldVel.addScaledVector(acc,dt);
  if(kiteWorldVel.length()>80) kiteWorldVel.setLength(80);
  kiteWorldPos.addScaledVector(kiteWorldVel,dt);

  const displayPos=displayPositionFromWorld(kiteWorldPos);
  kite.position.copy(displayPos);

  const relVel=kiteWorldVel.clone().sub(shipVelocityWorld());
  const yaw=Math.atan2(-relVel.z,Math.max(Math.abs(relVel.x),.1));
  kite.rotation.y+=(yaw-kite.rotation.y)*Math.min(dt*1.5,1);
  kite.rotation.z+=.55*Math.sin(breakElapsed*1.8)*dt;
  kite.rotation.x+=.30*Math.sin(breakElapsed*2.3)*dt;

  const flutter=Math.min(breakElapsed/8,1);
  kitePanels.forEach((p,i)=>{
    p.rotation.y=.05*flutter*Math.sin(breakElapsed*5+i*.8);
    p.scale.y=1-.18*flutter*Math.abs(Math.sin(breakElapsed*3.2+i));
  });

  if(kiteWorldPos.y<=2){
    kiteWorldPos.y=2;
    state=STATES.IMPACT;
    waterEntryTime=breakElapsed;
    setStatus('SEA IMPACT','status-impact');
    flash('SEA IMPACT');

    const impactDisplay=displayPositionFromWorld(kiteWorldPos);
    impactRing.position.set(impactDisplay.x,.4,impactDisplay.z);
    impactRing.material.opacity=.85;

    if(!impactRecorded){
      impactRecorded=true;
      impactSpeedEl.textContent=`${kiteWorldVel.length().toFixed(1)} m/s`;
      impactPositionEl.textContent =
        `${Math.abs(impactDisplay.x).toFixed(0)}m ${impactDisplay.x>=0?'AHEAD':'ASTERN'}, ` +
        `${Math.abs(impactDisplay.z).toFixed(0)}m ${impactDisplay.z>=0?'STBD':'PORT'}`;
    }
  }
}

function updateWater(dt){
  const waterAge=breakElapsed-waterEntryTime;
  const sub=THREE.MathUtils.clamp(waterAge/3,0,1);

  const waterVel=kiteWorldVel.clone();
  const V=Math.max(waterVel.length(),.01);
  const effectiveArea=KITE.area*(.025+.05*(1-sub));

  const waterDrag=waterVel.clone().normalize().multiplyScalar(
    -.5*WATER_RHO*KITE.waterCd*effectiveArea*V*V
  );

  const restoring=new THREE.Vector3(
    0,
    (1.4-kiteWorldPos.y)*9000-kiteWorldVel.y*3500,
    0
  );

  const acc=waterDrag.add(restoring).divideScalar(Math.max(KITE.mass+ropeKiteSideMass,1));
  kiteWorldVel.addScaledVector(acc,dt);
  if(kiteWorldVel.length()>25) kiteWorldVel.setLength(25);
  kiteWorldPos.addScaledVector(kiteWorldVel,dt);

  kiteWorldPos.y=THREE.MathUtils.clamp(kiteWorldPos.y,-1.8,2);

  const displayPos=displayPositionFromWorld(kiteWorldPos);
  kite.position.copy(displayPos);

  kitePanels.forEach((p,i)=>{
    p.scale.y+=(.14-p.scale.y)*Math.min(dt*2.2,1);
    p.scale.z+=(.82-p.scale.z)*Math.min(dt,1);
    p.rotation.z+=.05*Math.sin(breakElapsed*2+i)*dt;
  });

  kite.rotation.x+=.06*Math.sin(breakElapsed*1.4)*dt;
  kite.rotation.z+=.04*Math.sin(breakElapsed*1.1)*dt;

  impactRing.material.opacity=Math.max(0,impactRing.material.opacity-dt*.22);

  // Transition based on velocity RELATIVE TO SHIP, not only world speed.
  const relSpeed=kiteWorldVel.clone().sub(shipVelocityWorld()).length();
  if(waterAge>7 && relSpeed<8){
    state=STATES.DRIFT;
    setStatus('DRIFTING / PARTLY SUBMERGED','status-drift');
  }
}

function updateDrift(dt){
  // Approximate water/current motion in world frame.
  // Ship keeps moving forward, therefore kite naturally appears to move astern in display frame.
  const targetWorldDrift=new THREE.Vector3(
    knotsToMs(windKnots)*.015,
    0,
    .20
  );

  kiteWorldVel.lerp(targetWorldDrift,Math.min(dt*.25,1));
  kiteWorldPos.addScaledVector(kiteWorldVel,dt);
  kiteWorldPos.y=.2+.45*Math.sin(simTime*1.1);

  const displayPos=displayPositionFromWorld(kiteWorldPos);
  kite.position.copy(displayPos);

  kite.rotation.x=.15+.08*Math.sin(simTime*.9);
  kite.rotation.z=.10*Math.sin(simTime*.7);
}

function updateFailure(dt){
  breakElapsed+=dt;
  breakTimeEl.textContent=`${breakElapsed.toFixed(1)} s`;
  forceEl.textContent='0 kN';
  lineLengthEl.textContent='BROKEN';
  elevationEl.textContent='--';

  if(state===STATES.AIRBORNE) updateAirborne(dt);
  else if(state===STATES.IMPACT){ state=STATES.WATER; updateWater(dt); }
  else if(state===STATES.WATER) updateWater(dt);
  else if(state===STATES.DRIFT) updateDrift(dt);


  // Broken rope halves continue to fall/sink in EVERY post-failure state,
  // including after the kite reaches the water.
  updateBrokenRopes(dt);

  const displayPos=displayPositionFromWorld(kiteWorldPos);
  altitudeEl.textContent=`${Math.max(0,displayPos.y).toFixed(1)} m`;
  kiteSpeedEl.textContent=`${kiteWorldVel.length().toFixed(1)} m/s`;
  updateRelativeHud();

  // No flight-path trail during failure mode.
  // Only ship-side and kite-side physical rope halves are rendered.
}

function updateFoam(dt){
  // Ship-fixed view: foam runs aft faster as ship speed increases.
  const aftSpeed=22 + knotsToMs(shipSpeedKnots)*2.0;
  for(const m of foam){
    m.position.x-=aftSpeed*dt;
    if(m.position.x<-420){
      m.position.x=-50+Math.random()*165;
      m.position.z=(Math.random()-.5)*65;
    }
  }
}

function resetSimulation(){
  state=STATES.TOWING;
  breakElapsed=0;
  impactRecorded=false;
  waterEntryTime=0;

  // Reset world reference.
  shipWorldPos.set(0,0,0);
  kiteWorldPos.set(0,0,0);
  kiteWorldVel.set(0,0,0);
  lastTowingWorldPos.set(0,0,0);
  lastTowingWorldVel.set(0,0,0);

  shipFreeEndWorld.set(0,0,0);
  shipFreeEndVel.set(0,0,0);
  kiteFreeEndWorld.set(0,0,0);
  kiteFreeEndVel.set(0,0,0);
  shipFreeWet=false;
  kiteFreeWet=false;
  shipFreeWetTime=0;
  kiteFreeWetTime=0;
  shipWetLengthM=0;
  kiteWetLengthM=0;

  trailPoints.length=0;
  trailGeo.setFromPoints([]);
  trail.visible=true;

  shipCable.visible=false;
  kiteCable.visible=false;
  tetherLine.visible=true;
  for(let i=0;i<ROPE.nodesMax;i++){
    ropePos[i].set(0,0,0);
    ropePrev[i].set(0,0,0);
    shipRopePos[i].set(0,0,0);
    shipRopePrev[i].set(0,0,0);

    ropeWet[i]=false;
    ropeWetTime[i]=0;
    shipRopeWet[i]=false;
    shipRopeWetTime[i]=0;
  }
  updateBreakConfiguration();
  impactRing.material.opacity=0;
  breakBtn.disabled=false;

  breakTimeEl.textContent='--';
  impactSpeedEl.textContent='--';
  impactPositionEl.textContent='--';
  setStatus('NORMAL TOWING','status-normal');

  kitePanels.forEach(p=>{
    p.scale.set(1,1,1);
    p.rotation.y=0;
    p.rotation.z=0;
  });
}

breakBtn.addEventListener('click',breakTether);
resetBtn.addEventListener('click',resetSimulation);

function windAngleLabel(deg){
  const d=((deg%360)+360)%360;
  if(d<22.5 || d>=337.5) return 'FROM BOW';
  if(d<67.5) return 'FROM STBD BOW';
  if(d<112.5) return 'FROM STBD';
  if(d<157.5) return 'FROM STBD QTR';
  if(d<202.5) return 'FROM ASTERN';
  if(d<247.5) return 'FROM PORT QTR';
  if(d<292.5) return 'FROM PORT';
  return 'FROM PORT BOW';
}

windSlider.addEventListener('input',()=>{
  windKnots=Number(windSlider.value);
  windValue.textContent=`${windKnots} kn`;
  updateWindArrow();
});

windAngleSlider.addEventListener('input',()=>{
  windAngleDeg=Number(windAngleSlider.value);
  windAngleValue.textContent=`${windAngleDeg}° (${windAngleLabel(windAngleDeg)})`;
  updateWindArrow();
});

breakPositionSlider.addEventListener('input',()=>{
  if(state===STATES.TOWING) updateBreakConfiguration();
});

shipSpeedSlider.addEventListener('input',()=>{
  shipSpeedKnots=Number(shipSpeedSlider.value);
  shipSpeedValue.textContent=`${shipSpeedKnots.toFixed(1).replace('.0','')} kn`;
  waterFlowValue.textContent=`${shipSpeedKnots.toFixed(1).replace('.0','')} kn AFT`;
});

const clock=new THREE.Clock();

function animate(){
  requestAnimationFrame(animate);

  const dt=Math.min(clock.getDelta(),.025);
  simTime+=dt;

  // Internal ship advance in WORLD coordinates.
  shipWorldPos.addScaledVector(shipVelocityWorld(),dt);

  updateOcean(simTime,dt);
  updateFoam(dt);

  // Visual ship stays fixed.
  ship.rotation.x=.004*Math.sin(simTime*.65);
  ship.rotation.z=.007*Math.sin(simTime*.47);

  if(state===STATES.TOWING) updateNormalTowing(simTime,dt);
  else updateFailure(dt);

  controls.update();
  renderer.render(scene,camera);
}

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

updateWindArrow();
updateBreakConfiguration();
resetSimulation();
animate();
