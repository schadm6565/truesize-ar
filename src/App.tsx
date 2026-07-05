import { Canvas, useThree } from "@react-three/fiber";
import { Edges, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  Copy,
  Crosshair,
  Eye,
  Frame,
  Home,
  Image as ImageIcon,
  Package,
  QrCode,
  RotateCw,
  Ruler,
  Save,
  Share2,
  ShoppingBag,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { imageOptions, sampleProducts } from "./data/products";
import type { PreviewType, ProductPreview, Unit } from "./types/product";

const STORAGE_KEY = "truesize-ar-products-v1";

type AppView = "dashboard" | "editor" | "customer";
type DimensionField = "width" | "height" | "depth";
type ArStatus = "checking" | "ready" | "starting" | "running" | "fallback" | "error";

type Xr8Like = {
  addCameraPipelineModules: (modules: unknown[]) => void;
  run: (options: { canvas: HTMLCanvasElement; allowedDevices?: unknown }) => void;
  stop?: () => void;
  loadChunk?: (chunk: "slam") => Promise<void>;
  GlTextureRenderer?: { pipelineModule: () => unknown };
  Threejs?: {
    pipelineModule: () => unknown;
    xrScene: () => { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer };
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

const previewTypeLabels: Record<PreviewType, string> = {
  floor: "Floor item",
  wall: "Wall art / frame",
  model: "3D model",
};

const previewTypeDescriptions: Record<PreviewType, string> = {
  floor: "Footprint and transparent box",
  wall: "Scaled wall placement",
  model: "GLB-ready model scale",
};

const previewTypeIcons: Record<PreviewType, typeof Box> = {
  floor: Box,
  wall: Frame,
  model: Package,
};

function loadProducts() {
  if (typeof window === "undefined") {
    return sampleProducts;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return sampleProducts;
    }

    const parsed = JSON.parse(stored) as ProductPreview[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return sampleProducts;
    }

    return parsed;
  } catch {
    return sampleProducts;
  }
}

function toCentimeters(value: number, unit: Unit) {
  return unit === "in" ? value * 2.54 : value;
}

function getDimensionsInCm(product: ProductPreview) {
  return {
    width: toCentimeters(product.width, product.unit),
    height: toCentimeters(product.height, product.unit),
    depth: toCentimeters(product.depth || 1, product.unit),
  };
}

function formatDimension(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function dimensionsLabel(product: ProductPreview) {
  const pieces = [product.width, product.height];
  if (product.previewType !== "wall") {
    pieces.push(product.depth);
  }

  return `${pieces.map(formatDimension).join(" x ")} ${product.unit}`;
}

function previewScore(product: ProductPreview) {
  let score = 52;
  if (product.published) score += 18;
  if (product.image) score += 12;
  if (product.width && product.height) score += 10;
  if (product.previewType !== "wall" && product.depth) score += 8;
  return Math.min(score, 100);
}

function getPreviewUrl(product: ProductPreview) {
  return `truesize.ar/p/${product.id}`;
}

function isEightWallReady() {
  return Boolean(
    window.XR8?.GlTextureRenderer &&
      window.XR8?.Threejs &&
      window.XR8?.XrController,
  );
}

function App() {
  const [products, setProducts] = useState<ProductPreview[]>(loadProducts);
  const [selectedId, setSelectedId] = useState(() => loadProducts()[0]?.id ?? "");
  const [view, setView] = useState<AppView>("dashboard");
  const [saveFlash, setSaveFlash] = useState(false);

  const selectedProduct =
    products.find((product) => product.id === selectedId) ?? products[0];

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }, [products]);

  const updateProduct = (patch: Partial<ProductPreview>) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === selectedProduct.id ? { ...product, ...patch } : product,
      ),
    );
  };

  const openEditor = (productId: string) => {
    setSelectedId(productId);
    setView("editor");
  };

  const openCustomerPreview = (productId = selectedProduct.id) => {
    setSelectedId(productId);
    setView("customer");
  };

  const handleSave = () => {
    updateProduct({ updatedAt: "Just now" });
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1800);
  };

  const resetDemo = () => {
    setProducts(sampleProducts);
    setSelectedId(sampleProducts[0].id);
    setView("dashboard");
  };

  return (
    <div className="app-shell">
      <TopBar
        currentView={view}
        onDashboard={() => setView("dashboard")}
        onPreview={() => openCustomerPreview()}
      />

      {view === "dashboard" && (
        <Dashboard
          products={products}
          onOpenEditor={openEditor}
          onOpenCustomer={openCustomerPreview}
          onResetDemo={resetDemo}
        />
      )}

      {view === "editor" && selectedProduct && (
        <Editor
          product={selectedProduct}
          products={products}
          saved={saveFlash}
          onBack={() => setView("dashboard")}
          onOpenCustomer={() => openCustomerPreview(selectedProduct.id)}
          onSave={handleSave}
          onSelect={(productId) => setSelectedId(productId)}
          onUpdate={updateProduct}
        />
      )}

      {view === "customer" && selectedProduct && (
        <CustomerPreview
          product={selectedProduct}
          onBack={() => setView("editor")}
          onDashboard={() => setView("dashboard")}
        />
      )}
    </div>
  );
}

