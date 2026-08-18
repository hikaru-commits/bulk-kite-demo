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
windAngleSlider=$('windAngleSlider'), windAngleValue=$('windAngleValue');

const SHIP={loa:299.99,lpp:296,breadth:50,depth:25};
const KITE={area:600,cableLength:600,elevationDeg:30,mass:650,CLmax:1.05,CD0:.22,inducedK:.16,waterCd:1.35};
const AIR_RHO=1.225, WATER_RHO=1025, G=9.81;

const STATES={TOWING:'TOWING',AIRBORNE:'AIRBORNE',IMPACT:'IMPACT',WATER:'WATER',DRIFT:'DRIFT'};
let state=STATES.TOWING;
let breakElapsed=0, simTime=0, windKnots=18, windAngleDeg=180, shipSpeedKnots=12, impactRecorded=false, waterEntryTime=0;

// Broken-rope model:
// Assume failure occurs at/near the ship-side terminal.
// Therefore almost the full 600 m Dyneema line remains attached to the kite.
// Dyneema/UHMWPE is modeled as negatively buoyant in air (gravity) and slightly buoyant in seawater.
const ROPE = {
  nodes: 31,
  length: KITE.cableLength,
  airDrag: 0.55,
  waterDrag: 3.5,
  waterBuoyantAccel: 0.55
};

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
const shipCable=new THREE.Line(shipCableGeo,new THREE.LineBasicMaterial({color:0xe8edf0}));
shipCable.visible=false; scene.add(shipCable);

// The kite-side broken line is a particle rope, not a decorative line.
// This lets gravity pull the Dyneema line BELOW the kite after failure.
const kiteCableGeo=new THREE.BufferGeometry();
const kiteCable=new THREE.Line(
  kiteCableGeo,
  new THREE.LineBasicMaterial({color:0xdde4e8})
);
kiteCable.visible=false;
scene.add(kiteCable);

const ropePos=[];
const ropePrev=[];
for(let i=0;i<ROPE.nodes;i++){
  ropePos.push(new THREE.Vector3());
  ropePrev.push(new THREE.Vector3());
}
const ropeSegmentLength=ROPE.length/(ROPE.nodes-1);

// Trail in display frame.
const trailPoints=[], trailGeo=new THREE.BufferGeometry();
const trail=new THREE.Line(
  trailGeo,
  new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.34})
);
scene.add(trail);

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
  shipCable.visible=true;
  kiteCable.visible=true;
  breakBtn.disabled=true;

  // Initialize the 600 m rope along the pre-break tether in WORLD coordinates.
  // Node 0 remains attached to the kite; the former ship end becomes free.
  towingUnit.getWorldPosition(towOriginDisplay);
  const towOriginWorld = shipWorldPos.clone().add(towOriginDisplay);
  const shipVel = shipVelocityWorld();
  for(let i=0;i<ROPE.nodes;i++){
    const f=i/(ROPE.nodes-1);
    // f=0 kite end, f=1 former ship end
    ropePos[i].copy(kiteWorldPos).lerp(towOriginWorld,f);
    const initVel=kiteWorldVel.clone().lerp(shipVel,f);
    ropePrev[i].copy(ropePos[i]).addScaledVector(initVel,-1/60);
  }

  impactSpeedEl.textContent='--';
  impactPositionEl.textContent='--';

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

function updateBrokenRope(dt,t){
  towingUnit.getWorldPosition(towOriginDisplay);

  // Short ship-side stump after terminal failure.
  const stumpEnd=towOriginDisplay.clone().add(
    new THREE.Vector3(-8,-4,2*Math.sin(t*1.7))
  );
  shipCableGeo.setFromPoints([
    towOriginDisplay.clone(),
    towOriginDisplay.clone().lerp(stumpEnd,.55).add(new THREE.Vector3(0,-2,0)),
    stumpEnd
  ]);

  const wind=trueWindWorld();

  // Verlet integration of all free rope nodes except node 0 (kite attachment).
  for(let i=1;i<ROPE.nodes;i++){
    const cur=ropePos[i];
    const prev=ropePrev[i];
    const velocity=cur.clone().sub(prev);
    prev.copy(cur);

    const accel=new THREE.Vector3();

    if(cur.y>0){
      accel.y-=G;
      const relAir=wind.clone().sub(velocity.clone().multiplyScalar(60));
      accel.addScaledVector(relAir,ROPE.airDrag*0.015);
    }else{
      // Dyneema/UHMWPE floats in seawater: slight net upward acceleration,
      // plus very strong hydrodynamic damping.
      accel.y+=ROPE.waterBuoyantAccel;
      accel.addScaledVector(velocity, -ROPE.waterDrag);
    }

    cur.add(velocity).addScaledVector(accel,dt*dt);
  }

  // The kite-end node is attached.
  ropePos[0].copy(kiteWorldPos);

  // Distance constraints preserve the 600 m rope length.
  for(let iter=0;iter<8;iter++){
    ropePos[0].copy(kiteWorldPos);
    for(let i=0;i<ROPE.nodes-1;i++){
      const a=ropePos[i], b=ropePos[i+1];
      const delta=b.clone().sub(a);
      const d=Math.max(delta.length(),0.0001);
      const error=(d-ropeSegmentLength)/d;

      if(i===0){
        // node 0 is fixed to kite, so move only node 1
        b.addScaledVector(delta,-error);
      }else{
        a.addScaledVector(delta, error*.5);
        b.addScaledVector(delta,-error*.5);
      }
    }
  }

  // Convert world rope points to ship-fixed display coordinates.
  const displayPoints=ropePos.map(pt=>displayPositionFromWorld(pt));
  kiteCableGeo.setFromPoints(displayPoints);
}

function updateAirborne(dt){
  const {lift,drag}=aeroForces();
  const gravity=new THREE.Vector3(0,-KITE.mass*G,0);
  const acc=lift.add(drag).add(gravity).divideScalar(KITE.mass);

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

  const acc=waterDrag.add(restoring).divideScalar(KITE.mass);
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

  updateBrokenRope(dt,simTime);

  const displayPos=displayPositionFromWorld(kiteWorldPos);
  altitudeEl.textContent=`${Math.max(0,displayPos.y).toFixed(1)} m`;
  kiteSpeedEl.textContent=`${kiteWorldVel.length().toFixed(1)} m/s`;
  updateRelativeHud();

  if(!trailPoints.length || trailPoints.at(-1).distanceToSquared(displayPos)>3){
    trailPoints.push(displayPos.clone());
    if(trailPoints.length>480) trailPoints.shift();
    trailGeo.setFromPoints(trailPoints);
  }
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

  trailPoints.length=0;
  trailGeo.setFromPoints([]);

  shipCable.visible=false;
  kiteCable.visible=false;
  tetherLine.visible=true;
  for(let i=0;i<ROPE.nodes;i++){
    ropePos[i].set(0,0,0);
    ropePrev[i].set(0,0,0);
  }
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

shipSpeedSlider.addEventListener('input',()=>{
  shipSpeedKnots=Number(shipSpeedSlider.value);
  shipSpeedValue.textContent=`${shipSpeedKnots.toFixed(1).replace('.0','')} kn`;
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
resetSimulation();
animate();
