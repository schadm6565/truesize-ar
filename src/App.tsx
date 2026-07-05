import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Edges, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import {
  Box,
  Check,
  Crosshair,
  Frame,
  Image as ImageIcon,
  Package,
  Ruler,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Unit } from "./types/product";

const STORAGE_KEY = "truesize-ar-method-v3";

type PreviewMethod = "flat" | "box" | "model";
type Placement = "floor" | "wall";
type DimensionField = "width" | "height" | "depth";

type DraftPreview = {
  id: string;
  name: string;
  previewMethod: PreviewMethod;
  placement: Placement;
  width: number;
  height: number;
  depth: number;
  unit: Unit;
  image: string;
  imageLabel: string;
  frameEnabled: boolean;
  glbName?: string;
};

type Xr8Like = {
  addCameraPipelineModules: (modules: unknown[]) => void;
  run: (options: { canvas: HTMLCanvasElement; allowedDevices?: unknown }) => void;
  stop?: () => void;
  loadChunk?: (chunk: "slam") => Promise<void>;
  GlTextureRenderer?: { pipelineModule: () => unknown };
  Threejs?: {
    pipelineModule: () => unknown;
    xrScene: () => {
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      renderer: THREE.WebGLRenderer;
    };
  };
  XrController?: {
    pipelineModule: () => unknown;
    updateCameraProjectionMatrix: (options: {
      origin: THREE.Vector3;
      facing: THREE.Quaternion;
    }) => void;
    recenter?: () => void;
  };
  XrConfig?: { device: () => { ANY: unknown } };
};

type PipelineGlobal = {
  pipelineModule?: () => unknown;
};

declare global {
  interface Window {
    XR8?: Xr8Like;
    XRExtras?: {
      FullWindowCanvas?: PipelineGlobal;
      Loading?: PipelineGlobal;
      RuntimeError?: PipelineGlobal;
    };
    LandingPage?: PipelineGlobal;
    THREE?: typeof THREE;
  }
}

const methodLabels: Record<PreviewMethod, string> = {
  flat: "Flat image",
  box: "Size box",
  model: "3D model",
};

const methodDescriptions: Record<PreviewMethod, string> = {
  flat: "Use an uploaded image for flat products such as mats, prints, signs, and decals.",
  box: "Use a true-size box for bulky products where an image is not enough.",
  model: "Upload a GLB and scale it for floor or wall placement.",
};

const methodIcons: Record<PreviewMethod, typeof Box> = {
  flat: ImageIcon,
  box: Box,
  model: Package,
};

const placementLabels: Record<Placement, string> = {
  floor: "Floor",
  wall: "Wall",
};

const defaultPreview: DraftPreview = {
  id: "truesize-preview",
  name: "Product preview",
  previewMethod: "flat",
  placement: "wall",
  width: 70,
  height: 100,
  depth: 4,
  unit: "cm",
  image: "/placeholder-product.svg",
  imageLabel: "",
  frameEnabled: true,
};

function loadPreview() {
  if (typeof window === "undefined") return defaultPreview;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultPreview;
    return { ...defaultPreview, ...(JSON.parse(stored) as Partial<DraftPreview>) };
  } catch {
    return defaultPreview;
  }
}

function toCentimeters(value: number, unit: Unit) {
  return unit === "in" ? value * 2.54 : value;
}

function getDimensionsInCm(product: DraftPreview) {
  return {
    width: toCentimeters(product.width, product.unit),
    height: toCentimeters(product.height, product.unit),
    depth: toCentimeters(product.depth || 1, product.unit),
  };
}

function getSceneDimensionsInMeters(product: DraftPreview) {
  const dimensions = getDimensionsInCm(product);

  if (product.previewMethod === "flat" && product.placement === "floor") {
    return {
      width: Math.max(dimensions.width / 100, 0.08),
      height: 0.025,
      depth: Math.max(dimensions.height / 100, 0.08),
    };
  }

  if (product.previewMethod === "flat") {
    return {
      width: Math.max(dimensions.width / 100, 0.08),
      height: Math.max(dimensions.height / 100, 0.08),
      depth: 0.035,
    };
  }

  return {
    width: Math.max(dimensions.width / 100, 0.08),
    height: Math.max(dimensions.height / 100, 0.08),
    depth: Math.max(dimensions.depth / 100, 0.08),
  };
}