function TopBar({
  currentView,
  onDashboard,
  onPreview,
}: {
  currentView: AppView;
  onDashboard: () => void;
  onPreview: () => void;
}) {
  return (
    <header className="topbar">
      <button className="brand-lockup" onClick={onDashboard} type="button">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>
          <strong>TrueSize AR</strong>
          <small>Merchant preview workspace</small>
        </span>
      </button>

      <nav className="topbar-actions" aria-label="Primary">
        <button
          className={`nav-pill ${currentView === "dashboard" ? "active" : ""}`}
          onClick={onDashboard}
          type="button"
        >
          <Home size={16} />
          Dashboard
        </button>
        <button
          className={`nav-pill ${currentView === "customer" ? "active" : ""}`}
          onClick={onPreview}
          type="button"
        >
          <Eye size={16} />
          Shopper preview
        </button>
      </nav>
    </header>
  );
}

function Dashboard({
  products,
  onOpenEditor,
  onOpenCustomer,
  onResetDemo,
}: {
  products: ProductPreview[];
  onOpenEditor: (productId: string) => void;
  onOpenCustomer: (productId: string) => void;
  onResetDemo: () => void;
}) {
  const publishedCount = products.filter((product) => product.published).length;
  const wallCount = products.filter((product) => product.previewType === "wall").length;
  const averageScore = Math.round(
    products.reduce((total, product) => total + previewScore(product), 0) / products.length,
  );

  return (
    <main className="dashboard-shell">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">Products</p>
          <h1>True-size previews</h1>
        </div>
        <button className="secondary-action" type="button" onClick={onResetDemo}>
          <RotateCw size={16} />
          Reset demo
        </button>
      </section>

      <section className="metric-grid" aria-label="Preview metrics">
        <MetricCard label="Published previews" value={`${publishedCount}/${products.length}`} tone="green" />
        <MetricCard label="Average readiness" value={`${averageScore}%`} tone="blue" />
        <MetricCard label="Wall previews" value={`${wallCount}`} tone="amber" />
      </section>

      <section className="dashboard-grid">
        <div className="tool-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Catalog</p>
              <h2>Product preview list</h2>
            </div>
            <span className="table-count">{products.length} products</span>
          </div>

          <div className="product-list">
            {products.map((product) => {
              const TypeIcon = previewTypeIcons[product.previewType];

              return (
                <button
                  className="product-row"
                  key={product.id}
                  onClick={() => onOpenEditor(product.id)}
                  type="button"
                >
                  <img className="product-thumb" src={product.image} alt="" />
                  <span className="product-row-copy">
                    <strong>{product.name}</strong>
                    <small>
                      <TypeIcon size={14} />
                      {previewTypeLabels[product.previewType]} - {dimensionsLabel(product)}
                    </small>
                  </span>
                  <span className="product-row-meta">
                    <span className={`status-badge ${product.published ? "published" : "draft"}`}>
                      {product.published ? "Published" : "Draft"}
                    </span>
                    <ChevronRight size={18} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="tool-panel dashboard-side">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Customer entry</p>
              <h2>Preview links</h2>
            </div>
          </div>

          <div className="side-stack">
            {products.map((product) => (
              <div className="link-row" key={product.id}>
                <span>
                  <strong>{product.name}</strong>
                  <small>{getPreviewUrl(product)}</small>
                </span>
                <button
                  className="icon-action"
                  onClick={() => onOpenCustomer(product.id)}
                  title={`Open ${product.name} customer preview`}
                  type="button"
                >
                  <Eye size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="ar-note">
            <Smartphone size={18} />
            <span>Mobile AR-ready handoff with interactive 3D fallback.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "blue" | "amber";
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Editor({
  product,
  products,
  saved,
  onBack,
  onOpenCustomer,
  onSave,
  onSelect,
  onUpdate,
}: {
  product: ProductPreview;
  products: ProductPreview[];
  saved: boolean;
  onBack: () => void;
  onOpenCustomer: () => void;
  onSave: () => void;
  onSelect: (productId: string) => void;
  onUpdate: (patch: Partial<ProductPreview>) => void;
}) {
  const updateDimension = (field: DimensionField, value: string) => {
    const parsed = Number(value);
    onUpdate({ [field]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({
        image: String(reader.result),
        imageLabel: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGlbUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUpdate({ glbName: file.name });
  };

  return (
    <main className="editor-shell">
      <aside className="product-rail" aria-label="Products">
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Dashboard
        </button>

        <div className="rail-list">
          {products.map((item) => (
            <button
              className={`rail-item ${item.id === product.id ? "active" : ""}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <img src={item.image} alt="" />
              <span>
                <strong>{item.name}</strong>
                <small>{previewTypeLabels[item.previewType]}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="editor-form tool-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Configurator</p>
            <h1>{product.name}</h1>
          </div>
          <span className={`status-badge ${product.published ? "published" : "draft"}`}>
            {product.published ? "Published" : "Draft"}
          </span>
        </div>

        <div className="form-stack">
          <label className="field-label">
            <span>Product name</span>
            <input
              value={product.name}
              onChange={(event) => onUpdate({ name: event.target.value })}
              type="text"
            />
          </label>

          <div className="field-group">
            <span className="field-heading">Preview type</span>
            <div className="segmented-control">
              {(Object.keys(previewTypeLabels) as PreviewType[]).map((type) => {
                const TypeIcon = previewTypeIcons[type];
                return (
                  <button
                    className={`segment-button ${product.previewType === type ? "active" : ""}`}
                    key={type}
                    onClick={() => onUpdate({ previewType: type })}
                    type="button"
                  >
                    <TypeIcon size={17} />
                    <span>{previewTypeLabels[type]}</span>
                    <small>{previewTypeDescriptions[type]}</small>
                  </button>
                );
              })}
            </div>
          </div>

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
                onChange={(value) => updateDimension("width", value)}
              />
              <DimensionInput
                label="Height"
                value={product.height}
                onChange={(value) => updateDimension("height", value)}
              />
              {product.previewType !== "wall" && (
                <DimensionInput
                  label="Depth"
                  value={product.depth}
                  onChange={(value) => updateDimension("depth", value)}
                />
              )}
            </div>
          </div>

          <div className="field-group">
            <span className="field-heading">Product image</span>
            <div className="image-picker">
              {imageOptions.map((option) => (
                <button
                  className={`image-option ${product.image === option.value ? "active" : ""}`}
                  key={option.value}
                  onClick={() => onUpdate({ image: option.value, imageLabel: option.label })}
                  type="button"
                >
                  <img src={option.value} alt="" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <label className="upload-control">
              <Upload size={17} />
              <span>{product.imageLabel ? `Using ${product.imageLabel}` : "Upload product image"}</span>
              <input accept="image/*" onChange={handleImageUpload} type="file" />
            </label>
          </div>

          {product.previewType === "model" && (
            <div className="field-group">
              <span className="field-heading">3D model</span>
              <label className="upload-control glb-upload">
                <Package size={17} />
                <span>{product.glbName ? product.glbName : "Upload GLB model"}</span>
                <input accept=".glb,model/gltf-binary" onChange={handleGlbUpload} type="file" />
              </label>
            </div>
          )}

          {product.previewType === "wall" && (
            <label className="toggle-row">
              <span>
                <strong>Frame / border</strong>
                <small>Applies a commerce-style frame in shopper view.</small>
              </span>
              <input
                checked={product.frameEnabled}
                onChange={(event) => onUpdate({ frameEnabled: event.target.checked })}
                type="checkbox"
              />
            </label>
          )}

          <label className="toggle-row">
            <span>
              <strong>Publish preview</strong>
              <small>Controls whether the shopper link reads as active.</small>
            </span>
            <input
              checked={product.published}
              onChange={(event) => onUpdate({ published: event.target.checked })}
              type="checkbox"
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="primary-action" type="button" onClick={onSave}>
            {saved ? <Check size={17} /> : <Save size={17} />}
            {saved ? "Saved" : "Save preview"}
          </button>
          <button className="secondary-action" type="button" onClick={onOpenCustomer}>
            <Eye size={17} />
            Open customer preview
          </button>
        </div>
      </section>

      <LivePreview product={product} />
    </main>
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

function LivePreview({ product }: { product: ProductPreview }) {
  return (
    <section className="preview-panel tool-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Live preview</p>
          <h2>{previewTypeLabels[product.previewType]}</h2>
        </div>
        <span className="preview-chip">
          <Ruler size={14} />
          {dimensionsLabel(product)}
        </span>
      </div>

      <div className="preview-stage">
        {product.previewType === "wall" ? (
          <WallPreview product={product} />
        ) : (
          <TrueSizeScene product={product} />
        )}
      </div>

      <div className="preview-summary">
        <img src={product.image} alt="" />
        <span>
          <strong>{product.name}</strong>
          <small>{product.previewType === "model" && product.glbName ? product.glbName : product.imageLabel}</small>
        </span>
      </div>
    </section>
  );
}

function CustomerPreview({
  product,
  onBack,
  onDashboard,
}: {
  product: ProductPreview;
  onBack: () => void;
  onDashboard: () => void;
}) {
  const [arOpened, setArOpened] = useState(false);
  const [arState, setArState] = useState<ArStatus>(() =>
    typeof window !== "undefined" && isEightWallReady() ? "ready" : "checking",
  );
  const [arModalOpen, setArModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const markReady = () => {
      if (mounted) setArState("ready");
    };

    if (isEightWallReady()) {
      markReady();
      return () => {
        mounted = false;
      };
    }

    window.addEventListener("xrloaded", markReady);
    const timeout = window.setTimeout(() => {
      if (mounted && !isEightWallReady()) {
        setArState("fallback");
      }
    }, 2400);

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      window.removeEventListener("xrloaded", markReady);
    };
  }, []);

  const openAr = () => {
    setArOpened(true);
    if (isEightWallReady()) {
      setArModalOpen(true);
      setArState("starting");
      return;
    }

    setArState("fallback");
  };

  return (
    <main className="customer-shell">
      <header className="shop-header">
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Configurator
        </button>
        <button className="shop-brand" type="button" onClick={onDashboard}>
          <ShoppingBag size={18} />
          Park & Pine
        </button>
      </header>

      <section className="customer-grid">
        <div className="customer-media tool-panel">
          <div className="media-heading">
            <span className="status-badge published">True-size preview</span>
            <span>{previewTypeLabels[product.previewType]}</span>
          </div>
          <div className="customer-preview-stage">
            {product.previewType === "wall" ? (
              <WallPreview product={product} customer />
            ) : (
              <TrueSizeScene product={product} customer />
            )}
          </div>
        </div>

        <aside className="buy-panel tool-panel">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="shop-copy">
            Preview this product at real-world scale before checkout.
          </p>

          <div className="customer-product-strip">
            <img src={product.image} alt="" />
            <span>
              <strong>{dimensionsLabel(product)}</strong>
              <small>{product.published ? "Active preview link" : "Draft preview link"}</small>
            </span>
          </div>

          <button className="primary-action wide" type="button" onClick={openAr}>
            <Smartphone size={18} />
            View in your space
          </button>

          <div className={`ar-state ${arOpened ? "active" : ""}`}>
            <span className="ar-state-icon">
              {arState === "ready" || arState === "running" || arState === "starting" ? (
                <Share2 size={17} />
              ) : (
                <ImageIcon size={17} />
              )}
            </span>
            <span>
              <strong>
                {arState === "ready" && "8th Wall SLAM ready"}
                {arState === "starting" && "Starting SLAM session"}
                {arState === "running" && "8th Wall SLAM active"}
                {arState === "checking" && "Checking AR engine"}
                {arState === "fallback" && "Mobile AR ready"}
                {arState === "error" && "Interactive preview ready"}
              </strong>
              <small>
                {arState === "ready" &&
                  "Uses the 8th Wall Engine Binary when camera access is available."}
                {arState === "starting" && "A camera prompt may appear on supported mobile browsers."}
                {arState === "running" && "The product proxy is placed with world tracking."}
                {arState === "checking" && "The preview still works while the AR engine loads."}
                {arState === "fallback" && "Open on a phone or use the interactive preview here."}
                {arState === "error" && "The 3D preview remains available on this device."}
              </small>
            </span>
          </div>

          <div className="dimension-list">
            <DimensionReadout label="Width" value={`${formatDimension(product.width)} ${product.unit}`} />
            <DimensionReadout label="Height" value={`${formatDimension(product.height)} ${product.unit}`} />
            {product.previewType !== "wall" && (
              <DimensionReadout label="Depth" value={`${formatDimension(product.depth)} ${product.unit}`} />
            )}
          </div>

          <ShareCard product={product} />
        </aside>
      </section>

      {arModalOpen && (
        <EightWallArModal
          product={product}
          onClose={() => {
            stopEightWallSession();
            setArModalOpen(false);
            setArState("ready");
          }}
          onError={() => setArState("error")}
          onRunning={() => setArState("running")}
          onStarting={() => setArState("starting")}
        />
      )}
    </main>
  );
}

function EightWallArModal({
  product,
  onClose,
  onError,
  onRunning,
  onStarting,
}: {
  product: ProductPreview;
  onClose: () => void;
  onError: () => void;
  onRunning: () => void;
  onStarting: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [message, setMessage] = useState("Starting world tracking");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let active = true;
    onStarting();

    startEightWallSession(product, canvas)
      .then(() => {
        if (!active) return;
        setMessage("Move your phone to find the floor");
        onRunning();
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "AR could not start on this device");
        onError();
      });

    return () => {
      active = false;
      stopEightWallSession();
    };
  }, [product.id]);

  return (
    <div className="ar-modal" role="dialog" aria-modal="true" aria-label="8th Wall AR preview">
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

function DimensionReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="dimension-readout">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ShareCard({ product }: { product: ProductPreview }) {
  return (
    <div className="share-card">
      <QrCodeMock seed={product.id} />
      <span className="share-copy">
        <strong>Scan to preview</strong>
        <small>{getPreviewUrl(product)}</small>
      </span>
      <button className="icon-action" type="button" title="Copy preview link">
        <Copy size={15} />
      </button>
    </div>
  );
}

function QrCodeMock({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    const total = 81;
    const seedValue = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

    return Array.from({ length: total }, (_, index) => {
      const row = Math.floor(index / 9);
      const col = index % 9;
      const inTopLeft = row < 3 && col < 3;
      const inTopRight = row < 3 && col > 5;
      const inBottomLeft = row > 5 && col < 3;
      const finder = inTopLeft || inTopRight || inBottomLeft;
      return finder || ((index * 7 + seedValue + row * col) % 5 < 2);
    });
  }, [seed]);

  return (
    <div className="qr-grid" aria-label="QR code mockup">
      {cells.map((active, index) => (
        <span className={active ? "active" : ""} key={index} />
      ))}
    </div>
  );
}

function WallPreview({
  product,
  customer = false,
}: {
  product: ProductPreview;
  customer?: boolean;
}) {
  const dimensions = getDimensionsInCm(product);
  const aspect = Math.max(0.22, dimensions.width / Math.max(dimensions.height, 1));
  const baseScale = customer ? 4.15 : 3.45;
  const width = Math.min(customer ? 450 : 360, Math.max(customer ? 104 : 88, dimensions.width * baseScale));

  const style = {
    "--art-width": `${width}px`,
    "--art-aspect": `${aspect}`,
  } as CSSProperties;

  return (
    <div className={`wall-room ${customer ? "customer" : ""}`} style={style}>
      <div className={`wall-art ${product.frameEnabled ? "framed" : "unframed"}`}>
        <img src={product.image} alt="" />
      </div>
      <div className="wall-console" aria-hidden="true">
        <span />
      </div>
      <div className="wall-scale">
        <span>{formatDimension(product.width)} {product.unit}</span>
        <span>{formatDimension(product.height)} {product.unit}</span>
      </div>
    </div>
  );
}

function TrueSizeScene({
  product,
  customer = false,
}: {
  product: ProductPreview;
  customer?: boolean;
}) {
  return (
    <Canvas className="three-canvas" dpr={[1, 2]} shadows>
      <SceneContent product={product} customer={customer} />
    </Canvas>
  );
}

function SceneContent({
  product,
  customer,
}: {
  product: ProductPreview;
  customer: boolean;
}) {
  const { size } = useThree();
  const dimensions = getDimensionsInCm(product);
  const meters = {
    width: Math.max(dimensions.width / 100, 0.08),
    height: Math.max(dimensions.height / 100, 0.08),
    depth: Math.max(dimensions.depth / 100, 0.08),
  };
  const maxDimension = Math.max(meters.width, meters.height, meters.depth);
  const narrowCanvas = size.width < 460;
  const maxScale = customer ? (narrowCanvas ? 0.92 : 1.4) : narrowCanvas ? 0.98 : 1.25;
  const fitScale = Math.min(maxScale, (narrowCanvas ? 2.15 : 2.9) / maxDimension);
  const isModel = product.previewType === "model";

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
        {isModel ? (
          <ModelPlaceholder dimensions={meters} />
        ) : (
          <FloorFootprint dimensions={meters} />
        )}
      </group>
      <OrbitControls
        autoRotate={customer}
        autoRotateSpeed={0.35}
        enablePan={false}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2.8}
        maxDistance={7}
      />
    </>
  );
}

function FloorFootprint({
  dimensions,
}: {
  dimensions: { width: number; height: number; depth: number };
}) {
  const boxArgs: [number, number, number] = [
    dimensions.width,
    dimensions.height,
    dimensions.depth,
  ];

  return (
    <group>
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
}: {
  dimensions: { width: number; height: number; depth: number };
}) {
  const modelArgs: [number, number, number] = [
    dimensions.width,
    dimensions.height,
    dimensions.depth,
  ];

  return (
    <group>
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

let eighthWallSessionRunning = false;

function stopEightWallSession() {
  if (!eighthWallSessionRunning) return;
  window.XR8?.stop?.();
  eighthWallSessionRunning = false;
}

async function startEightWallSession(product: ProductPreview, canvas: HTMLCanvasElement) {
  const XR8 = window.XR8;
  if (!isEightWallReady() || !XR8?.GlTextureRenderer || !XR8.Threejs || !XR8.XrController) {
    throw new Error("8th Wall SLAM is not available in this browser session");
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

function trueSizeArPipelineModule(product: ProductPreview) {
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
          if (event.touches.length === 1) {
            XR8.XrController?.recenter?.();
          }
        },
        true,
      );
    },
  };
}

function addTrueSizeArObject(scene: THREE.Scene, product: ProductPreview) {
  const dimensions = getDimensionsInCm(product);
  const meters = {
    width: Math.max(dimensions.width / 100, 0.08),
    height: Math.max(dimensions.height / 100, 0.08),
    depth: Math.max(dimensions.depth / 100, 0.04),
  };

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

  if (product.previewType === "wall") {
    addWallArtArObject(root, product, meters);
    return;
  }

  if (product.previewType === "model") {
    addModelArObject(root, meters);
    return;
  }

  addFloorArObject(root, meters);
}

function addFloorArObject(
  root: THREE.Group,
  dimensions: { width: number; height: number; depth: number },
) {
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
  root.add(footprint);

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
  root.add(box);
  addEdges(box, boxGeometry, 0x103f37);
}

function addWallArtArObject(
  root: THREE.Group,
  product: ProductPreview,
  dimensions: { width: number; height: number; depth: number },
) {
  const artGeometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
  const texture = new THREE.TextureLoader().load(product.image);
  const art = new THREE.Mesh(
    artGeometry,
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    }),
  );
  art.position.set(0, dimensions.height / 2, -0.02);
  root.add(art);

  if (product.frameEnabled) {
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
}

function addModelArObject(
  root: THREE.Group,
  dimensions: { width: number; height: number; depth: number },
) {
  const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
  const model = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xdbe5e1,
      metalness: 0.08,
      roughness: 0.42,
    }),
  );
  model.position.y = dimensions.height / 2;
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
