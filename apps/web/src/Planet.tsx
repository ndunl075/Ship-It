import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { toCartesian, type Project } from '@ship-it/shared';
import { duration, type FlightClock } from './flight';

export type PlanetProps = { projects: Project[]; selected: Project | null; onSelect: (p: Project) => void; flight: { project: Project; key: number } | null; clock: React.RefObject<FlightClock>; running: boolean; rotate: boolean; visible: boolean; onFailure: () => void };
const UP = new THREE.Vector3(0, 1, 0);
const surface = (lat: number, lon: number, r = 2.29) => new THREE.Vector3(...toCartesian(lat, lon, r));
function noise(x: number, y: number, z: number) { return Math.sin(x * 2.4 + z * 1.8) + Math.cos(y * 3.2 - x * .6) * .6 + Math.sin(z * 4.5 + y) * .28; }
function Terrain() {
  const geo = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(2.22, 4);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const palette = ['#608c87', '#70a39a', '#91bda5', '#a4c9a9', '#b2ceab', '#ced9b8'].map(c => new THREE.Color(c));
    const center = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 3) {
      center.set(0, 0, 0);
      for (let j = 0; j < 3; j++) center.add(new THREE.Vector3().fromBufferAttribute(position, i + j));
      center.divideScalar(3);
      const n = noise(center.x, center.y, center.z);
      const land = n > .12, raised = land ? 1.018 + Math.max(0, n) * .012 : 1;
      const color = palette[land ? Math.min(5, 2 + Math.floor((n + .1) * 1.7)) : n < -.7 ? 0 : 1];
      for (let j = 0; j < 3; j++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, i + j).multiplyScalar(raised);
        position.setXYZ(i + j, point.x, point.y, point.z); color.toArray(colors, (i + j) * 3);
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals(); return geometry;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo}><meshStandardMaterial vertexColors roughness={1} flatShading /></mesh>;
}
function Grove({ position, index }: { position: THREE.Vector3; index: number }) {
  const rotation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, position.clone().normalize()), [position]);
  return <group position={position} quaternion={rotation} scale={.75 + index % 3 * .16}>
    <mesh position={[0, .04, 0]}><cylinderGeometry args={[.015, .02, .1, 5]}/><meshStandardMaterial color="#716452"/></mesh>
    <mesh position={[0, .13, 0]}><coneGeometry args={[.085, .2, 5]}/><meshStandardMaterial color={index % 2 ? '#426e60' : '#547c62'} flatShading /></mesh>
    <mesh position={[0, .2, 0]}><coneGeometry args={[.055, .15, 5]}/><meshStandardMaterial color="#638b6c" flatShading /></mesh>
  </group>;
}
function Site({ project, selected, onSelect, label }: { project: Project; selected: boolean; onSelect: () => void; label: boolean }) {
  const position = useMemo(() => surface(project.latitude, project.longitude, 2.31), [project.latitude, project.longitude]);
  const rotation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, position.clone().normalize()), [position]);
  return <group position={position} quaternion={rotation} onClick={e => { e.stopPropagation(); onSelect(); }} onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
    <mesh position={[0, -.005, 0]}><cylinderGeometry args={[selected ? .18 : .13, .15, .045, 8]}/><meshStandardMaterial color={selected ? '#f2ba7f' : '#d7dfbc'} /></mesh>
    <mesh position={[0, .07, 0]}><boxGeometry args={[.12, .13, .12]}/><meshStandardMaterial color="#ede7d4" /></mesh>
    <mesh position={[0, .157, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[.106, .07, 4]}/><meshStandardMaterial color={selected ? '#ed9c6d' : '#708e87'} /></mesh>
    <mesh position={[.061, .074, 0]}><boxGeometry args={[.003, .037, .035]}/><meshStandardMaterial color="#40625e" /></mesh>
    <mesh position={[-.093, .15, 0]}><cylinderGeometry args={[.006, .006, .3, 4]}/><meshStandardMaterial color="#dedbc7" /></mesh>
    <mesh position={[-.05, .25, 0]}><boxGeometry args={[.08, .055, .008]}/><meshStandardMaterial color="#f4b47c" side={THREE.DoubleSide} /></mesh>
    {project.launchCount > 10 && <mesh position={[.065, .15, -.055]}><cylinderGeometry args={[.033, .037, .24, 6]}/><meshStandardMaterial color="#d9ddc5" /></mesh>}
    {(selected || label) && <Html position={[0, .38, 0]} center occlude distanceFactor={8} zIndexRange={[12, 0]}><button className={`planet-label ${selected ? 'selected' : ''}`} onClick={onSelect} tabIndex={-1}>{project.name}<span>↗</span></button></Html>}
  </group>;
}
function Rocket() {
  return <group scale={.8}>
    <mesh><cylinderGeometry args={[.055, .075, .27, 10]}/><meshStandardMaterial color="#f4ede0" /></mesh>
    <mesh position={[0, .19, 0]}><coneGeometry args={[.057, .12, 10]}/><meshStandardMaterial color="#ec9b70" /></mesh>
    <mesh position={[0, .04, .054]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.026, .026, .014, 12]}/><meshStandardMaterial color="#527d80" metalness={.3} roughness={.2} /></mesh>
    {[0, 1, 2].map(i => <group key={i} rotation={[0, i * Math.PI * 2 / 3, 0]}><mesh position={[0, -.1, .075]} rotation={[.35, 0, 0]}><boxGeometry args={[.02, .13, .11]}/><meshStandardMaterial color="#efab77" /></mesh></group>)}
    <mesh position={[0, -.24, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.042, .23, 8]}/><meshBasicMaterial color="#ffc98b" transparent opacity={.9}/></mesh>
    <mesh position={[0, -.19, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[.025, .13, 8]}/><meshBasicMaterial color="#fff4ca" /></mesh>
  </group>;
}
function Flight({ project, clock }: { project: Project; clock: React.RefObject<FlightClock> }) {
  const rocket = useRef<THREE.Group>(null), pulse = useRef<THREE.Group>(null), trail = useRef<THREE.Group>(null);
  const destination = useMemo(() => surface(project.latitude, project.longitude, 2.42), [project.latitude, project.longitude]);
  const curve = useMemo(() => {
    const outward = destination.clone().normalize(), tangent = new THREE.Vector3().crossVectors(outward, new THREE.Vector3(.1, 1, .2)).normalize();
    return new THREE.CubicBezierCurve3(destination.clone().multiplyScalar(1.9).addScaledVector(tangent, -3), destination.clone().multiplyScalar(2.6).addScaledVector(tangent, -1.5), destination.clone().multiplyScalar(1.65).addScaledVector(tangent, 2), destination);
  }, [destination]);
  const points = useMemo(() => curve.getPoints(96), [curve]);
  useFrame(() => {
    if (!rocket.current || !pulse.current || !trail.current) return;
    const elapsed = clock.current.elapsed, progress = Math.max(0, Math.min(1, (elapsed - 400) / 9600));
    rocket.current.position.copy(curve.getPoint(progress)); rocket.current.quaternion.setFromUnitVectors(UP, curve.getTangent(progress).normalize());
    rocket.current.visible = elapsed >= 400 && elapsed < 10000;
    trail.current.visible = elapsed >= 400 && elapsed < 10000;
    const celebrating = elapsed >= 10000 && elapsed < duration;
    pulse.current.visible = celebrating;
    pulse.current.scale.setScalar(.3 + (elapsed - 10000) / 2500 * 2.7);
  });
  return <>
    <group ref={trail}><Line points={points} color="#efb57d" lineWidth={1.5} transparent opacity={.36} dashed dashSize={.09} gapSize={.035}/></group>
    <group ref={rocket}><Rocket /></group>
    <group position={destination} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), destination.clone().normalize())}>
      <group ref={pulse}>{[.12, .2, .29].map((r, i) => <mesh key={r}><torusGeometry args={[r, .008, 5, 40]}/><meshBasicMaterial color={i === 1 ? '#f9e1ac' : '#eeb27a'} transparent opacity={.75 - i * .14}/></mesh>)}</group>
    </group>
  </>;
}
function Sky() {
  const positions = useMemo(() => {
    const values = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) { const a = i * 2.399963, y = 1 - i / 180, r = Math.sqrt(1 - y * y); values.set([r * Math.cos(a) * 35, y * 35, r * Math.sin(a) * 35], i * 3); }
    return values;
  }, []);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry><pointsMaterial size={.055} color="#a6b9ae" transparent opacity={.48} sizeAttenuation /></points>;
}
function World(props: PlanetProps) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const targetCamera = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    targetCamera.current = props.selected ? surface(props.selected.latitude, props.selected.longitude, 8.4) : null;
  }, [props.selected?.id]);
  useFrame((_, delta) => {
    if (props.running && targetCamera.current) {
      camera.position.lerp(targetCamera.current, Math.min(1, delta * 2));
      if (camera.position.distanceTo(targetCamera.current) < .02) targetCamera.current = null;
      camera.lookAt(0, 0, 0);
    }
  });
  useEffect(() => {
    if (props.selected && !props.running) { camera.position.copy(surface(props.selected.latitude, props.selected.longitude, 8.4)); camera.lookAt(0, 0, 0); }
  }, [props.selected?.id, props.running, camera]);
  const trees = useMemo(() => Array.from({ length: 100 }, (_, i) => {
    const y = 1 - (i + .5) / 50, a = i * 2.399963, r = Math.sqrt(1 - y * y), p = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)).multiplyScalar(2.3);
    return noise(p.x, p.y, p.z) > .5 ? p : null;
  }).filter((p): p is THREE.Vector3 => p !== null), []);
  const orbit = useMemo(() => Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 64) * 3.5, 0, Math.sin(i * Math.PI / 64) * 3.5)), []);
  return <>
    <ambientLight intensity={1.1} color="#c3dccb"/><directionalLight position={[-4, 6, 6]} intensity={3.5} color="#fff0d2"/><directionalLight position={[4, -1, -5]} intensity={1.6} color="#719d9e"/>
    <Sky/><Terrain/>
    {trees.map((p, i) => <Grove key={i} position={p} index={i}/>)}
    {props.projects.slice(0, 100).map((p, i) => <Site key={p.id} project={p} selected={props.selected?.id === p.id} onSelect={() => props.onSelect(p)} label={i < 4}/>)}
    <group rotation={[.14, 0, -.22]}><Line points={orbit} color="#708c82" lineWidth={.7} transparent opacity={.32}/><mesh position={[3.5, 0, 0]}><sphereGeometry args={[.035, 8, 8]}/><meshBasicMaterial color="#d5cba5"/></mesh></group>
    <mesh position={[-3.2, 1.75, -.8]} rotation={[.3, .3, .4]}><icosahedronGeometry args={[.18, 0]}/><meshStandardMaterial color="#a9afa0" flatShading /></mesh>
    <mesh position={[-3.4, 1.4, -.7]}><icosahedronGeometry args={[.065, 0]}/><meshStandardMaterial color="#7c9288" flatShading /></mesh>
    {props.flight && <Flight key={props.flight.key} project={props.flight.project} clock={props.clock}/>}
    <OrbitControls ref={controls} enablePan={false} enableDamping dampingFactor={.065} minDistance={5.5} maxDistance={13} autoRotate={props.rotate && props.running && !props.flight} autoRotateSpeed={.45} onStart={() => { targetCamera.current = null; }}/>
  </>;
}
export default function Planet(props: PlanetProps) {
  return <Canvas camera={{ position: [6.8, 3.6, 8], fov: 39 }} dpr={[1, 1.6]} frameloop={props.visible ? props.running ? 'always' : 'demand' : 'never'} gl={{ antialias: true, powerPreference: 'low-power' }} onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); props.onFailure(); }, { once: true }); }}><World {...props}/></Canvas>;
}
