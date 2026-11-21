import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Target,
  Crosshair,
  Activity,
} from 'lucide-react';
import { useCatalog } from '../context/CatalogContext';

interface ThreeLoungeSceneProps {
  onBookPool?: () => void;
}

type CameraPreset = 'overview' | 'rack' | 'top';

interface BallBody {
  id: number;
  quat: THREE.Quaternion;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  pocketed: boolean;
}

// Pre-allocated scratch helpers to keep the rAF loop 100% allocation-free
const SCRATCH_UP = new THREE.Vector3(0, 1, 0);
const SCRATCH_MOVE_DIR = new THREE.Vector3();
const SCRATCH_ROLL_AXIS = new THREE.Vector3();
const SCRATCH_QUAT = new THREE.Quaternion();
const SCRATCH_DELTA = new THREE.Vector2();
const SCRATCH_NORMAL = new THREE.Vector2();
const SCRATCH_REL_VEL = new THREE.Vector2();
const SCRATCH_CAM_TARGET = new THREE.Vector3();
const SCRATCH_LOOK_TARGET = new THREE.Vector3();
const SCRATCH_BALL_POS = new THREE.Vector3();
const SCRATCH_BALL_SCALE = new THREE.Vector3(1, 1, 1);
const SCRATCH_ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const SCRATCH_BALL_MATRIX = new THREE.Matrix4();

const TABLE_HALF_W = 2.45;
const TABLE_HALF_L = 1.25;
const BALL_RADIUS = 0.056;
const FELT_SURFACE_Y = 0.82;
const FIXED_SUBSTEP = 1 / 240;
const MAX_FRAME_DT = 0.05;
const MAX_SUBSTEPS = 12;

const PRESET_VIEWS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [-4.1, 2.75, 3.15], target: [0, FELT_SURFACE_Y, 0] },
  rack: { pos: [3.2, 1.95, 1.85], target: [1.15, FELT_SURFACE_Y, 0] },
  top: { pos: [0, 5.4, 0.12], target: [0, FELT_SURFACE_Y, 0] },
};

const BALL_COLORS: Record<number, { color: string; stripe: boolean }> = {
  0: { color: '#F8F5EE', stripe: false },
  1: { color: '#F59E0B', stripe: false },
  2: { color: '#2563EB', stripe: false },
  3: { color: '#DC2626', stripe: false },
  4: { color: '#7C3AED', stripe: false },
  5: { color: '#EA580C', stripe: false },
  6: { color: '#16A34A', stripe: false },
  7: { color: '#7F1D1D', stripe: false },
  8: { color: '#111827', stripe: false },
  9: { color: '#F59E0B', stripe: true },
  10: { color: '#2563EB', stripe: true },
  11: { color: '#DC2626', stripe: true },
  12: { color: '#7C3AED', stripe: true },
  13: { color: '#EA580C', stripe: true },
  14: { color: '#16A34A', stripe: true },
  15: { color: '#7F1D1D', stripe: true },
};

const POCKETS: Array<{ x: number; z: number; r: number }> = [
  { x: -TABLE_HALF_W, z: -TABLE_HALF_L, r: 0.145 },
  { x: 0, z: -TABLE_HALF_L - 0.03, r: 0.135 },
  { x: TABLE_HALF_W, z: -TABLE_HALF_L, r: 0.145 },
  { x: -TABLE_HALF_W, z: TABLE_HALF_L, r: 0.145 },
  { x: 0, z: TABLE_HALF_L + 0.03, r: 0.135 },
  { x: TABLE_HALF_W, z: TABLE_HALF_L, r: 0.145 },
];

function createTransformedPart(
  geo: THREE.BufferGeometry,
  pos: [number, number, number],
  rot?: [number, number, number]
): THREE.BufferGeometry {
  if (rot) {
    if (rot[0]) geo.rotateX(rot[0]);
    if (rot[1]) geo.rotateY(rot[1]);
    if (rot[2]) geo.rotateZ(rot[2]);
  }
  geo.translate(pos[0], pos[1], pos[2]);
  return geo;
}

function mergeStaticParts(
  parts: THREE.BufferGeometry[],
  useGroups = false
): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, useGroups);
  for (const part of parts) {
    part.dispose();
  }
  if (!merged) {
    return new THREE.BufferGeometry();
  }
  return merged;
}

function createFeltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0B5D3F';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 6000; i += 1) {
      const x = (i * 73) % 512;
      const y = (i * 139) % 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(x, y, 2, 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(135, 0);
    ctx.lineTo(135, 512);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.arc(380, 256, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

function createWoodTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#3D2314');
    grad.addColorStop(0.5, '#52301C');
    grad.addColorStop(1, '#3B2112');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    for (let y = 0; y < 256; y += 3) {
      ctx.strokeStyle = y % 6 === 0 ? 'rgba(20,8,2,0.22)' : 'rgba(130,80,45,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(160, y + ((y % 9) - 4), 340, y - ((y % 7) - 3), 512, y);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

// Single 4x4 texture atlas for all 16 billiard balls -> 1 InstancedMesh (1 draw call total!)
function createBallAtlasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const cellW = 256;
  const cellH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cellW * 4;
  canvas.height = cellH * 4;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let num = 0; num < 16; num += 1) {
      const col = num % 4;
      const row = Math.floor(num / 4);
      const ox = col * cellW;
      const oy = row * cellH;
      const spec = BALL_COLORS[num] || { color: '#F8F5EE', stripe: false };

      if (spec.stripe) {
        ctx.fillStyle = '#F8F5EE';
        ctx.fillRect(ox, oy, cellW, cellH);
        ctx.fillStyle = spec.color;
        ctx.fillRect(ox, oy + 34, cellW, 60);
      } else {
        ctx.fillStyle = spec.color;
        ctx.fillRect(ox, oy, cellW, cellH);
      }

      if (num > 0) {
        for (const cx of [ox + 64, ox + 192]) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(cx, oy + 64, 20, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#111827';
          ctx.font = 'bold 19px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(num), cx, oy + 65);
        }
      } else {
        ctx.fillStyle = '#B91C1C';
        ctx.beginPath();
        ctx.arc(ox + 128, oy + 64, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 22, 128, 128, 126);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(0.58, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function initialRackPositions(): Array<{ id: number; x: number; z: number }> {
  const layout: Array<{ id: number; x: number; z: number }> = [
    { id: 0, x: -1.35, z: 0 },
  ];
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const startX = 1.05;
  const dx = BALL_RADIUS * 2 * 0.875;
  const dz = BALL_RADIUS * 2 * 1.025;
  let idx = 0;

  for (let col = 0; col < 5; col += 1) {
    const count = col + 1;
    for (let row = 0; row < count; row += 1) {
      const id = rackOrder[idx] ?? idx + 1;
      idx += 1;
      const x = startX + col * dx;
      const z = (row - (count - 1) / 2) * dz;
      layout.push({ id, x, z });
    }
  }
  return layout;
}

export const ThreeLoungeScene: React.FC<ThreeLoungeSceneProps> = ({ onBookPool }) => {
  const { loungePerfMonitorEnabled, setLoungePerfMonitorLocal } = useCatalog();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fpsValueRef = useRef<HTMLSpanElement | null>(null);
  const perfMetaRef = useRef<HTMLSpanElement | null>(null);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [aimAngleDeg, setAimAngleDeg] = useState<number>(0);
  const [powerPct, setPowerPct] = useState<number>(78);
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);
  const [pocketedCount, setPocketedCount] = useState<number>(0);
  const [ballsMoving, setBallsMoving] = useState<boolean>(false);
  const [togglingOverlay, setTogglingOverlay] = useState<boolean>(false);

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('hs_admin_token');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const syncToken = () => {
      try {
        setAdminToken(sessionStorage.getItem('hs_admin_token'));
      } catch {
        setAdminToken(null);
      }
    };
    syncToken();
    window.addEventListener('focus', syncToken);
    window.addEventListener('storage', syncToken);
    return () => {
      window.removeEventListener('focus', syncToken);
      window.removeEventListener('storage', syncToken);
    };
  }, []);

  const aimAngleRef = useRef<number>(0);
  const powerPctRef = useRef<number>(78);
  const soundEnabledRef = useRef<boolean>(false);
  const perfEnabledRef = useRef<boolean>(loungePerfMonitorEnabled);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const actionsRef = useRef<{
    shoot: () => void;
    rerack: () => void;
    setCameraPreset: (p: CameraPreset) => void;
    wake: () => void;
  } | null>(null);

  useEffect(() => {
    aimAngleRef.current = aimAngleDeg;
    actionsRef.current?.wake();
  }, [aimAngleDeg]);

  useEffect(() => {
    powerPctRef.current = powerPct;
    actionsRef.current?.wake();
  }, [powerPct]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    perfEnabledRef.current = loungePerfMonitorEnabled;
    if (loungePerfMonitorEnabled) {
      actionsRef.current?.wake();
    }
  }, [loungePerfMonitorEnabled]);

  const handleAdminTogglePerfOverlay = async () => {
    if (!adminToken || togglingOverlay) return;
    const nextVal = !loungePerfMonitorEnabled;
    setTogglingOverlay(true);
    try {
      const res = await fetch('/api/admin/settings/perf-monitor', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ enabled: nextVal }),
      });
      if (res.ok) {
        const data = await res.json();
        setLoungePerfMonitorLocal(Boolean(data.loungePerfMonitorEnabled));
      }
    } catch {
      // Ignore transient network failure
    } finally {
      setTogglingOverlay(false);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Throwaway capability + software GL probe
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const probeGl =
        (probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
        (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
      if (!probeGl) {
        setWebglError('3D preview unavailable on this device. Book a real table below!');
        return;
      }
      const debugInfo = probeGl.getExtension('WEBGL_DEBUG_RENDERER_INFO');
      if (debugInfo) {
        const rendererName = String(
          probeGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
        );
        isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);
      }
      probeGl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      setWebglError('3D preview unavailable on this browser.');
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Could not initialize 3D lounge view.');
      return;
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 420);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#120D08');
    scene.fog = new THREE.Fog('#120D08', 9, 20);

    const pmrem = track(new THREE.PMREMGenerator(renderer));
    const roomEnv = track(new RoomEnvironment());
    const envTarget = track(pmrem.fromScene(roomEnv, 0.04));
    scene.environment = envTarget.texture;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 40);
    camera.position.set(...PRESET_VIEWS.overview.pos);

    const controls = track(new OrbitControls(camera, renderer.domElement));
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.target.set(...PRESET_VIEWS.overview.target);
    controls.minDistance = 2.0;
    controls.maxDistance = 8.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;

    // Warm/cool studio lighting rig (1 shadow caster with tight frustum)
    const hemiFill = new THREE.HemisphereLight('#FFF4DC', '#1E1610', 0.65);
    scene.add(hemiFill);

    const overheadSpot = new THREE.SpotLight('#FFF4DC', 46, 14, Math.PI / 3, 0.42, 1.5);
    overheadSpot.position.set(0, 4.1, 0);
    overheadSpot.castShadow = !isSoftwareGl;
    overheadSpot.shadow.mapSize.set(512, 512);
    overheadSpot.shadow.camera.near = 1.6;
    overheadSpot.shadow.camera.far = 5.6;
    overheadSpot.shadow.camera.fov = 56;
    overheadSpot.shadow.bias = -0.0005;
    overheadSpot.shadow.normalBias = 0.015;
    scene.add(overheadSpot);

    const rimFill = new THREE.DirectionalLight('#D8B467', 0.85);
    rimFill.position.set(-4, 3, -3);
    scene.add(rimFill);

    // Lounge floor + grounded radial contact shadow (2 draw calls)
    const floorGeo = track(new THREE.PlaneGeometry(24, 24));
    const floorMat = track(
      new THREE.MeshStandardMaterial({ color: '#1B140E', roughness: 0.9, metalness: 0.05 })
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    scene.add(floorMesh);

    const contactTex = track(createContactShadowTexture());
    const contactGeo = track(new THREE.PlaneGeometry(TABLE_HALF_W * 2.5, TABLE_HALF_L * 2.7));
    const contactMat = track(
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
      })
    );
    const contactShadow = new THREE.Mesh(contactGeo, contactMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const feltTex = track(createFeltTexture(maxAniso));
    const woodTex = track(createWoodTexture(maxAniso));

    // Composite Championship Pool Table Group — Batched Static Geometry (6 draw calls total)
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const feltGeo = track(new THREE.BoxGeometry(TABLE_HALF_W * 2, 0.08, TABLE_HALF_L * 2));
    const feltMat = track(
      new THREE.MeshStandardMaterial({
        map: feltTex,
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    const feltBed = new THREE.Mesh(feltGeo, feltMat);
    feltBed.position.y = FELT_SURFACE_Y - 0.04;
    feltBed.receiveShadow = true;
    tableGroup.add(feltBed);

    const railMat = track(
      new THREE.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.36,
        metalness: 0.08,
      })
    );
    const cushionMat = track(
      new THREE.MeshStandardMaterial({
        color: '#094E35',
        roughness: 0.82,
        metalness: 0.02,
      })
    );
    const brassMat = track(
      new THREE.MeshStandardMaterial({
        color: '#D4AF37',
        roughness: 0.22,
        metalness: 0.9,
      })
    );
    const pocketVoidMat = track(
      new THREE.MeshStandardMaterial({
        color: '#070605',
        roughness: 0.95,
        metalness: 0.0,
      })
    );

    // 1) Merge all static mahogany parts: apron + 4 legs + 4 outer rails -> 1 draw call
    const woodParts: THREE.BufferGeometry[] = [
      createTransformedPart(
        new THREE.BoxGeometry(TABLE_HALF_W * 2 + 0.38, 0.22, TABLE_HALF_L * 2 + 0.38),
        [0, FELT_SURFACE_Y - 0.16, 0]
      ),
    ];
    const legOffsets: Array<[number, number]> = [
      [-TABLE_HALF_W - 0.05, -TABLE_HALF_L - 0.05],
      [TABLE_HALF_W + 0.05, -TABLE_HALF_L - 0.05],
      [-TABLE_HALF_W - 0.05, TABLE_HALF_L + 0.05],
      [TABLE_HALF_W + 0.05, TABLE_HALF_L + 0.05],
    ];
    for (const [lx, lz] of legOffsets) {
      woodParts.push(
        createTransformedPart(
          new THREE.CylinderGeometry(0.11, 0.075, FELT_SURFACE_Y - 0.24, 16),
          [lx, (FELT_SURFACE_Y - 0.24) / 2 + 0.04, lz]
        )
      );
    }
    for (const signZ of [-1, 1]) {
      woodParts.push(
        createTransformedPart(
          new THREE.BoxGeometry(TABLE_HALF_W * 2 + 0.44, 0.11, 0.22),
          [0, FELT_SURFACE_Y + 0.02, signZ * (TABLE_HALF_L + 0.11)]
        )
      );
    }
    for (const signX of [-1, 1]) {
      woodParts.push(
        createTransformedPart(
          new THREE.BoxGeometry(0.22, 0.11, TABLE_HALF_L * 2 + 0.02),
          [signX * (TABLE_HALF_W + 0.11), FELT_SURFACE_Y + 0.02, 0]
        )
      );
    }
    const mergedWoodGeo = track(mergeStaticParts(woodParts));
    const woodMesh = new THREE.Mesh(mergedWoodGeo, railMat);
    woodMesh.receiveShadow = true;
    tableGroup.add(woodMesh);

    // 2) Merge all 4 felt cushions -> 1 draw call
    const cushionParts: THREE.BufferGeometry[] = [];
    for (const signZ of [-1, 1]) {
      cushionParts.push(
        createTransformedPart(
          new THREE.BoxGeometry(TABLE_HALF_W * 2 - 0.24, 0.06, 0.06),
          [0, FELT_SURFACE_Y + 0.03, signZ * (TABLE_HALF_L + 0.01)]
        )
      );
    }
    for (const signX of [-1, 1]) {
      cushionParts.push(
        createTransformedPart(
          new THREE.BoxGeometry(0.06, 0.06, TABLE_HALF_L * 2 - 0.24),
          [signX * (TABLE_HALF_W + 0.01), FELT_SURFACE_Y + 0.03, 0]
        )
      );
    }
    const mergedCushionGeo = track(mergeStaticParts(cushionParts));
    const cushionMesh = new THREE.Mesh(mergedCushionGeo, cushionMat);
    cushionMesh.receiveShadow = true;
    tableGroup.add(cushionMesh);

    // 3) Merge all 23 brass parts (4 feet + 12 sights + 6 pocket rims + lamp bar) -> 1 draw call
    const brassParts: THREE.BufferGeometry[] = [];
    for (const [lx, lz] of legOffsets) {
      brassParts.push(
        createTransformedPart(
          new THREE.CylinderGeometry(0.082, 0.088, 0.05, 16),
          [lx, 0.025, lz]
        )
      );
    }
    for (const sx of [-1.8, -1.2, -0.6, 0.6, 1.2, 1.8]) {
      for (const signZ of [-1, 1]) {
        brassParts.push(
          createTransformedPart(
            new THREE.BoxGeometry(0.03, 0.01, 0.015),
            [sx, FELT_SURFACE_Y + 0.078, signZ * (TABLE_HALF_L + 0.11)]
          )
        );
      }
    }
    for (const p of POCKETS) {
      brassParts.push(
        createTransformedPart(
          new THREE.TorusGeometry(0.115, 0.022, 10, 20),
          [p.x, FELT_SURFACE_Y + 0.016, p.z],
          [Math.PI / 2, 0, 0]
        )
      );
    }
    brassParts.push(
      createTransformedPart(
        new THREE.CylinderGeometry(0.025, 0.025, 2.4, 12),
        [0, 2.75, 0],
        [0, 0, Math.PI / 2]
      )
    );
    const mergedBrassGeo = track(mergeStaticParts(brassParts));
    tableGroup.add(new THREE.Mesh(mergedBrassGeo, brassMat));

    // 4) Merge all 6 pocket void cores -> 1 draw call
    const pocketParts: THREE.BufferGeometry[] = POCKETS.map((p) =>
      createTransformedPart(
        new THREE.CylinderGeometry(0.105, 0.105, 0.04, 16),
        [p.x, FELT_SURFACE_Y - 0.012, p.z]
      )
    );
    const mergedPocketGeo = track(mergeStaticParts(pocketParts));
    tableGroup.add(new THREE.Mesh(mergedPocketGeo, pocketVoidMat));

    // 5) Merge 3 lamp shades + 3 lamp bulbs -> 2 draw calls
    const shadeMat = track(
      new THREE.MeshStandardMaterial({
        color: '#1E3A2F',
        roughness: 0.35,
        metalness: 0.55,
        side: THREE.DoubleSide,
      })
    );
    const bulbMat = track(
      new THREE.MeshStandardMaterial({
        color: '#FFF4DC',
        emissive: new THREE.Color('#FFD89B'),
        emissiveIntensity: 1.5,
      })
    );
    const shadeParts = [-0.95, 0, 0.95].map((lx) =>
      createTransformedPart(new THREE.ConeGeometry(0.28, 0.22, 20, 1, true), [lx, 2.66, 0])
    );
    const bulbParts = [-0.95, 0, 0.95].map((lx) =>
      createTransformedPart(new THREE.SphereGeometry(0.06, 10, 10), [lx, 2.61, 0])
    );
    scene.add(new THREE.Mesh(track(mergeStaticParts(shadeParts)), shadeMat));
    scene.add(new THREE.Mesh(track(mergeStaticParts(bulbParts)), bulbMat));

    // 16 Billiard Balls rendered in 1 SINGLE InstancedMesh draw call (+ 4x4 texture atlas)
    const rackInit = initialRackPositions();
    const ballGeo = track(new THREE.SphereGeometry(BALL_RADIUS, 20, 16));
    const atlasOffsets = new Float32Array(rackInit.length * 2);
    for (let i = 0; i < rackInit.length; i += 1) {
      const id = rackInit[i].id;
      const col = id % 4;
      const row = Math.floor(id / 4);
      atlasOffsets[i * 2] = col * 0.25;
      atlasOffsets[i * 2 + 1] = (3 - row) * 0.25;
    }
    ballGeo.setAttribute('aAtlasOffset', new THREE.InstancedBufferAttribute(atlasOffsets, 2));

    const ballAtlasTex = track(createBallAtlasTexture(maxAniso));
    const ballMat = track(
      new THREE.MeshStandardMaterial({
        map: ballAtlasTex,
        roughness: 0.14,
        metalness: 0.06,
      })
    );
    ballMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aAtlasOffset;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv = vMapUv * vec2(0.25, 0.25) + aAtlasOffset;
          #endif`
        );
    };
    ballMat.customProgramCacheKey = () => 'billiard-ball-atlas-v1';

    const ballsInstanced = new THREE.InstancedMesh(ballGeo, ballMat, rackInit.length);
    ballsInstanced.castShadow = !isSoftwareGl;
    ballsInstanced.receiveShadow = false;
    ballsInstanced.frustumCulled = false;
    scene.add(ballsInstanced);

    const bodies: BallBody[] = rackInit.map((item, idx) => {
      const quat = new THREE.Quaternion();
      SCRATCH_BALL_POS.set(item.x, FELT_SURFACE_Y + BALL_RADIUS, item.z);
      SCRATCH_BALL_MATRIX.compose(SCRATCH_BALL_POS, quat, SCRATCH_BALL_SCALE);
      ballsInstanced.setMatrixAt(idx, SCRATCH_BALL_MATRIX);
      return {
        id: item.id,
        quat,
        pos: new THREE.Vector2(item.x, item.z),
        vel: new THREE.Vector2(0, 0),
        pocketed: false,
      };
    });
    ballsInstanced.instanceMatrix.needsUpdate = true;

    // Composite Ash-Wood Cue Stick merged into 1 multi-material mesh
    const cuePivot = new THREE.Group();
    scene.add(cuePivot);

    const cueShaftGroup = new THREE.Group();
    cuePivot.add(cueShaftGroup);

    const shaftMat = track(
      new THREE.MeshStandardMaterial({ color: '#E2C697', roughness: 0.35, metalness: 0.05 })
    );
    const tipMat = track(
      new THREE.MeshStandardMaterial({ color: '#1D4ED8', roughness: 0.9 })
    );
    const mergedCueGeo = track(
      mergeStaticParts(
        [
          createTransformedPart(
            new THREE.CylinderGeometry(0.011, 0.018, 1.35, 12),
            [-0.78, 0.075, 0],
            [0, 0, Math.PI / 2]
          ),
          createTransformedPart(
            new THREE.CylinderGeometry(0.018, 0.022, 0.55, 12),
            [-1.72, 0.14, 0],
            [0, 0, Math.PI / 2]
          ),
          createTransformedPart(
            new THREE.CylinderGeometry(0.011, 0.011, 0.024, 10),
            [-0.1, 0.028, 0],
            [0, 0, Math.PI / 2]
          ),
        ],
        true
      )
    );
    const cueStickMesh = new THREE.Mesh(mergedCueGeo, [shaftMat, railMat, tipMat]);
    cueShaftGroup.add(cueStickMesh);
    cueShaftGroup.rotation.z = -0.065;

    // Aim trajectory guideline
    const aimPositions = new Float32Array(6);
    const aimGeo = track(new THREE.BufferGeometry());
    aimGeo.setAttribute('position', new THREE.BufferAttribute(aimPositions, 3));
    const aimMat = track(
      new THREE.LineBasicMaterial({
        color: '#FCD34D',
        transparent: true,
        opacity: 0.72,
      })
    );
    const aimLine = new THREE.Line(aimGeo, aimMat);
    scene.add(aimLine);

    // Pre-compile GPU shaders upfront so break shots have zero first-frame compile stutter
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let lastClackAt = 0;
    const playClackSound = (gainVal: number) => {
      if (!soundEnabledRef.current) return;
      const now = performance.now();
      if (now - lastClackAt < 28) return;
      lastClackAt = now;
      try {
        if (!audioCtxRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.045);
        gain.gain.setValueAtTime(Math.min(0.24, Math.max(0.02, gainVal)), ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.055);
      } catch {
        // Ignore audio unlock error
      }
    };

    const syncBallInstances = () => {
      for (let i = 0; i < bodies.length; i += 1) {
        const b = bodies[i];
        if (b.pocketed) {
          SCRATCH_BALL_POS.set(0, -5, 0);
          SCRATCH_BALL_MATRIX.compose(SCRATCH_BALL_POS, b.quat, SCRATCH_ZERO_SCALE);
        } else {
          SCRATCH_BALL_POS.set(b.pos.x, FELT_SURFACE_Y + BALL_RADIUS, b.pos.y);
          SCRATCH_BALL_MATRIX.compose(SCRATCH_BALL_POS, b.quat, SCRATCH_BALL_SCALE);
        }
        ballsInstanced.setMatrixAt(i, SCRATCH_BALL_MATRIX);
      }
      ballsInstanced.instanceMatrix.needsUpdate = true;
    };

    // Animation, physics, FPS monitor & pure rAF WebGL lifecycle pacing state
    let cueStrikeAnim = 0;
    let smoothedAimDeg = aimAngleRef.current;
    let smoothedPullback = 0.04 + (powerPctRef.current / 100) * 0.24;
    let activeCameraPreset: CameraPreset | null = null;
    let lastMovingState = false;
    let lastPocketCount = 0;
    let orbitDampingFrames = 0;
    let isDisposed = false;
    let isInViewport = true;
    let rafId = 0;
    let lastTickTime = performance.now();
    let physicsAccumulator = 0;

    // FPS monitor counters (updated directly on DOM refs for zero React overhead)
    let fpsSampleFrames = 0;
    let fpsSampleStart = performance.now();
    let smoothedFps = 60;

    const updatePerfOverlay = (now: number, dtMs: number, active: boolean) => {
      if (!perfEnabledRef.current) return;
      fpsSampleFrames += 1;
      const elapsed = now - fpsSampleStart;
      if (elapsed >= 250 || !active) {
        const rawFps = elapsed > 0 ? Math.min(240, Math.round((fpsSampleFrames * 1000) / elapsed)) : 60;
        smoothedFps = active ? Math.round(smoothedFps * 0.35 + rawFps * 0.65) : rawFps;
        const shownFps = Math.max(1, smoothedFps);
        const calls = renderer.info.render.calls;

        if (fpsValueRef.current) {
          fpsValueRef.current.textContent = `${shownFps} FPS`;
          fpsValueRef.current.className =
            shownFps >= 50
              ? 'font-bold text-emerald-400 tabular-nums'
              : shownFps >= 30
              ? 'font-bold text-amber-400 tabular-nums'
              : 'font-bold text-rose-400 tabular-nums';
        }
        if (perfMetaRef.current) {
          perfMetaRef.current.textContent = `${dtMs.toFixed(1)}ms · ${calls} draws${active ? '' : ' · idle'}`;
        }

        fpsSampleFrames = 0;
        fpsSampleStart = now;
      }
    };

    const cancelScheduled = () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const scheduleNextFrame = () => {
      if (isDisposed || !isInViewport || document.hidden || rafId !== 0) return;
      rafId = window.requestAnimationFrame(tick);
    };

    const wakeRender = () => {
      if (isDisposed || !isInViewport || document.hidden) return;
      orbitDampingFrames = Math.max(orbitDampingFrames, isSoftwareGl ? 3 : 18);
      if (rafId === 0) {
        lastTickTime = performance.now();
        fpsSampleStart = lastTickTime;
        fpsSampleFrames = 0;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stepPhysics = (subDt: number) => {
      const damping = Math.exp(-1.12 * subDt);
      const maxX = TABLE_HALF_W - BALL_RADIUS - 0.025;
      const maxZ = TABLE_HALF_L - BALL_RADIUS - 0.025;

      for (let i = 0; i < bodies.length; i += 1) {
        const b = bodies[i];
        if (b.pocketed) continue;

        const speedSq = b.vel.lengthSq();
        if (speedSq > 0.0004) {
          b.pos.x += b.vel.x * subDt;
          b.pos.y += b.vel.y * subDt;

          SCRATCH_MOVE_DIR.set(b.vel.x * subDt, 0, b.vel.y * subDt);
          const dist = SCRATCH_MOVE_DIR.length();
          if (dist > 0.00001) {
            SCRATCH_MOVE_DIR.divideScalar(dist);
            SCRATCH_ROLL_AXIS.crossVectors(SCRATCH_UP, SCRATCH_MOVE_DIR).normalize();
            SCRATCH_QUAT.setFromAxisAngle(SCRATCH_ROLL_AXIS, dist / BALL_RADIUS);
            b.quat.premultiply(SCRATCH_QUAT);
          }

          b.vel.multiplyScalar(damping);
          if (b.vel.lengthSq() < 0.0006) {
            b.vel.set(0, 0);
          }
        }

        let captured = false;
        for (let pIdx = 0; pIdx < POCKETS.length; pIdx += 1) {
          const p = POCKETS[pIdx];
          const dx = b.pos.x - p.x;
          const dz = b.pos.y - p.z;
          if (dx * dx + dz * dz < p.r * p.r) {
            b.pocketed = true;
            b.vel.set(0, 0);
            captured = true;
            playClackSound(0.09);
            break;
          }
        }
        if (captured) continue;

        if (b.pos.x > maxX) {
          b.pos.x = maxX;
          b.vel.x = -Math.abs(b.vel.x) * 0.84;
        } else if (b.pos.x < -maxX) {
          b.pos.x = -maxX;
          b.vel.x = Math.abs(b.vel.x) * 0.84;
        }
        if (b.pos.y > maxZ) {
          b.pos.y = maxZ;
          b.vel.y = -Math.abs(b.vel.y) * 0.84;
        } else if (b.pos.y < -maxZ) {
          b.pos.y = -maxZ;
          b.vel.y = Math.abs(b.vel.y) * 0.84;
        }
      }

      // Elastic sphere-sphere collisions with 2 positional relaxation passes
      const minDist = BALL_RADIUS * 2;
      const minDistSq = minDist * minDist;
      for (let pass = 0; pass < 2; pass += 1) {
        for (let i = 0; i < bodies.length; i += 1) {
          const a = bodies[i];
          if (a.pocketed) continue;
          for (let j = i + 1; j < bodies.length; j += 1) {
            const b = bodies[j];
            if (b.pocketed) continue;
            SCRATCH_DELTA.subVectors(b.pos, a.pos);
            const distSq = SCRATCH_DELTA.lengthSq();
            if (distSq > 0.0000001 && distSq < minDistSq) {
              const dist = Math.sqrt(distSq);
              SCRATCH_NORMAL.copy(SCRATCH_DELTA).divideScalar(dist);
              const overlap = (minDist - dist) * 0.5;
              a.pos.addScaledVector(SCRATCH_NORMAL, -overlap);
              b.pos.addScaledVector(SCRATCH_NORMAL, overlap);

              if (pass === 0) {
                SCRATCH_REL_VEL.subVectors(a.vel, b.vel);
                const vn = SCRATCH_REL_VEL.dot(SCRATCH_NORMAL);
                if (vn > 0) {
                  const impulse = vn * 0.96;
                  a.vel.addScaledVector(SCRATCH_NORMAL, -impulse);
                  b.vel.addScaledVector(SCRATCH_NORMAL, impulse);
                  if (impulse > 0.35) {
                    playClackSound(Math.min(0.18, impulse * 0.04));
                  }
                }
              }
            }
          }
        }
      }
    };

    const resetRack = () => {
      const nextLayout = initialRackPositions();
      for (let i = 0; i < bodies.length; i += 1) {
        const b = bodies[i];
        const init = nextLayout[i];
        b.pos.set(init.x, init.z);
        b.vel.set(0, 0);
        b.pocketed = false;
        b.quat.identity();
      }
      syncBallInstances();
      if (!isSoftwareGl) {
        renderer.shadowMap.needsUpdate = true;
      }
      physicsAccumulator = 0;
      cueStrikeAnim = 0;
      lastMovingState = false;
      (window as unknown as { __hs3dRolling?: boolean }).__hs3dRolling = false;
      lastPocketCount = 0;
      setBallsMoving(false);
      setPocketedCount(0);
      wakeRender();
    };

    const triggerShot = () => {
      const cue = bodies[0];
      if (!cue || cue.pocketed) return;
      const anyMoving = bodies.some((b) => !b.pocketed && b.vel.lengthSq() > 0.0004);
      if (anyMoving) return;

      const rad = (aimAngleRef.current * Math.PI) / 180;
      const speed = 1.8 + (powerPctRef.current / 100) * 5.2;
      cue.vel.set(Math.cos(rad) * speed, Math.sin(rad) * speed);
      cueStrikeAnim = 0.22;
      playClackSound(0.18);
      wakeRender();
    };

    const setCameraPreset = (nextPreset: CameraPreset) => {
      setPreset(nextPreset);
      if (isSoftwareGl) {
        const cfg = PRESET_VIEWS[nextPreset];
        camera.position.set(...cfg.pos);
        controls.target.set(...cfg.target);
        controls.update();
        activeCameraPreset = null;
      } else {
        activeCameraPreset = nextPreset;
      }
      wakeRender();
    };

    actionsRef.current = {
      shoot: triggerShot,
      rerack: resetRack,
      setCameraPreset,
      wake: wakeRender,
    };

    const onControlsStart = () => {
      activeCameraPreset = null;
      wakeRender();
    };
    const onControlsChange = () => {
      orbitDampingFrames = Math.max(orbitDampingFrames, isSoftwareGl ? 3 : 18);
      if (rafId === 0) {
        wakeRender();
      }
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('change', onControlsChange);

    let resizeTimer = 0;
    const handleResize = () => {
      if (!container || isDisposed) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      wakeRender();
    };
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(handleResize, 100);
    });
    resizeObserver.observe(container);

    let intersectionTimer = 0;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        window.clearTimeout(intersectionTimer);
        intersectionTimer = window.setTimeout(() => {
          const visible = entries.some((entry) => entry.isIntersecting);
          isInViewport = visible;
          if (visible) {
            wakeRender();
          } else {
            cancelScheduled();
          }
        }, 80);
      },
      { rootMargin: '60px', threshold: 0.02 }
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelScheduled();
      } else {
        wakeRender();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    function tick() {
      rafId = 0;
      if (isDisposed || !isInViewport || document.hidden) return;

      const now = performance.now();
      const rawDtMs = Math.max(0.1, now - lastTickTime);
      const dt = Math.min(Math.max(rawDtMs / 1000, 0.001), MAX_FRAME_DT);
      lastTickTime = now;

      const hasVelocity = bodies.some((b) => !b.pocketed && b.vel.lengthSq() > 0.0004);
      let transformsDirty = false;
      if (hasVelocity) {
        physicsAccumulator += dt;
        let steps = 0;
        while (physicsAccumulator >= FIXED_SUBSTEP && steps < MAX_SUBSTEPS) {
          stepPhysics(FIXED_SUBSTEP);
          physicsAccumulator -= FIXED_SUBSTEP;
          steps += 1;
        }
        if (steps >= MAX_SUBSTEPS) {
          physicsAccumulator = 0;
        }
        transformsDirty = steps > 0;
      } else {
        physicsAccumulator = 0;
      }

      let activeCount = 0;
      let pocketedTotal = 0;
      for (let i = 0; i < bodies.length; i += 1) {
        const b = bodies[i];
        if (b.pocketed) {
          if (b.id > 0) pocketedTotal += 1;
        } else if (b.vel.lengthSq() > 0.0004) {
          activeCount += 1;
        }
      }

      const cue = bodies[0];
      if (cue && cue.pocketed && activeCount === 0) {
        cue.pocketed = false;
        cue.vel.set(0, 0);
        cue.pos.set(-1.35, 0);
        cue.quat.identity();
        transformsDirty = true;
      }

      if (transformsDirty) {
        syncBallInstances();
        if (!isSoftwareGl) {
          renderer.shadowMap.needsUpdate = true;
        }
      }

      const movingNow = activeCount > 0;
      if (movingNow !== lastMovingState) {
        lastMovingState = movingNow;
        (window as unknown as { __hs3dRolling?: boolean }).__hs3dRolling = movingNow;
        setBallsMoving(movingNow);
      }
      if (pocketedTotal !== lastPocketCount) {
        lastPocketCount = pocketedTotal;
        setPocketedCount(pocketedTotal);
      }

      // Smooth exponential cue aim & pullback damping
      let cueAimTransitioning = false;
      if (cue && !cue.pocketed && !movingNow) {
        cuePivot.visible = true;
        aimLine.visible = true;

        const targetAim = aimAngleRef.current;
        if (Math.abs(targetAim - smoothedAimDeg) > 0.02) {
          smoothedAimDeg = THREE.MathUtils.damp(smoothedAimDeg, targetAim, 24, dt);
          cueAimTransitioning = true;
        } else {
          smoothedAimDeg = targetAim;
        }

        const rad = (smoothedAimDeg * Math.PI) / 180;
        cuePivot.position.set(cue.pos.x, FELT_SURFACE_Y + BALL_RADIUS, cue.pos.y);
        cuePivot.rotation.y = -rad;

        if (cueStrikeAnim > 0) {
          cueStrikeAnim = Math.max(0, cueStrikeAnim - dt * 1.4);
          cueShaftGroup.position.x = -cueStrikeAnim;
          cueAimTransitioning = true;
        } else {
          const targetPullback = 0.04 + (powerPctRef.current / 100) * 0.24;
          if (Math.abs(targetPullback - smoothedPullback) > 0.0005) {
            smoothedPullback = THREE.MathUtils.damp(smoothedPullback, targetPullback, 22, dt);
            cueAimTransitioning = true;
          } else {
            smoothedPullback = targetPullback;
          }
          cueShaftGroup.position.x = -smoothedPullback;
        }

        const posAttr = aimGeo.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(0, cue.pos.x, FELT_SURFACE_Y + BALL_RADIUS, cue.pos.y);
        posAttr.setXYZ(
          1,
          cue.pos.x + Math.cos(rad) * 1.65,
          FELT_SURFACE_Y + BALL_RADIUS,
          cue.pos.y + Math.sin(rad) * 1.65
        );
        posAttr.needsUpdate = true;
      } else {
        cuePivot.visible = false;
        aimLine.visible = false;
        if (cueStrikeAnim > 0) {
          cueStrikeAnim = 0;
        }
      }

      // Smooth exponential camera preset glide (canceled on user drag)
      let camTransitioning = false;
      if (activeCameraPreset) {
        const cfg = PRESET_VIEWS[activeCameraPreset];
        SCRATCH_CAM_TARGET.set(...cfg.pos);
        SCRATCH_LOOK_TARGET.set(...cfg.target);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, SCRATCH_CAM_TARGET.x, 9, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, SCRATCH_CAM_TARGET.y, 9, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, SCRATCH_CAM_TARGET.z, 9, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, SCRATCH_LOOK_TARGET.x, 9, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, SCRATCH_LOOK_TARGET.y, 9, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, SCRATCH_LOOK_TARGET.z, 9, dt);

        if (
          camera.position.distanceToSquared(SCRATCH_CAM_TARGET) < 0.0004 &&
          controls.target.distanceToSquared(SCRATCH_LOOK_TARGET) < 0.0004
        ) {
          camera.position.copy(SCRATCH_CAM_TARGET);
          controls.target.copy(SCRATCH_LOOK_TARGET);
          activeCameraPreset = null;
        } else {
          camTransitioning = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (orbitDampingFrames > 0) {
        orbitDampingFrames -= 1;
      }

      const needsNextFrame =
        movingNow ||
        cueAimTransitioning ||
        camTransitioning ||
        orbitDampingFrames > 0;

      updatePerfOverlay(now, rawDtMs, needsNextFrame);

      if (needsNextFrame) {
        scheduleNextFrame();
      }
    }

    wakeRender();

    return () => {
      isDisposed = true;
      (window as unknown as { __hs3dRolling?: boolean }).__hs3dRolling = false;
      window.clearTimeout(resizeTimer);
      window.clearTimeout(intersectionTimer);
      cancelScheduled();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      for (const item of disposables) {
        item.dispose();
      }
      renderer.dispose();
      renderer.getContext()?.getExtension('WEBGL_lose_context')?.loseContext();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglError) {
    return (
      <div className="rounded-2xl bg-[#1F1710] border border-[#3D2F20] p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-[#F0E6D8]">{webglError}</p>
        {onBookPool && (
          <button
            type="button"
            onClick={onBookPool}
            className="px-4 min-h-[40px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            Book Real 8-Ball Slot
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#C2AD93] dark:border-[#3D2F20] bg-[#120D08] shadow-xl">
      {/* Top Status & Camera Presets Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#1B140E] border-b border-[#3D2F20] text-xs text-[#F0E6D8]">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-[#D8B467]">
            <Target className="w-3.5 h-3.5" />
            <span>Interactive 3D 8-Ball Table</span>
          </span>
          <span className="text-[11px] text-[#D4C5B3] tabular-nums">
            · Pocketed: <strong className="text-emerald-400">{pocketedCount}/15</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['overview', 'rack', 'top'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => actionsRef.current?.setCameraPreset(p)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border cursor-pointer ${
                preset === p
                  ? 'bg-[#8D6613] border-[#D8B467] text-[#FAF2E6]'
                  : 'bg-[#251C14] border-[#3D2F20] text-[#D4C5B3] hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="p-1.5 rounded-lg bg-[#251C14] border border-[#3D2F20] text-[#D4C5B3] hover:text-white cursor-pointer"
            aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#D8B467]" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          {adminToken && (
            <button
              type="button"
              disabled={togglingOverlay}
              onClick={handleAdminTogglePerfOverlay}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                loungePerfMonitorEnabled
                  ? 'bg-emerald-900 border-emerald-500 text-emerald-200'
                  : 'bg-[#251C14] border-[#3D2F20] text-[#D4C5B3] hover:text-white'
              }`}
              aria-label="Toggle FPS monitor"
              title="Admin: Toggle FPS monitor overlay"
            >
              <Activity className="w-3 h-3" />
              <span>FPS</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setControlsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#251C14] border border-[#3D2F20] text-[#F0E6D8] text-[10px] font-bold uppercase tracking-wider hover:border-[#D8B467] cursor-pointer"
          >
            <span>{controlsOpen ? 'Hide Controls' : 'Show Controls'}</span>
            {controlsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Dedicated WebGL Viewport + Non-Intrusive Admin FPS Overlay */}
      <div className="relative">
        <div
          ref={mountRef}
          data-lenis-prevent
          className="w-full h-[320px] sm:h-[400px] lg:h-[440px] touch-none cursor-grab active:cursor-grabbing"
          aria-label="Interactive 3D 8-Ball Pool Table canvas"
        />
        {loungePerfMonitorEnabled && (
          <div
            role="status"
            aria-label="3D Performance Monitor"
            className="pointer-events-none select-none absolute top-2.5 left-2.5 px-2.5 py-1.5 rounded-lg bg-[rgba(20,16,11,0.88)] border border-[#3D2F20] text-[10px] font-mono text-[#F0E6D8] flex items-center gap-2 shadow-sm"
          >
            <Activity className="w-3 h-3 text-[#D8B467] shrink-0" />
            <span ref={fpsValueRef} className="font-bold text-emerald-400 tabular-nums">
              60 FPS
            </span>
            <span ref={perfMetaRef} className="text-[#D4C5B3] tabular-nums">
              16.7ms · 11 draws
            </span>
          </div>
        )}
      </div>

      {/* Collapsible Bottom Control Dock (Solid surface, no backdrop-filter over WebGL) */}
      {controlsOpen && (
        <div className="px-4 py-3 bg-[#1B140E] border-t border-[#3D2F20] grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs text-[#F0E6D8]">
          <div className="md:col-span-4 space-y-1">
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-[#D4C5B3]">Aim Angle</span>
              <span className="font-mono text-[#D8B467] tabular-nums">{aimAngleDeg}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={aimAngleDeg}
              onChange={(e) => {
                const next = Number(e.target.value);
                aimAngleRef.current = next;
                actionsRef.current?.wake();
                setAimAngleDeg(next);
              }}
              className="w-full accent-[#D8B467] cursor-pointer"
              aria-label="Aim Angle"
            />
          </div>

          <div className="md:col-span-3 space-y-1">
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-[#D4C5B3]">Shot Power</span>
              <span className="font-mono text-[#D8B467] tabular-nums">{powerPct}%</span>
            </div>
            <input
              type="range"
              min={15}
              max={100}
              step={1}
              value={powerPct}
              onChange={(e) => {
                const next = Number(e.target.value);
                powerPctRef.current = next;
                actionsRef.current?.wake();
                setPowerPct(next);
              }}
              className="w-full accent-[#D8B467] cursor-pointer"
              aria-label="Shot Power"
            />
          </div>

          <div className="md:col-span-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={ballsMoving}
              onClick={() => actionsRef.current?.shoot()}
              className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl bg-[#8D6613] hover:bg-[#73520D] disabled:opacity-50 text-[#FAF2E6] font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{ballsMoving ? 'Rolling...' : 'Shoot Break'}</span>
            </button>

            <button
              type="button"
              onClick={() => actionsRef.current?.rerack()}
              className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#251C14] border border-[#3D2F20] hover:border-[#D8B467] text-[#F0E6D8] font-semibold text-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#D8B467]" />
              <span>Re-Rack</span>
            </button>

            {onBookPool && (
              <button
                type="button"
                onClick={onBookPool}
                className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#F0E6D8] hover:bg-white text-[#14100B] font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                <span>Reserve Table</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
