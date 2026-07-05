export type PreviewType = "floor" | "wall" | "model";
export type Unit = "in" | "ft" | "m" | "cm" | "mm";

export type ProductPreview = {
  id: string;
  name: string;
  category: string;
  previewType: PreviewType;
  width: number;
  height: number;
  depth: number;
  unit: Unit;
  image: string;
  imageLabel: string;
  frameEnabled: boolean;
  published: boolean;
  glbName?: string;
  updatedAt: string;
};
