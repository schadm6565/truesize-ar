import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Edges, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import {
  Box,
  ChevronRight,
  Copy,
  Camera,
  Frame,
  Image as ImageIcon,
  Package,
  QrCode,
  Ruler,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import QRCode from "qrcode";
import type { Unit } from "./types/product";

const STORAGE_KEY = "truesize-ar-method-v3";
const SHARE_ORIGIN = "https://truesize.builtbychad.com";

type PreviewMethod = "flat" | "box";
type Placement = "floor" | "wall";
type DimensionField = "width" | "height" | "depth";
type NativeXrMode = "starting" | "tracking" | "placed" | "fallback" | "error";

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
  glbUrl?: string;
};

const methodLabels: Record<PreviewMethod, string> = {
  flat: "Flat image",
  box: "Size box",
};

const methodDescriptions: Record<PreviewMethod, string> = {
  flat: "Use an uploaded image for flat products such as mats, prints, signs, and decals.",
  box: "Use a true-size box for bulky products, or attach an optional GLB model.",
};

const methodIcons: Record<PreviewMethod, typeof Box> = {
  flat: ImageIcon,
  box: Box,
};

const placementLabels: Record<Placement, string> = {
  floor: "Floor",
  wall: "Wall",
};

const unitOptions: Unit[] = ["in", "ft", "m", "cm", "mm"];
const previewMethods: PreviewMethod[] = ["flat", "box"];
const placements: Placement[] = ["floor", "wall"];

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

  const previewFromUrl = loadPreviewFromUrl();
  if (previewFromUrl) return previewFromUrl;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultPreview;
    const parsed = JSON.parse(stored) as Partial<DraftPreview>;
    const { glbName: _discardedGlbName, glbUrl: _discardedGlbUrl, ...persistable } = parsed;
    return {
      ...defaultPreview,
      ...persistable,
      previewMethod: parsePreviewMethod(persistable.previewMethod ?? null),
    };
  } catch {
    return defaultPreview;
  }
}

function loadPreviewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const hasPreviewParams = params.has("mode") || params.has("w") || params.has("unit");
  if (!hasPreviewParams) return null;

  const previewMethod = parsePreviewMethod(params.get("mode"));
  const placement = parsePlacement(params.get("place"));
  const unit = parseUnit(params.get("unit"));

  return {
    ...defaultPreview,
    previewMethod,
    placement,
    unit,
    name: params.get("name") || defaultPreview.name,
    width: parseDimensionParam(params.get("w"), defaultPreview.width),
    height: parseDimensionParam(params.get("h"), defaultPreview.height),
    depth: parseDimensionParam(params.get("d"), defaultPreview.depth),
    frameEnabled: params.get("frame") === "1",
  };
}

function parsePreviewMethod(value: string | null): PreviewMethod {
  if (value === "model") return "box";
  return previewMethods.includes(value as PreviewMethod) ? (value as PreviewMethod) : defaultPreview.previewMethod;
}

function parsePlacement(value: string | null): Placement {
  return placements.includes(value as Placement) ? (value as Placement) : defaultPreview.placement;
}

function parseUnit(value: string | null): Unit {
  return unitOptions.includes(value as Unit) ? (value as Unit) : defaultPreview.unit;
}

function parseDimensionParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getShareOrigin() {
  if (typeof window === "undefined") return SHARE_ORIGIN;
  const { hostname, origin } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" ? SHARE_ORIGIN : origin;
}

function getPreviewUrl(product: DraftPreview) {
  const url = new URL("/", getShareOrigin());
  url.searchParams.set("mode", product.previewMethod);
  url.searchParams.set("place", product.placement);
  url.searchParams.set("name", product.name);
  url.searchParams.set("w", formatDimension(product.width));
  url.searchParams.set("h", formatDimension(product.height));
  url.searchParams.set("unit", product.unit);
  if (product.previewMethod !== "flat") url.searchParams.set("d", formatDimension(product.depth));
  if (product.previewMethod === "flat" && product.placement === "wall" && product.frameEnabled) {
    url.searchParams.set("frame", "1");
  }
  return url.toString();
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
}

function toCentimeters(value: number, unit: Unit) {
  switch (unit) {
    case "in":
      return value * 2.54;
    case "ft":
      return value * 30.48;
    case "m":
      return value * 100;
    case "mm":
      return value / 10;
    case "cm":
      return value;
  }
}