function formatDimension(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function secondDimensionLabel(product: DraftPreview) {
  return product.previewMethod === "flat" && product.placement === "floor" ? "Length" : "Height";
}

function dimensionsLabel(product: DraftPreview) {
  const secondLabel = product.previewMethod === "flat" && product.placement === "floor" ? "L" : "H";
  const pieces = [`W ${formatDimension(product.width)}`, `${secondLabel} ${formatDimension(product.height)}`];
  if (product.previewMethod !== "flat") pieces.push(`D ${formatDimension(product.depth)}`);
  return `${pieces.join(" x ")} ${product.unit}`;
}

function isEightWallReady() {
  return Boolean(
    window.XR8?.GlTextureRenderer &&
      window.XR8?.Threejs &&
      window.XR8?.XrController,
  );
}

function defaultsFor(method: PreviewMethod, placement: Placement): Partial<DraftPreview> {
  if (method === "flat" && placement === "wall") {
    return {
      name: "Product preview",
      width: 70,
      height: 100,
      depth: 4,
      image: "/placeholder-product.svg",
      imageLabel: "",
      frameEnabled: true,
    };
  }

  if (method === "flat" && placement === "floor") {
    return {
      name: "Product preview",
      width: 90,
      height: 60,
      depth: 2,
      image: "/placeholder-product.svg",
      imageLabel: "",
      frameEnabled: false,
    };
  }

  if (method === "box" && placement === "wall") {
    return {
      name: "Product preview",
      width: 90,
      height: 70,
      depth: 32,
      frameEnabled: false,
    };
  }

  if (method === "box" && placement === "floor") {
    return {
      name: "Product preview",
      width: 214,
      height: 82,
      depth: 92,
      frameEnabled: false,
    };
  }

  return {
    name: "Product preview",
    width: 80,
    height: 80,
    depth: 80,
    frameEnabled: false,
  };
}

function App() {
  const [product, setProduct] = useState<DraftPreview>(loadPreview);
  const [saved, setSaved] = useState(false);
  const [arModalOpen, setArModalOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(product));
  }, [product]);

  const updateProduct = (patch: Partial<DraftPreview>) => {
    setProduct((current) => ({ ...current, ...patch }));
  };

  const setPreviewMethod = (previewMethod: PreviewMethod) => {
    setProduct((current) => ({
      ...current,
      ...defaultsFor(previewMethod, current.placement),
      previewMethod,
    }));
  };

  const setPlacement = (placement: Placement) => {
    setProduct((current) => ({
      ...current,
      ...defaultsFor(current.previewMethod, placement),
      placement,
    }));
  };

  const updateDimension = (field: DimensionField, value: string) => {
    const parsed = Number(value);
    updateProduct({ [field]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      updateProduct({
        image: String(reader.result),
        imageLabel: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGlbUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateProduct({ glbName: file.name });
  };

  const savePreview = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const openAr = () => {
    if (isEightWallReady()) {
      setArModalOpen(true);
      return;
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>TrueSize AR</strong>
            <small>True-size product previews</small>
          </span>
        </div>
      </header>

      <main className="simple-shell">
        <section className="intro-panel">
          <div>
            <p className="eyebrow">Configure</p>
            <h1>Create a true-size product preview</h1>
          </div>
          <p>
            Choose how the product should be represented, then place it on the floor or wall.
          </p>
        </section>

        <section className="mode-grid" aria-label="Preview method">
          {(Object.keys(methodLabels) as PreviewMethod[]).map((method) => {
            const MethodIcon = methodIcons[method];
            return (
              <button
                className={`mode-card ${product.previewMethod === method ? "active" : ""}`}
                key={method}
                onClick={() => setPreviewMethod(method)}
                type="button"
              >
                <span className="mode-icon">
                  <MethodIcon size={22} />
                </span>
                <span>
                  <strong>{methodLabels[method]}</strong>
                  <small>{methodDescriptions[method]}</small>
                </span>
              </button>
            );
          })}
        </section>

        <section className="workspace-grid">
          <ConfiguratorPanel
            product={product}
            saved={saved}
            onGlbUpload={handleGlbUpload}
            onImageUpload={handleImageUpload}
            onPlacementChange={setPlacement}
            onSave={savePreview}
            onUpdate={updateProduct}
            onUpdateDimension={updateDimension}
          />

          <PreviewPanel
            product={product}
            onOpenAr={openAr}
          />
        </section>
      </main>

      {arModalOpen && (
        <EightWallArModal
          product={product}
          onClose={() => {
            stopEightWallSession();
            setArModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ConfiguratorPanel({
  product,
  saved,
  onGlbUpload,
  onImageUpload,
  onPlacementChange,
  onSave,
  onUpdate,
  onUpdateDimension,
}: {
  product: DraftPreview;
  saved: boolean;
  onGlbUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlacementChange: (placement: Placement) => void;
  onSave: () => void;
  onUpdate: (patch: Partial<DraftPreview>) => void;
  onUpdateDimension: (field: DimensionField, value: string) => void;
}) {
  return (
    <section className="tool-panel config-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Details</p>
          <h2>{methodLabels[product.previewMethod]}</h2>
        </div>
        <span className="preview-chip">
          <Ruler size={14} />
          {dimensionsLabel(product)}
        </span>
      </div>

      <div className="form-stack">
        <div className="field-group">
          <span className="field-heading">Placement</span>
          <div className="placement-control">
            {(Object.keys(placementLabels) as Placement[]).map((placement) => {
              const PlacementIcon = placement === "wall" ? Frame : Box;
              return (
                <button
                  className={`placement-button ${product.placement === placement ? "active" : ""}`}
                  key={placement}
                  onClick={() => onPlacementChange(placement)}
                  type="button"
                >
                  <PlacementIcon size={17} />
                  {placementLabels[placement]}
                </button>
              );
            })}
          </div>
        </div>

        <label className="field-label">
          <span>Product name</span>
          <input
            value={product.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
            type="text"
          />
        </label>

        <div className="field-group">
          <div className="field-heading-row">
            <span className="field-heading">Dimensions</span>
            <select
              aria-label="Unit"
              value={product.unit}
              onChange={(event) => onUpdate({ unit: event.target.value as Unit })}
            >
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>

          <div className="dimension-grid">
            <DimensionInput
              label="Width"
              value={product.width}
              onChange={(value) => onUpdateDimension("width", value)}
            />
            <DimensionInput
              label={secondDimensionLabel(product)}
              value={product.height}
              onChange={(value) => onUpdateDimension("height", value)}
            />
            {product.previewMethod !== "flat" && (
              <DimensionInput
                label="Depth"
                value={product.depth}
                onChange={(value) => onUpdateDimension("depth", value)}
              />
            )}
          </div>
        </div>

        {product.previewMethod === "flat" && (
          <div className="field-group">
            <span className="field-heading">Product image</span>
            <label className="upload-control">
              <Upload size={17} />
              <span>{product.imageLabel ? `Using ${product.imageLabel}` : "Upload product image"}</span>
              <input accept="image/*" onChange={onImageUpload} type="file" />
            </label>
          </div>
        )}

        {product.previewMethod === "box" && (
          <div className="method-note">
            <Box size={17} />
            <span>No image needed. This preview uses a true-size footprint and transparent volume.</span>
          </div>
        )}

        {product.previewMethod === "model" && (
          <div className="field-group">
            <span className="field-heading">3D model</span>
            <label className="upload-control glb-upload">
              <Package size={17} />
              <span>{product.glbName ? product.glbName : "Upload GLB model"}</span>
              <input accept=".glb,model/gltf-binary" onChange={onGlbUpload} type="file" />
            </label>
          </div>
        )}

        {product.previewMethod === "flat" && product.placement === "wall" && (
          <label className="toggle-row">
            <span>
              <strong>Frame / border</strong>
              <small>Best for flat wall pieces and mounted images.</small>
            </span>
            <input
              checked={product.frameEnabled}
              onChange={(event) => onUpdate({ frameEnabled: event.target.checked })}
              type="checkbox"
            />
          </label>
        )}
      </div>

      <div className="form-actions">
        <button className="primary-action" type="button" onClick={onSave}>
          <Check size={17} />
          {saved ? "Saved" : "Save preview"}
        </button>
      </div>
    </section>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dimension-input">
      <span>{label}</span>
      <input
        min={0}
        step={1}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PreviewPanel({
  product,
  onOpenAr,
}: {
  product: DraftPreview;
  onOpenAr: () => void;
}) {
  return (
    <section className="tool-panel preview-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{product.name}</h2>
        </div>
        <span className="preview-chip">
          <Ruler size={14} />
          {dimensionsLabel(product)}
        </span>
      </div>

      <div className="preview-stage">
        <TrueSizeScene product={product} />
      </div>

      <div className="preview-actions">
        <button className="primary-action wide" type="button" onClick={onOpenAr}>
          <Smartphone size={18} />
          View in your space
        </button>
      </div>
    </section>
  );
}

function TrueSizeScene({ product }: { product: DraftPreview }) {
  return (
    <Canvas className="three-canvas" dpr={[1, 2]} shadows>
      <SceneContent product={product} />
    </Canvas>
  );
}

function SceneContent({ product }: { product: DraftPreview }) {
  const { size } = useThree();
  const meters = getSceneDimensionsInMeters(product);
  const maxDimension = Math.max(meters.width, meters.height, meters.depth);
  const narrowCanvas = size.width < 460;
  const maxScale = narrowCanvas ? 0.98 : 1.25;
  const fitScale = Math.min(maxScale, (narrowCanvas ? 2.15 : 2.9) / maxDimension);
  const hasWallBackdrop = product.placement === "wall";

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={narrowCanvas ? [4.6, 3.1, 5.25] : [3.8, 2.7, 4.3]}
        fov={narrowCanvas ? 48 : 43}
      />
      <ambientLight intensity={0.7} />
      <directionalLight castShadow intensity={1.4} position={[3.5, 4.6, 2.4]} />
      <pointLight intensity={0.85} position={[-3, 2, -2]} />
      <group
        scale={fitScale}
        rotation={[0, narrowCanvas ? -0.2 : -0.38, 0]}
        position={[0, narrowCanvas ? -0.42 : -0.55, 0]}
      >
        <gridHelper args={[5.2, 13, "#9db3ad", "#e2e9e5"]} />
        {hasWallBackdrop && <WallBackdrop dimensions={meters} />}
        {product.previewMethod === "flat" && product.placement === "floor" && (
          <FlatFloorImage product={product} dimensions={meters} />
        )}
        {product.previewMethod === "flat" && product.placement === "wall" && (
          <FlatWallImage product={product} dimensions={meters} />
        )}
        {product.previewMethod === "box" && (
          <SizeBox dimensions={meters} wallMounted={product.placement === "wall"} />
        )}
        {product.previewMethod === "model" && (
          <ModelPlaceholder dimensions={meters} wallMounted={product.placement === "wall"} />
        )}
      </group>
      <OrbitControls
        autoRotate={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2.8}
        maxDistance={7}
      />
    </>
  );
}

function WallBackdrop({
  dimensions,
}: {
  dimensions: { width: number; height: number; depth: number };
}) {
  return (
    <mesh position={[0, dimensions.height / 2 + 0.3, -dimensions.depth / 2 - 0.035]}>
      <planeGeometry args={[Math.max(dimensions.width * 1.6, 1.5), Math.max(dimensions.height * 1.7, 1.5)]} />
      <meshStandardMaterial color="#ede6d8" roughness={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

function FlatFloorImage({
  product,
  dimensions,
}: {
  product: DraftPreview;
  dimensions: { width: number; height: number; depth: number };
}) {
  const texture = useLoader(THREE.TextureLoader, product.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshStandardMaterial map={texture} roughness={0.68} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]}>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshBasicMaterial color="#1f4d45" wireframe />
      </mesh>
    </group>
  );
}

function FlatWallImage({
  product,
  dimensions,
}: {
  product: DraftPreview;
  dimensions: { width: number; height: number; depth: number };
}) {
  const texture = useLoader(THREE.TextureLoader, product.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const wallZ = -dimensions.depth / 2 - 0.035;
  const artZ = wallZ + 0.018;
  const rail = Math.max(0.028, Math.min(dimensions.width, dimensions.height) * 0.045);
  const frameDepth = Math.max(dimensions.depth, 0.035);
  const yOffset = 0.45;

  return (
    <group position={[0, yOffset, 0]}>
      <mesh receiveShadow position={[0, dimensions.height / 2, wallZ + 0.006]}>
        <planeGeometry args={[dimensions.width + rail * 2.4, dimensions.height + rail * 2.4]} />
        <meshStandardMaterial
          color="#26231e"
          opacity={0.08}
          roughness={0.85}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>
      <mesh castShadow position={[0, dimensions.height / 2, artZ]}>
        <planeGeometry args={[dimensions.width, dimensions.height]} />
        <meshStandardMaterial map={texture} roughness={0.72} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, dimensions.height / 2, artZ + 0.004]}>
        <planeGeometry args={[dimensions.width, dimensions.height]} />
        <meshBasicMaterial color="#1f4d45" opacity={0.24} transparent wireframe />
      </mesh>
      {product.frameEnabled ? (
        <FrameRails
          depth={frameDepth}
          height={dimensions.height}
          rail={rail}
          width={dimensions.width}
          z={artZ + frameDepth / 2}
        />
      ) : (
        <mesh position={[0, dimensions.height / 2, artZ + 0.006]}>
          <boxGeometry args={[dimensions.width, dimensions.height, 0.012]} />
          <meshBasicMaterial color="#1f4d45" wireframe />
        </mesh>
      )}
    </group>
  );
}

function FrameRails({
  depth,
  height,
  rail,
  width,
  z,
}: {
  depth: number;
  height: number;
  rail: number;
  width: number;
  z: number;
}) {
  const bars = [
    {
      args: [width + rail * 2, rail, depth] as [number, number, number],
      position: [0, height + rail / 2, z] as [number, number, number],
    },
    {
      args: [width + rail * 2, rail, depth] as [number, number, number],
      position: [0, -rail / 2, z] as [number, number, number],
    },
    {
      args: [rail, height, depth] as [number, number, number],
      position: [-(width / 2 + rail / 2), height / 2, z] as [number, number, number],
    },
    {
      args: [rail, height, depth] as [number, number, number],
      position: [width / 2 + rail / 2, height / 2, z] as [number, number, number],
    },
  ];

  return (
    <>
      {bars.map((bar, index) => (
        <mesh castShadow key={index} position={bar.position}>
          <boxGeometry args={bar.args} />
          <meshStandardMaterial color="#26231e" roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

function SizeBox({
  dimensions,
  wallMounted = false,
}: {
  dimensions: { width: number; height: number; depth: number };
  wallMounted?: boolean;
}) {
  const boxArgs: [number, number, number] = [
    dimensions.width,
    dimensions.height,
    dimensions.depth,
  ];
  const yOffset = wallMounted ? 0.45 : 0;

  return (
    <group position={[0, yOffset, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshStandardMaterial
          color="#1f4d45"
          opacity={0.22}
          roughness={0.8}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshBasicMaterial color="#1f4d45" wireframe />
      </mesh>
      <mesh castShadow position={[0, dimensions.height / 2, 0]}>
        <boxGeometry args={boxArgs} />
        <meshPhysicalMaterial
          color="#9fd7c3"
          opacity={0.2}
          roughness={0.18}
          transmission={0.45}
          transparent
        />
        <Edges color="#1f4d45" scale={1.006} threshold={10} />
      </mesh>
    </group>
  );
}

function ModelPlaceholder({
  dimensions,
  wallMounted = false,
}: {
  dimensions: { width: number; height: number; depth: number };
  wallMounted?: boolean;
}) {
  const modelArgs: [number, number, number] = [
    dimensions.width,
    dimensions.height,
    dimensions.depth,
  ];
  const yOffset = wallMounted ? 0.45 : 0;

  return (
    <group position={[0, yOffset, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshStandardMaterial color="#cfe8d8" opacity={0.35} transparent />
      </mesh>
      <mesh castShadow position={[0, dimensions.height / 2, 0]}>
        <boxGeometry args={modelArgs} />
        <meshStandardMaterial color="#dbe5e1" metalness={0.08} roughness={0.42} />
        <Edges color="#2d6258" scale={1.004} threshold={10} />
      </mesh>
      <mesh castShadow position={[0, dimensions.height + 0.06, 0]}>
        <boxGeometry args={[dimensions.width * 0.72, 0.08, dimensions.depth * 0.72]} />
        <meshStandardMaterial color="#d96f32" roughness={0.5} />
      </mesh>
    </group>
  );
}

function EightWallArModal({
  product,
  onClose,
}: {
  product: DraftPreview;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [message, setMessage] = useState("Starting world tracking");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let active = true;
    startEightWallSession(product, canvas)
      .then(() => {
        if (!active) return;
        setMessage("Move your phone to find the floor");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "AR could not start on this device");
      });

    return () => {
      active = false;
      stopEightWallSession();
    };
  }, [product.id]);

  return (
    <div className="ar-modal" role="dialog" aria-modal="true" aria-label="Camera AR preview">
      <canvas ref={canvasRef} className="ar-camera-canvas" />
      <div className="ar-modal-topbar">
        <span className="ar-modal-product">
          <strong>{product.name}</strong>
          <small>{dimensionsLabel(product)}</small>
        </span>
        <button className="ar-modal-button" type="button" onClick={onClose}>
          <X size={18} />
          Close
        </button>
      </div>
      <div className="ar-modal-hint">
        <Crosshair size={17} />
        <span>{message}</span>
      </div>
      <button
        className="ar-recenter"
        type="button"
        onClick={() => window.XR8?.XrController?.recenter?.()}
      >
        <Crosshair size={17} />
        Recenter
      </button>
    </div>
  );
}

let eighthWallSessionRunning = false;

function stopEightWallSession() {
  if (!eighthWallSessionRunning) return;
  window.XR8?.stop?.();
  eighthWallSessionRunning = false;
}

async function startEightWallSession(product: DraftPreview, canvas: HTMLCanvasElement) {
  const XR8 = window.XR8;
  if (!isEightWallReady() || !XR8?.GlTextureRenderer || !XR8.Threejs || !XR8.XrController) {
    throw new Error("Camera AR is not available in this browser session");
  }

  stopEightWallSession();
  window.THREE = THREE;
  await XR8.loadChunk?.("slam");

  XR8.addCameraPipelineModules(
    [
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      window.LandingPage?.pipelineModule?.(),
      window.XRExtras?.FullWindowCanvas?.pipelineModule?.(),
      window.XRExtras?.Loading?.pipelineModule?.(),
      window.XRExtras?.RuntimeError?.pipelineModule?.(),
      trueSizeArPipelineModule(product),
    ].filter(Boolean),
  );

  XR8.run({
    canvas,
    allowedDevices: XR8.XrConfig?.device?.().ANY,
  });
  eighthWallSessionRunning = true;
}

function trueSizeArPipelineModule(product: DraftPreview) {
  return {
    name: `truesize-ar-${product.id}-${Date.now()}`,
    onStart: ({ canvas }: { canvas: HTMLCanvasElement }) => {
      const XR8 = window.XR8;
      const xrScene = XR8?.Threejs?.xrScene();
      if (!XR8?.XrController || !xrScene) return;

      const { scene, camera, renderer } = xrScene;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      addTrueSizeArObject(scene, product);

      camera.position.set(0, 1.65, 2.15);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      canvas.addEventListener("touchmove", (event) => event.preventDefault(), {
        passive: false,
      });
      canvas.addEventListener(
        "touchstart",
        (event) => {
          if (event.touches.length === 1) XR8.XrController?.recenter?.();
        },
        true,
      );
    },
  };
}

function addTrueSizeArObject(scene: THREE.Scene, product: DraftPreview) {
  const dimensions = getSceneDimensionsInMeters(product);

  const root = new THREE.Group();
  root.name = `TrueSize AR ${product.name}`;
  scene.add(root);

  const light = new THREE.DirectionalLight(0xffffff, 0.82);
  light.position.set(3.4, 5, 2.2);
  light.castShadow = true;
  root.add(light);
  root.add(new THREE.AmbientLight(0xffffff, 0.42));

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.ShadowMaterial({ opacity: 0.32 }),
  );
  shadow.rotateX(-Math.PI / 2);
  shadow.receiveShadow = true;
  root.add(shadow);

  if (product.previewMethod === "flat" && product.placement === "wall") {
    addWallArtArObject(root, product, dimensions);
    return;
  }

  if (product.previewMethod === "flat" && product.placement === "floor") {
    addFlatFloorArObject(root, product, dimensions);
    return;
  }

  if (product.previewMethod === "model") {
    addModelArObject(root, dimensions, product.placement === "wall");
    return;
  }

  addFloorArObject(root, dimensions, product.placement === "wall");
}

function addFloorArObject(
  root: THREE.Group,
  dimensions: { width: number; height: number; depth: number },
  wallMounted = false,
) {
  const yOffset = wallMounted ? 0.45 : 0;
  const group = new THREE.Group();
  group.position.y = yOffset;
  root.add(group);

  const footprint = new THREE.Mesh(
    new THREE.PlaneGeometry(dimensions.width, dimensions.depth),
    new THREE.MeshBasicMaterial({
      color: 0x1f4d45,
      opacity: 0.24,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  footprint.rotateX(-Math.PI / 2);
  footprint.position.y = 0.01;
  group.add(footprint);

  const boxGeometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
  const box = new THREE.Mesh(
    boxGeometry,
    new THREE.MeshPhysicalMaterial({
      color: 0x9fd7c3,
      opacity: 0.2,
      roughness: 0.18,
      transparent: true,
    }),
  );
  box.position.y = dimensions.height / 2;
  box.castShadow = true;
  group.add(box);
  addEdges(box, boxGeometry, 0x103f37);
}

function addFlatFloorArObject(
  root: THREE.Group,
  product: DraftPreview,
  dimensions: { width: number; height: number; depth: number },
) {
  const texture = new THREE.TextureLoader().load(product.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(dimensions.width, dimensions.depth),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  mat.rotateX(-Math.PI / 2);
  mat.position.y = 0.012;
  root.add(mat);
}

function addWallArtArObject(
  root: THREE.Group,
  product: DraftPreview,
  dimensions: { width: number; height: number; depth: number },
) {
  const artGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
  const texture = new THREE.TextureLoader().load(product.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  const art = new THREE.Mesh(
    artGeometry,
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    }),
  );
  art.position.set(0, dimensions.height / 2, -0.02);
  root.add(art);

  if (!product.frameEnabled) return;

  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x27231e, roughness: 0.5 });
  const rail = 0.045;
  const depth = Math.max(dimensions.depth, 0.035);
  const bars = [
    {
      size: [dimensions.width + rail * 2, rail, depth] as [number, number, number],
      position: [0, dimensions.height + rail / 2, -0.04] as [number, number, number],
    },
    {
      size: [dimensions.width + rail * 2, rail, depth] as [number, number, number],
      position: [0, -rail / 2, -0.04] as [number, number, number],
    },
    {
      size: [rail, dimensions.height, depth] as [number, number, number],
      position: [-(dimensions.width / 2 + rail / 2), dimensions.height / 2, -0.04] as [
        number,
        number,
        number,
      ],
    },
    {
      size: [rail, dimensions.height, depth] as [number, number, number],
      position: [dimensions.width / 2 + rail / 2, dimensions.height / 2, -0.04] as [
        number,
        number,
        number,
      ],
    },
  ];

  bars.forEach((bar) => {
    const geometry = new THREE.BoxGeometry(...bar.size);
    const mesh = new THREE.Mesh(geometry, frameMaterial);
    mesh.position.set(...bar.position);
    mesh.castShadow = true;
    root.add(mesh);
  });
}

function addModelArObject(
  root: THREE.Group,
  dimensions: { width: number; height: number; depth: number },
  wallMounted = false,
) {
  const yOffset = wallMounted ? 0.45 : 0;
  const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
  const model = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xdbe5e1,
      metalness: 0.08,
      roughness: 0.42,
    }),
  );
  model.position.y = dimensions.height / 2 + yOffset;
  model.castShadow = true;
  root.add(model);
  addEdges(model, geometry, 0x2d6258);
}

function addEdges(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, color: number) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color }),
  );
  mesh.add(edges);
}

export default App;