function fromCentimeters(value: number, unit: Unit) {
  switch (unit) {
    case "in":
      return value / 2.54;
    case "ft":
      return value / 30.48;
    case "m":
      return value / 100;
    case "mm":
      return value * 10;
    case "cm":
      return value;
  }
}

function normalizeDimension(value: number, unit: Unit) {
  const decimals = unit === "mm" ? 0 : unit === "cm" ? 1 : 2;
  return Number(value.toFixed(decimals));
}

function convertDimensionUnit(value: number, fromUnit: Unit, toUnit: Unit) {
  return normalizeDimension(fromCentimeters(toCentimeters(value, fromUnit), toUnit), toUnit);
}

function dimensionInputStep(unit: Unit) {
  return unit === "mm" || unit === "cm" ? 1 : 0.01;
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
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
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

function defaultsForUnit(method: PreviewMethod, placement: Placement, unit: Unit) {
  const defaults = { ...defaultsFor(method, placement) };
  if (typeof defaults.width === "number") defaults.width = convertDimensionUnit(defaults.width, "cm", unit);
  if (typeof defaults.height === "number") defaults.height = convertDimensionUnit(defaults.height, "cm", unit);
  if (typeof defaults.depth === "number") defaults.depth = convertDimensionUnit(defaults.depth, "cm", unit);
  return defaults;
}

function App() {
  const [product, setProduct] = useState<DraftPreview>(loadPreview);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [cameraPreviewOpen, setCameraPreviewOpen] = useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const glbObjectUrlRef = useRef<string | null>(null);
  const previewUrl = useMemo(() => getPreviewUrl(product), [product]);

  useEffect(() => {
    const { glbName: _discardedGlbName, glbUrl: _discardedGlbUrl, ...persistable } = product;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [product]);

  useEffect(() => {
    return () => {
      if (glbObjectUrlRef.current) URL.revokeObjectURL(glbObjectUrlRef.current);
    };
  }, []);

  const updateProduct = (patch: Partial<DraftPreview>) => {
    setProduct((current) => ({ ...current, ...patch }));
  };

  const setPreviewMethod = (previewMethod: PreviewMethod) => {
    setProduct((current) => ({
      ...current,
      ...defaultsForUnit(previewMethod, current.placement, current.unit),
      previewMethod,
    }));
  };

  const choosePreviewMethod = (previewMethod: PreviewMethod) => {
    setPreviewMethod(previewMethod);
    if (isMobileDevice()) setMobileEditorOpen(true);
  };

  const setPlacement = (placement: Placement) => {
    setProduct((current) => ({
      ...current,
      ...defaultsForUnit(current.previewMethod, placement, current.unit),
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

    if (glbObjectUrlRef.current) URL.revokeObjectURL(glbObjectUrlRef.current);
    const glbUrl = URL.createObjectURL(file);
    glbObjectUrlRef.current = glbUrl;
    updateProduct({ glbName: file.name, glbUrl });
    event.currentTarget.value = "";
  };

  const clearGlbUpload = () => {
    if (glbObjectUrlRef.current) URL.revokeObjectURL(glbObjectUrlRef.current);
    glbObjectUrlRef.current = null;
    updateProduct({ glbName: undefined, glbUrl: undefined });
  };

  const createPreview = async () => {
    if (isMobileDevice()) {
      setCameraPreviewOpen(true);
      return;
    }

    setHandoffOpen(true);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Ruler size={22} strokeWidth={2.4} />
          </span>
          <span>
            <strong>True Size</strong>
          </span>
        </div>
      </header>

      <main className="simple-shell">
        <section className="intro-panel">
          <div>
            <h1>Create preview</h1>
          </div>
        </section>

        <section className="mode-grid" aria-label="Preview method">
          {(Object.keys(methodLabels) as PreviewMethod[]).map((method) => {
            const MethodIcon = methodIcons[method];
            return (
              <button
                className={`mode-card ${product.previewMethod === method ? "active" : ""}`}
                key={method}
                onClick={() => choosePreviewMethod(method)}
                type="button"
              >
                <span className="mode-icon">
                  <MethodIcon size={22} />
                </span>
                <span className="mode-copy">
                  <strong>{methodLabels[method]}</strong>
                  <small>{methodDescriptions[method]}</small>
                </span>
                <ChevronRight className="mode-arrow" size={18} aria-hidden="true" />
              </button>
            );
          })}
        </section>

        <section className="mobile-start-panel" aria-label="Selected preview setup">
          <div>
            <p className="eyebrow">Selected setup</p>
            <h2>{methodLabels[product.previewMethod]}</h2>
            <p>{methodDescriptions[product.previewMethod]}</p>
          </div>
          <div className="mobile-start-meta">
            <span>
              <Ruler size={14} />
              {dimensionsLabel(product)}
            </span>
            <span>{placementLabels[product.placement]}</span>
          </div>
          <button className="primary-action mobile-start-action" type="button" onClick={() => setMobileEditorOpen(true)}>
            Edit preview
            <ChevronRight size={17} />
          </button>
        </section>

        <section className="workspace-grid desktop-workspace">
          <ConfiguratorPanel
            product={product}
            onGlbClear={clearGlbUpload}
            onGlbUpload={handleGlbUpload}
            onImageUpload={handleImageUpload}
            onPlacementChange={setPlacement}
            onCreatePreview={createPreview}
            onUpdate={updateProduct}
            onUpdateDimension={updateDimension}
          />

          <PreviewPanel
            product={product}
            onUpdate={updateProduct}
          />
        </section>
      </main>

      {mobileEditorOpen && (
        <MobileEditorSheet
          product={product}
          onClose={() => setMobileEditorOpen(false)}
          onGlbClear={clearGlbUpload}
          onGlbUpload={handleGlbUpload}
          onImageUpload={handleImageUpload}
          onPlacementChange={setPlacement}
          onCreatePreview={createPreview}
          onUpdate={updateProduct}
          onUpdateDimension={updateDimension}
        />
      )}

      {handoffOpen && (
        <ShareHandoffModal
          product={product}
          url={previewUrl}
          onClose={() => setHandoffOpen(false)}
        />
      )}

      {cameraPreviewOpen && (
        <MobileCameraPreview
          product={product}
          url={previewUrl}
          onClose={() => setCameraPreviewOpen(false)}
          onShare={() => {
            setCameraPreviewOpen(false);
            setHandoffOpen(true);
          }}
        />
      )}
    </div>
  );
}

function MobileEditorSheet({
  product,
  onClose,
  onGlbClear,
  onGlbUpload,
  onImageUpload,
  onPlacementChange,
  onCreatePreview,
  onUpdate,
  onUpdateDimension,
}: {
  product: DraftPreview;
  onClose: () => void;
  onGlbClear: () => void;
  onGlbUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlacementChange: (placement: Placement) => void;
  onCreatePreview: () => void;
  onUpdate: (patch: Partial<DraftPreview>) => void;
  onUpdateDimension: (field: DimensionField, value: string) => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="mobile-editor-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="mobile-editor-sheet" role="dialog" aria-modal="true" aria-label="Preview details">
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">Details</p>
            <h2>{methodLabels[product.previewMethod]}</h2>
          </div>
          <button className="sheet-close" type="button" onClick={onClose} aria-label="Close details">
            <X size={20} />
          </button>
        </div>

        <ConfiguratorPanel
          product={product}
          onGlbClear={onGlbClear}
          onGlbUpload={onGlbUpload}
          onImageUpload={onImageUpload}
          onPlacementChange={onPlacementChange}
          onCreatePreview={onCreatePreview}
          onUpdate={onUpdate}
          onUpdateDimension={onUpdateDimension}
        />

        <PreviewPanel product={product} onUpdate={onUpdate} />
      </section>
    </div>
  );
}

function ConfiguratorPanel({
  product,
  onGlbClear,
  onGlbUpload,
  onImageUpload,
  onPlacementChange,
  onCreatePreview,
  onUpdate,
  onUpdateDimension,
}: {
  product: DraftPreview;
  onGlbClear: () => void;
  onGlbUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPlacementChange: (placement: Placement) => void;
  onCreatePreview: () => void;
  onUpdate: (patch: Partial<DraftPreview>) => void;
  onUpdateDimension: (field: DimensionField, value: string) => void;
}) {
  const unitStep = dimensionInputStep(product.unit);

  const changeUnit = (unit: Unit) => {
    if (unit === product.unit) return;

    onUpdate({
      unit,
      width: convertDimensionUnit(product.width, product.unit, unit),
      height: convertDimensionUnit(product.height, product.unit, unit),
      depth: convertDimensionUnit(product.depth, product.unit, unit),
    });
  };

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
              onChange={(event) => changeUnit(event.target.value as Unit)}
            >
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div className="dimension-grid">
            <DimensionInput
              label="Width"
              step={unitStep}
              value={product.width}
              onChange={(value) => onUpdateDimension("width", value)}
            />
            <DimensionInput
              label={secondDimensionLabel(product)}
              step={unitStep}
              value={product.height}
              onChange={(value) => onUpdateDimension("height", value)}
            />
            {product.previewMethod !== "flat" && (
              <DimensionInput
                label="Depth"
                step={unitStep}
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
          <div className="field-group">
            <span className="field-heading">Optional 3D model</span>
            <div className="model-upload-row">
              <label className="upload-control glb-upload">
                <Package size={17} />
                <span>{product.glbName ? product.glbName : "Upload GLB model"}</span>
                <input accept=".glb,model/gltf-binary" onChange={onGlbUpload} type="file" />
              </label>
              {product.glbName && (
                <button
                  className="clear-model-button"
                  type="button"
                  onClick={onGlbClear}
                  aria-label="Clear GLB model"
                  title="Clear GLB model"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      <div className="form-actions">
        <button className="primary-action" type="button" onClick={onCreatePreview}>
          <QrCode size={17} />
          Create preview
        </button>
      </div>
    </section>
  );
}

function DimensionInput({
  label,
  step,
  value,
  onChange,
}: {
  label: string;
  step: number;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dimension-input">
      <span>{label}</span>
      <input
        min={0}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PreviewPanel({
  product,
  onUpdate,
}: {
  product: DraftPreview;
  onUpdate: (patch: Partial<DraftPreview>) => void;
}) {
  return (
    <section className="tool-panel preview-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{product.name}</h2>
        </div>
        <div className="preview-actions">
          <span className="preview-chip">
            <Ruler size={14} />
            {dimensionsLabel(product)}
          </span>
          {product.previewMethod === "flat" && product.placement === "wall" && (
            <label className="frame-control">
              <input
                checked={product.frameEnabled}
                onChange={(event) => onUpdate({ frameEnabled: event.target.checked })}
                type="checkbox"
              />
              <span>Frame</span>
              <span className="frame-switch" aria-hidden="true" />
            </label>
          )}
        </div>
      </div>

      <div className="preview-stage">
        <TrueSizeScene product={product} />
      </div>
    </section>
  );
}

function ShareHandoffModal({
  product,
  url,
  onClose,
}: {
  product: DraftPreview;
  url: string;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  useEffect(() => {
    let active = true;
    setQrDataUrl("");

    QRCode.toDataURL(url, {
      color: {
        dark: "#17201d",
        light: "#ffffff",
      },
      margin: 2,
      width: 220,
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const copyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("idle");
    }
  };

  const shareLink = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: product.name,
        text: `${product.name} true-size preview`,
        url,
      });
    } catch {
      // User dismissed the share sheet.
    }
  };

  return (
    <div
      className="handoff-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="handoff-modal" role="dialog" aria-modal="true" aria-label="Preview handoff">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>

        <div className="handoff-heading">
          <span className="handoff-icon">
            <QrCode size={24} />
          </span>
          <div>
            <p className="eyebrow">Mobile handoff</p>
            <h2>Scan to view preview</h2>
          </div>
        </div>

        <div className="qr-frame">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code for the product preview link" />
          ) : (
            <span>Generating QR</span>
          )}
        </div>

        <strong className="handoff-dimensions">{dimensionsLabel(product)}</strong>
        <p className="handoff-copy">
          Scan with your phone to open this true-size preview, or copy the preview link.
        </p>

        <div className="handoff-actions">
          <button className="primary-action" type="button" onClick={copyLink}>
            <Copy size={17} />
            {copyState === "copied" ? "Copied" : "Copy link"}
          </button>
          {canShare && (
            <button className="secondary-action" type="button" onClick={shareLink}>
              <Share2 size={17} />
              Share link
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function MobileCameraPreview({
  product,
  url,
  onClose,
  onShare,
}: {
  product: DraftPreview;
  url: string;
  onClose: () => void;
  onShare: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const worldHostRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const objectRef = useRef<THREE.Group | null>(null);
  const placedRef = useRef(false);
  const [status, setStatus] = useState<NativeXrMode>("starting");
  const [message, setMessage] = useState("Checking world tracking");

  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];

    const startCameraFallback = async (
      fallbackMessage = "World tracking is not available in this browser. Camera fallback active.",
    ) => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Camera and world tracking need HTTPS. Use the share link on your phone.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { ideal: 1280 },
            width: { ideal: 720 },
          },
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("fallback");
        setMessage(fallbackMessage);
      } catch {
        if (!active) return;
        setStatus("error");
        setMessage("Camera could not start. You can still share this preview link.");
      }
    };

    const startWorldTracking = async () => {
      const host = worldHostRef.current;
      const xr = navigator.xr;
      if (!host || !window.isSecureContext || !xr) return false;

      const supported = await xr.isSessionSupported("immersive-ar").catch(() => false);
      if (!supported || !active) return false;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType("local");
      renderer.domElement.className = "world-canvas";
      host.append(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x72817a, 1.25));

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
      keyLight.position.set(2.5, 4.2, 2.5);
      scene.add(keyLight);

      const productObject = createMobileWorldObject(product);
      productObject.visible = false;
      scene.add(productObject);
      objectRef.current = productObject;

      const reticleGeometry = new THREE.RingGeometry(0.11, 0.14, 36).rotateX(-Math.PI / 2);
      const reticleMaterial = new THREE.MeshBasicMaterial({
        color: 0x9fd7c3,
        opacity: 0.95,
        transparent: true,
      });
      const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);
      reticleRef.current = reticle;

      const session = await xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: host },
      });
      sessionRef.current = session;

      if (!session.requestHitTestSource) {
        await session.end();
        return false;
      }

      await renderer.xr.setSession(session);
      const viewerSpace = await session.requestReferenceSpace("viewer");
      const localSpace = await session.requestReferenceSpace("local");
      const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      if (!hitTestSource) {
        await session.end();
        return false;
      }
      hitTestSourceRef.current = hitTestSource;

      const disposeWorld = () => {
        hitTestSourceRef.current?.cancel();
        hitTestSourceRef.current = null;
        renderer.setAnimationLoop(null);
        renderer.domElement.remove();
        disposeObject3D(scene);
        renderer.dispose();
        rendererRef.current = null;
        sessionRef.current = null;
      };

      const handleSessionEnd = () => {
        disposeWorld();
        if (active) void startCameraFallback("AR session ended. Camera fallback active.");
      };

      const placeObject = (event: PointerEvent) => {
        event.preventDefault();
        const currentReticle = reticleRef.current;
        const currentObject = objectRef.current;
        if (!currentReticle?.visible || !currentObject) return;

        currentObject.matrix.copy(currentReticle.matrix);
        currentObject.matrix.decompose(currentObject.position, currentObject.quaternion, currentObject.scale);
        currentObject.visible = true;
        placedRef.current = true;
        setStatus("placed");
        setMessage("True-size preview placed. Tap another surface to move it.");
      };

      host.addEventListener("pointerdown", placeObject);
      session.addEventListener("end", handleSessionEnd, { once: true });
      cleanups.push(() => {
        host.removeEventListener("pointerdown", placeObject);
        session.removeEventListener("end", handleSessionEnd);
        if (sessionRef.current) void sessionRef.current.end().catch(() => undefined);
        disposeWorld();
      });

      let surfaceMessageShown = false;
      setStatus("tracking");
      setMessage("Move your phone slowly to find a surface.");

      renderer.setAnimationLoop((_time, frame) => {
        const source = hitTestSourceRef.current;
        const currentReticle = reticleRef.current;
        if (!source || !currentReticle) return;

        const hits = frame.getHitTestResults(source);
        if (hits.length > 0) {
          const pose = hits[0].getPose(localSpace);
          if (pose) {
            currentReticle.visible = true;
            currentReticle.matrix.fromArray(pose.transform.matrix);
            if (!placedRef.current && !surfaceMessageShown) {
              surfaceMessageShown = true;
              setMessage("Surface found. Tap to place the true-size object.");
            }
          }
        } else {
          currentReticle.visible = false;
          surfaceMessageShown = false;
          if (!placedRef.current) setMessage("Move your phone slowly to find a surface.");
        }

        renderer.render(scene, camera);
      });

      return true;
    };

    startWorldTracking()
      .then((started) => {
        if (!started && active) void startCameraFallback();
      })
      .catch(() => {
        if (active) void startCameraFallback();
      });

    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: `${product.name} true-size preview`,
          url,
        });
        return;
      } catch {
        // User dismissed the share sheet.
      }
    }

    onShare();
  };

  const isWorldTracking = status === "tracking" || status === "placed";
  const canShareFromOverlay = status === "fallback" || status === "error";

  return (
    <div
      className={`camera-preview ${isWorldTracking ? "world-tracking" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Mobile product preview"
    >
      <div ref={worldHostRef} className="camera-world-host" />
      <video ref={videoRef} className="camera-video" playsInline muted />
      <div className="camera-shade" />

      <div className="camera-topbar">
        <span>
          <strong>{product.name}</strong>
          <small>{dimensionsLabel(product)}</small>
        </span>
        <button className="camera-icon-button" type="button" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {!isWorldTracking && (
        <div className="camera-size-guide">
          <span>{status === "fallback" ? "Camera fallback" : methodLabels[product.previewMethod]}</span>
          <strong>{dimensionsLabel(product)}</strong>
        </div>
      )}

      <div className="camera-status">
        {isWorldTracking ? <Box size={17} /> : <Camera size={17} />}
        <span>{message}</span>
      </div>

      {canShareFromOverlay && (
        <button className="camera-share" type="button" onClick={shareLink}>
          <Share2 size={17} />
          Share link
        </button>
      )}
    </div>
  );
}

function createMobileWorldObject(product: DraftPreview) {
  const dimensions = getSceneDimensionsInMeters(product);
  const group = new THREE.Group();
  const edgeColor = 0x1f4d45;

  if (product.previewMethod === "flat" && product.placement === "floor") {
    const texture = new THREE.TextureLoader().load(product.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.depth);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    group.add(mesh);
    addPlaneOutline(group, dimensions.width, dimensions.depth, 0.018);
    return group;
  }

  if (product.previewMethod === "flat") {
    const texture = new THREE.TextureLoader().load(product.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const artGroup = new THREE.Group();
    artGroup.position.y = dimensions.height / 2;
    const geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    artGroup.add(mesh);

    if (product.frameEnabled) {
      const rail = Math.max(0.025, Math.min(dimensions.width, dimensions.height) * 0.045);
      const depth = Math.max(dimensions.depth, 0.025);
      const rails = [
        {
          args: [dimensions.width + rail * 2, rail, depth] as [number, number, number],
          position: [0, dimensions.height / 2 + rail / 2, depth / 2] as [number, number, number],
        },
        {
          args: [dimensions.width + rail * 2, rail, depth] as [number, number, number],
          position: [0, -dimensions.height / 2 - rail / 2, depth / 2] as [number, number, number],
        },
        {
          args: [rail, dimensions.height, depth] as [number, number, number],
          position: [-(dimensions.width / 2 + rail / 2), 0, depth / 2] as [number, number, number],
        },
        {
          args: [rail, dimensions.height, depth] as [number, number, number],
          position: [dimensions.width / 2 + rail / 2, 0, depth / 2] as [number, number, number],
        },
      ];

      rails.forEach((railMesh) => {
        const railGeometry = new THREE.BoxGeometry(...railMesh.args);
        const meshRail = new THREE.Mesh(
          railGeometry,
          new THREE.MeshStandardMaterial({ color: 0x26231e, roughness: 0.55 }),
        );
        meshRail.position.set(...railMesh.position);
        artGroup.add(meshRail);
      });
    } else {
      addEdges(mesh, geometry, edgeColor);
    }

    group.add(artGroup);
    return group;
  }

  if (product.previewMethod === "box") {
    addPlaneOutline(group, dimensions.width, dimensions.depth, 0.018);
    const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x9fd7c3,
        opacity: 0.24,
        roughness: 0.22,
        transparent: true,
        transmission: 0.38,
      }),
    );
    mesh.position.y = dimensions.height / 2;
    addEdges(mesh, geometry, edgeColor);
    group.add(mesh);
    return group;
  }

  const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xdbe5e1,
      metalness: 0.08,
      roughness: 0.42,
    }),
  );
  mesh.position.y = dimensions.height / 2;
  addEdges(mesh, geometry, 0x2d6258);
  group.add(mesh);
  return group;
}

function addPlaneOutline(group: THREE.Group, width: number, depth: number, y: number) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const fill = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x1f4d45,
      opacity: 0.18,
      roughness: 0.8,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = y - 0.006;
  group.add(fill);

  const outline = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshBasicMaterial({
      color: 0x1f4d45,
      wireframe: true,
    }),
  );
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = y;
  group.add(outline);
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
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
  const isFlatWall = product.previewMethod === "flat" && product.placement === "wall";
  const maxScale = narrowCanvas ? 0.98 : 1.25;
  const fitScale = Math.min(maxScale, (narrowCanvas ? 2.15 : 2.9) / maxDimension);
  const hasWallBackdrop = product.placement === "wall";
  const cameraPosition: [number, number, number] = isFlatWall
    ? narrowCanvas
      ? [3.25, 2.65, 4.75]
      : [2.6, 2.25, 4.25]
    : narrowCanvas
      ? [4.6, 3.1, 5.25]
      : [3.8, 2.7, 4.3];
  const sceneRotation = isFlatWall ? (narrowCanvas ? -0.12 : -0.18) : narrowCanvas ? -0.2 : -0.38;

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={cameraPosition}
        fov={isFlatWall ? (narrowCanvas ? 45 : 39) : narrowCanvas ? 48 : 43}
      />
      <ambientLight intensity={0.7} />
      <directionalLight castShadow intensity={1.4} position={[3.5, 4.6, 2.4]} />
      <pointLight intensity={0.85} position={[-3, 2, -2]} />
      <group
        scale={fitScale}
        rotation={[0, sceneRotation, 0]}
        position={[0, narrowCanvas ? -0.42 : -0.55, 0]}
      >
        {product.placement === "floor" && <FloorSurface dimensions={meters} />}
        <gridHelper args={[5.2, 13, "#9db3ad", "#e2e9e5"]} />
        {hasWallBackdrop && <WallBackdrop dimensions={meters} />}
        {product.previewMethod === "flat" && product.placement === "floor" && (
          <FlatFloorImage product={product} dimensions={meters} />
        )}
        {product.previewMethod === "flat" && product.placement === "wall" && (
          <FlatWallImage product={product} dimensions={meters} />
        )}
        {product.previewMethod === "box" &&
          (product.glbUrl ? (
            <Suspense
              fallback={<SizeBox dimensions={meters} wallMounted={product.placement === "wall"} />}
            >
              <UploadedModel
                dimensions={meters}
                url={product.glbUrl}
                wallMounted={product.placement === "wall"}
              />
            </Suspense>
          ) : (
            <SizeBox dimensions={meters} wallMounted={product.placement === "wall"} />
          ))}
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

function FloorSurface({
  dimensions,
}: {
  dimensions: { width: number; height: number; depth: number };
}) {
  const floorSize = Math.max(4.8, dimensions.width * 1.75, dimensions.depth * 1.75);

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]}>
      <planeGeometry args={[floorSize, floorSize]} />
      <meshStandardMaterial
        color="#dfe9e3"
        opacity={0.68}
        roughness={0.92}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
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

function UploadedModel({
  dimensions,
  url,
  wallMounted = false,
}: {
  dimensions: { width: number; height: number; depth: number };
  url: string;
  wallMounted?: boolean;
}) {
  const gltf = useGLTF(url) as { scene: THREE.Group };
  const preparedScene = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = Math.min(
      dimensions.width / Math.max(size.x, 0.001),
      dimensions.height / Math.max(size.y, 0.001),
      dimensions.depth / Math.max(size.z, 0.001),
    );

    scene.position.sub(center);
    scene.scale.setScalar(scale);
    scene.traverse((object) => {
      if ("isMesh" in object && object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    return scene;
  }, [dimensions.depth, dimensions.height, dimensions.width, gltf.scene]);
  const yOffset = wallMounted ? 0.45 : 0;

  return (
    <group position={[0, yOffset + dimensions.height / 2, 0]}>
      <primitive object={preparedScene} />
    </group>
  );
}

function addEdges(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, color: number) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color }),
  );
  mesh.add(edges);
}

export default App;
