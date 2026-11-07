import { z } from "zod";

// A declarative motion-graphics scene: one fixed renderer draws it, so a scene is data and never code.

export const SCENE_GRAPH_VERSION = "scene-graph-v1";
export const MAX_SCENE_SECONDS = 30;
export const MAX_SCENE_NODES = 200;
export const MAX_SCENE_DEPTH = 4;
export const SCENE_FPS = [24, 25, 30] as const;

/** Families a scene may name, with the faces each one has; anything else is refused before render. */
export const SCENE_FONTS: Readonly<Record<string, { weights: readonly number[]; italic: boolean }>> = {
  Inter: { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  Poppins: { weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  "Plus Jakarta Sans": { weights: [200, 300, 400, 500, 600, 700, 800], italic: true },
  Nunito: { weights: [200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  "Playfair Display": { weights: [400, 500, 600, 700, 800, 900], italic: true },
  "Instrument Serif": { weights: [400], italic: true },
  "DM Serif Display": { weights: [400], italic: true },
  "JetBrains Mono": { weights: [100, 200, 300, 400, 500, 600, 700, 800], italic: true },
  Caveat: { weights: [400, 500, 600, 700], italic: false },
  "Permanent Marker": { weights: [400], italic: false },
};

export const SCENE_EASINGS = ["linear", "in", "out", "inOut", "back", "step"] as const;
export const SCENE_NUMBER_PROPS = ["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "width", "height", "draw", "blur", "radius",
  "rotateX", "rotateY"] as const;
export const SCENE_COLOR_PROPS = ["fill", "stroke", "color"] as const;
export const SCENE_NODE_TYPES = ["rect", "ellipse", "path", "text", "image", "group"] as const;
/** How a text shows over its window: characters typed, words one by one, `from` erased then the text typed, or glyphs settling into the text. */
export const SCENE_REVEALS = ["type", "words", "swap", "scramble"] as const;

const hex = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "a colour is #RRGGBB or #RRGGBBAA");
const seconds = z.number().min(0).max(MAX_SCENE_SECONDS);
const coord = z.number().min(-10_000).max(10_000);
const size = z.number().min(0).max(10_000);
const unit = z.number().min(0).max(1);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "an id is 1–40 letters, digits, _ or -");

const springSchema = z.object({ damping: z.number().min(1).max(200), stiffness: z.number().min(1).max(1000), mass: z.number().min(0.1).max(10) }).strict();
const keyframeSchema = z.object({
  t: seconds,
  v: z.union([z.number().min(-10_000).max(10_000), hex]),
  ease: z.enum(SCENE_EASINGS).optional(),
  spring: springSchema.optional(),
}).strict();
const trackSchema = z.object({ prop: z.enum([...SCENE_NUMBER_PROPS, ...SCENE_COLOR_PROPS]), keys: z.array(keyframeSchema).min(1).max(24) }).strict();
const shadowSchema = z.object({ x: coord, y: coord, blur: size, color: hex }).strict();

const base = {
  id,
  x: coord,
  y: coord,
  anchor: z.tuple([unit, unit]).optional(),
  opacity: unit.optional(),
  scale: z.number().min(0).max(20).optional(),
  rotation: z.number().min(-3600).max(3600).optional(),
  from_s: seconds.optional(),
  to_s: seconds.optional(),
  anim: z.array(trackSchema).max(16).optional(),
  shadow: shadowSchema.optional(),
  /** Motion blur along the node's own x and y movement (#1175 S5 C7): this share of the pixels it moves in a frame, 1 a frame's travel. */
  smear: z.number().min(0).max(2).optional(),
};
const stroke = { stroke: hex.optional(), strokeWidth: z.number().min(0).max(200).optional() };
const pathData = z.string().min(1).max(8000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/, "path data uses SVG path commands and numbers only");

const rectSchema = z.object({ ...base, type: z.literal("rect"), width: size, height: size, fill: hex.optional(), radius: size.optional(), ...stroke }).strict();
const ellipseSchema = z.object({ ...base, type: z.literal("ellipse"), width: size, height: size, fill: hex.optional(), ...stroke }).strict();
const pathSchema = z.object({
  ...base, type: z.literal("path"), width: size, height: size, d: pathData, fill: hex.optional(), ...stroke,
  lineCap: z.enum(["butt", "round", "square"]).optional(), lineJoin: z.enum(["miter", "round", "bevel"]).optional(), draw: unit.optional(),
  // The shape bends into `d` over the window (#1175 S5 C4), in the node's own coordinates as its first `d`.
  morph: z.object({ d: pathData, from_s: seconds, to_s: seconds, ease: z.enum(SCENE_EASINGS).optional() }).strict().optional(),
}).strict();
const fontSchema = z.object({ family: z.string().min(1).max(60), weight: z.number().int().min(100).max(1000), italic: z.boolean().optional() }).strict();
const window = { from_s: seconds, to_s: seconds };
const textSchema = z.object({
  ...base, type: z.literal("text"), text: z.string().min(1).max(400), font: fontSchema, size: z.number().min(1).max(1000), color: hex,
  align: z.enum(["left", "center", "right"]).optional(), width: size.optional(), lineHeight: z.number().min(0.5).max(3).optional(),
  letterSpacing: z.number().min(-50).max(200).optional(),
  box: z.object({ fill: hex.optional(), radius: size.optional(), padX: size.optional(), padY: size.optional(), ...stroke }).strict().optional(),
  reveal: z.object({ mode: z.enum(SCENE_REVEALS), ...window, from: z.string().min(1).max(400).optional() }).strict().optional(),
  count: z.object({ from: z.number(), to: z.number(), ...window, decimals: z.number().int().min(0).max(4).optional(), separator: z.enum([",", " ", ""]).optional(),
    ease: z.enum(SCENE_EASINGS).optional() }).strict().optional(),
}).strict();
const imageSchema = z.object({
  ...base, type: z.literal("image"), width: size, height: size, src: id, fit: z.enum(["cover", "contain"]).optional(), radius: size.optional(),
}).strict();

export type SceneTrack = z.infer<typeof trackSchema>;
export type SceneKeyframe = z.infer<typeof keyframeSchema>;
export type SceneRect = z.infer<typeof rectSchema>;
export type SceneEllipse = z.infer<typeof ellipseSchema>;
export type ScenePath = z.infer<typeof pathSchema>;
export type SceneText = z.infer<typeof textSchema>;
export type SceneImage = z.infer<typeof imageSchema>;
export interface SceneGroup {
  id: string; x: number; y: number; anchor?: [number, number] | undefined; opacity?: number | undefined; scale?: number | undefined;
  rotation?: number | undefined; from_s?: number | undefined; to_s?: number | undefined; anim?: SceneTrack[] | undefined;
  shadow?: z.infer<typeof shadowSchema> | undefined; smear?: number | undefined;
  type: "group"; width?: number | undefined; height?: number | undefined;
  clip?: { shape: "rect" | "ellipse" | "path"; radius?: number | undefined; d?: string | undefined } | undefined;
  rotateX?: number | undefined; rotateY?: number | undefined;
  children: SceneNode[];
}
/** The viewing distance a tilted group is seen from, in canvas pixels (#1175 S5 C5). */
export const SCENE_PERSPECTIVE_PX = 1600;
const tilt = z.number().min(-80).max(80);
export type SceneNode = SceneRect | SceneEllipse | ScenePath | SceneText | SceneImage | SceneGroup;

const groupSchema: z.ZodType<SceneGroup> = z.lazy(() => z.object({
  ...base, type: z.literal("group"), width: size.optional(), height: size.optional(),
  clip: z.object({ shape: z.enum(["rect", "ellipse", "path"]), radius: size.optional(), d: pathData.optional() }).strict().optional(),
  rotateX: tilt.optional(), rotateY: tilt.optional(),
  children: z.array(nodeSchema).max(MAX_SCENE_NODES),
}).strict());
const nodeSchema: z.ZodType<SceneNode> = z.lazy(() => z.union([rectSchema, ellipseSchema, pathSchema, textSchema, imageSchema, groupSchema]));

export const sceneGraphSchema = z.object({
  version: z.literal(SCENE_GRAPH_VERSION),
  canvas: z.object({ width: z.number().int().min(240).max(3840), height: z.number().int().min(240).max(3840),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30)]) }).strict(),
  duration_s: z.number().min(0.2).max(MAX_SCENE_SECONDS),
  background: hex.nullable(),
  assets: z.array(z.object({ id, note: z.string().max(200).optional() }).strict()).max(20).optional(),
  nodes: z.array(nodeSchema).min(1).max(MAX_SCENE_NODES),
}).strict();
export type SceneGraph = z.infer<typeof sceneGraphSchema>;

/** Smallest legible text on a canvas, in canvas pixels: 20 px on a 1920-tall frame. */
export const minSceneTextPx = (canvas: { height: number }): number => Math.ceil(canvas.height / 96);

/** Props each node type may animate; a colour prop takes #RRGGBB values, every other a number. */
const ANIMATABLE: Record<SceneNode["type"], ReadonlySet<string>> = {
  rect: new Set(["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "width", "height", "blur", "radius", "fill", "stroke"]),
  ellipse: new Set(["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "width", "height", "blur", "fill", "stroke"]),
  path: new Set(["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "draw", "blur", "fill", "stroke"]),
  text: new Set(["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "blur", "color"]),
  image: new Set(["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "width", "height", "blur", "radius"]),
  group: new Set(["x", "y", "opacity", "scale", "scaleX", "scaleY", "rotation", "width", "height", "blur", "radius", "rotateX", "rotateY"]),
};
const COLOR_PROPS: ReadonlySet<string> = new Set(SCENE_COLOR_PROPS);

/** Average advance of a glyph as a share of the font size; the renderer measures, this only bounds the check. */
const glyphShare = (family: string) => (family === "JetBrains Mono" ? 0.6 : family === "Caveat" ? 0.42 : 0.55);

/** A node's resting value of a prop: its last keyframe, or the static value. */
function rest(node: SceneNode, prop: string, fallback: number): number {
  const keys = node.anim?.find(track => track.prop === prop)?.keys;
  const last = keys?.[keys.length - 1]?.v;
  return typeof last === "number" ? last : fallback;
}

interface Box { x: number; y: number; width: number; height: number }

function ownSize(node: SceneNode): { width: number; height: number } | null {
  // A swap shows its erased words first, so the longer of the two is measured.
  if (node.type === "text" && node.reveal?.from !== undefined && node.reveal.from.length > node.text.length) return ownSize({ ...node, text: node.reveal.from, reveal: undefined });
  if (node.type === "text") {
    const lines = node.text.split("\n");
    const widest = Math.max(...lines.map(line => line.length)) * node.size * glyphShare(node.font.family) + (node.letterSpacing ?? 0) * Math.max(...lines.map(l => l.length));
    const padX = node.box?.padX ?? 0, padY = node.box?.padY ?? 0;
    const width = node.width ?? widest;
    const wrapped = node.width ? lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length * node.size * glyphShare(node.font.family) / node.width!)), 0) : lines.length;
    return { width: width + 2 * padX, height: wrapped * node.size * (node.lineHeight ?? 1.2) + 2 * padY };
  }
  if (node.type === "group") return node.width !== undefined && node.height !== undefined ? { width: rest(node, "width", node.width), height: rest(node, "height", node.height) } : null;
  return { width: rest(node, "width", node.width), height: rest(node, "height", node.height) };
}

/** Where a scene draws, in shares of its canvas: every shape it ever shows, at its first and its resting pose, cut to the canvas; null when it shows */
/** nothing. Captions meet a scene drawn over the presenter by this box. */
export function sceneGraphFootprint(scene: SceneGraph): { left: number; top: number; width: number; height: number } | null {
  const { width: W, height: H } = scene.canvas;
  let left = W, top = H, right = 0, bottom = 0;
  const at = (node: SceneNode, prop: string, fallback: number, last: boolean) => {
    const keys = node.anim?.find(track => track.prop === prop)?.keys, key = keys?.[last ? keys.length - 1 : 0]?.v;
    return typeof key === "number" ? key : fallback;
  };
  const shown = (node: SceneNode) => node.anim?.find(track => track.prop === "opacity")?.keys.some(key => typeof key.v === "number" && key.v > 0)
    ?? (node.opacity ?? 1) > 0;
  const visit = (node: SceneNode, origin: { x: number; y: number; scale: number }, last: boolean) => {
    if (!shown(node)) return;
    const scale = origin.scale * at(node, "scale", node.scale ?? 1, last), own = ownSize(node), [ax, ay] = node.anchor ?? [0, 0];
    const x = origin.x + origin.scale * at(node, "x", node.x, last) - ax * (own?.width ?? 0) * scale;
    const y = origin.y + origin.scale * at(node, "y", node.y, last) - ay * (own?.height ?? 0) * scale;
    // A group draws nothing of its own: only its children mark the frame.
    if (node.type === "group") { for (const child of node.children) visit(child, { x, y, scale }, last); return; }
    if (!own) return;
    left = Math.min(left, Math.max(0, x)); top = Math.min(top, Math.max(0, y));
    right = Math.max(right, Math.min(W, x + own.width * scale)); bottom = Math.max(bottom, Math.min(H, y + own.height * scale));
  };
  for (const last of [false, true]) for (const node of scene.nodes) visit(node, { x: 0, y: 0, scale: 1 }, last);
  return right > left && bottom > top ? { left: left / W, top: top / H, width: (right - left) / W, height: (bottom - top) / H } : null;
}

export type SceneGraphValidation =
  | { ok: true; scene: SceneGraph; warnings: string[] }
  | { ok: false; errors: string[] };

/** The brand teal; a purple a scene may not keep turns to its hue. */
export const SCENE_BRAND_TEAL = "#1385A3";
/** Blue-violet to magenta: refused unless the customer's own colours hold one. */
export const SCENE_PURPLE_HUES = [230, 335] as const;

const channels = (colour: string) => [1, 3, 5].map(at => Number.parseInt(colour.slice(at, at + 2), 16) / 255) as [number, number, number];
function hsl(colour: string): { h: number; s: number; l: number } {
  const [r, g, b] = channels(colour), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const h = d === 0 ? 0 : 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return { h, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

/** Whether a #RRGGBB(AA) colour is a chromatic purple by hue; greys of any tint are not. */
export function isScenePurple(colour: string): boolean {
  const [r, g, b] = channels(colour);
  if (Math.max(r, g, b) - Math.min(r, g, b) < 0.15) return false;
  const { h } = hsl(colour);
  return h >= SCENE_PURPLE_HUES[0] && h <= SCENE_PURPLE_HUES[1];
}

/** The colour on the brand teal's hue at its own saturation and lightness, alpha kept. */
function toTeal(colour: string): string {
  const { s, l } = hsl(colour), h = hsl(SCENE_BRAND_TEAL).h / 60, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}${colour.slice(7)}`;
}

/** Every key a scene draws a colour under, anywhere: fills, strokes, text, box and shadow colours, the ground, colour keyframes. */
const COLOUR_KEYS = new Set(["fill", "stroke", "color", "background", "v"]);
/** Maps each drawn colour of a scene, parsed or not; the purple check and the repair both walk it, so they cannot disagree. */
function mapColours(value: unknown, turn: (colour: string) => string, key?: string): unknown {
  if (Array.isArray(value)) return value.map(item => mapColours(item, turn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, mapColours(item, turn, name)]));
  return typeof value === "string" && key && COLOUR_KEYS.has(key) && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? turn(value) : value;
}

/** Turns every purple colour of a scene, parsed or not, to the brand teal's hue; returns the colours it changed. */
export function repairScenePurple<T>(input: T): { scene: T; repaired: string[] } {
  const repaired = new Set<string>();
  const scene = mapColours(input, colour => { if (!isScenePurple(colour)) return colour; repaired.add(colour); return toTeal(colour); }) as T;
  return { scene, repaired: [...repaired] };
}

/** Parse, then check what the schema cannot: unique ids, timing inside the scene, fonts, text size, canvas bounds and purple.
 * Errors are written to be fed back to the author; `allowPurple` only when the customer's own colours hold a purple. */
export function validateSceneGraph(input: unknown, options: { allowPurple?: boolean } = {}): SceneGraphValidation {
  const parsed = sceneGraphSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 40).map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  }
  const scene = parsed.data, errors: string[] = [], warnings: string[] = [], seen = new Set<string>();
  const duration = scene.duration_s, minText = minSceneTextPx(scene.canvas), assets = new Set((scene.assets ?? []).map(asset => asset.id));
  let count = 0;

  const inScene = (t: number, where: string) => { if (t > duration + 1e-6) errors.push(`${where}: ${t}s is after the scene ends at ${duration}s`); };
  const visit = (node: SceneNode, path: string, depth: number, origin: { x: number; y: number; scale: number }) => {
    count++;
    if (depth > MAX_SCENE_DEPTH) errors.push(`${path}: groups nest deeper than ${MAX_SCENE_DEPTH}`);
    if (seen.has(node.id)) errors.push(`${path}: id "${node.id}" is used twice`);
    seen.add(node.id);
    const from = node.from_s ?? 0, to = node.to_s ?? duration;
    inScene(from, `${path}.from_s`);
    inScene(to, `${path}.to_s`);
    if (from >= to) errors.push(`${path}: from_s ${from} is not before to_s ${to}`);
    const props = new Set<string>();
    for (const [i, track] of (node.anim ?? []).entries()) {
      const where = `${path}.anim.${i}`;
      if (props.has(track.prop)) errors.push(`${where}: "${track.prop}" is animated twice`);
      props.add(track.prop);
      if (!ANIMATABLE[node.type].has(track.prop)) errors.push(`${where}: a ${node.type} cannot animate "${track.prop}"`);
      if (track.prop === "draw" && node.type === "path" && !node.stroke) errors.push(`${where}: "draw" needs a stroke to draw`);
      for (const [k, key] of track.keys.entries()) {
        inScene(key.t, `${where}.keys.${k}.t`);
        if (COLOR_PROPS.has(track.prop) !== (typeof key.v === "string")) errors.push(`${where}.keys.${k}.v: "${track.prop}" takes ${COLOR_PROPS.has(track.prop) ? "a #RRGGBB colour" : "a number"}`);
        if ((track.prop === "rotateX" || track.prop === "rotateY") && typeof key.v === "number" && Math.abs(key.v) > 80) {
          errors.push(`${where}.keys.${k}.v: a tilt stays within ±80°, past it the group turns edge-on`);
        }
        if (k > 0 && key.t <= track.keys[k - 1]!.t) errors.push(`${where}.keys.${k}.t: keyframe times must rise (${key.t} after ${track.keys[k - 1]!.t})`);
      }
    }
    if (node.type === "text") {
      const face = SCENE_FONTS[node.font.family];
      if (!face) errors.push(`${path}.font.family: "${node.font.family}" is not available; use one of ${Object.keys(SCENE_FONTS).join(", ")}`);
      else {
        if (!face.weights.includes(node.font.weight)) errors.push(`${path}.font.weight: ${node.font.family} has weights ${face.weights.join(", ")}, not ${node.font.weight}`);
        if (node.font.italic && !face.italic) errors.push(`${path}.font.italic: ${node.font.family} has no italic`);
      }
      const shown = node.size * origin.scale * rest(node, "scale", node.scale ?? 1);
      if (shown < minText) errors.push(`${path}.size: text draws at ${shown.toFixed(1)} px, under the ${minText} px minimum for a ${scene.canvas.height} px tall canvas`);
      for (const part of ["reveal", "count"] as const) {
        const span = node[part];
        if (!span) continue;
        inScene(span.to_s, `${path}.${part}.to_s`);
        if (span.from_s >= span.to_s) errors.push(`${path}.${part}: from_s ${span.from_s} is not before to_s ${span.to_s}`);
      }
      if (node.count && !node.text.includes("{n}")) errors.push(`${path}.text: a counting text needs "{n}" where the number goes`);
      if (node.reveal && (node.reveal.mode === "swap") !== (node.reveal.from !== undefined)) {
        errors.push(`${path}.reveal.from: ${node.reveal.mode === "swap" ? "a swap needs the words it erases in from" : "only a swap takes from"}`);
      }
    }
    if (node.type === "path" && node.morph) {
      inScene(node.morph.to_s, `${path}.morph.to_s`);
      if (node.morph.from_s >= node.morph.to_s) errors.push(`${path}.morph: from_s ${node.morph.from_s} is not before to_s ${node.morph.to_s}`);
    }
    if (node.type === "image" && !assets.has(node.src)) errors.push(`${path}.src: "${node.src}" is not one of the scene's assets`);
    if (node.type === "group" && node.clip) {
      if (node.width === undefined || node.height === undefined) errors.push(`${path}.clip: a clipping group needs width and height`);
      if (node.clip.shape === "path" && !node.clip.d) errors.push(`${path}.clip.d: a path clip needs path data`);
    }

    const scale = origin.scale * rest(node, "scale", node.scale ?? 1);
    const own = ownSize(node);
    const [ax, ay] = node.anchor ?? [0, 0];
    const at = { x: origin.x + origin.scale * rest(node, "x", node.x), y: origin.y + origin.scale * rest(node, "y", node.y) };
    const visible = rest(node, "opacity", node.opacity ?? 1) > 0;
    if (own && visible) {
      const box: Box = { x: at.x - ax * own.width * scale, y: at.y - ay * own.height * scale, width: own.width * scale, height: own.height * scale };
      const { width: W, height: H } = scene.canvas, slack = 2;
      const outside = box.x + box.width <= 0 || box.y + box.height <= 0 || box.x >= W || box.y >= H;
      if (outside) errors.push(`${path}: rests entirely outside the ${W}×${H} canvas (box ${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}×${box.height.toFixed(0)})`);
      else if (node.type === "text" && (box.x < -slack || box.y < -slack || box.x + box.width > W + slack || box.y + box.height > H + slack)) {
        errors.push(`${path}: text is cut by the canvas edge at rest (estimated box ${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}×${box.height.toFixed(0)})`);
      }
    }
    if (node.type === "group") {
      const groupOrigin = { x: at.x - ax * (own?.width ?? 0) * scale, y: at.y - ay * (own?.height ?? 0) * scale, scale };
      for (const [i, child] of node.children.entries()) visit(child, `${path}.children.${i}`, depth + 1, groupOrigin);
    }
  };
  for (const [i, node] of scene.nodes.entries()) visit(node, `nodes.${i}`, 1, { x: 0, y: 0, scale: 1 });
  if (count > MAX_SCENE_NODES) errors.push(`the scene has ${count} nodes, over the ${MAX_SCENE_NODES} limit`);
  const purples = new Set<string>();
  mapColours(scene, colour => { if (isScenePurple(colour)) purples.add(colour); return colour; });
  if (purples.size && !options.allowPurple) {
    errors.push(`purple colours ${[...purples].join(", ")} are not allowed: use the brand teal ${SCENE_BRAND_TEAL} or another hue outside ${SCENE_PURPLE_HUES.join("–")}°`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, scene, warnings };
}
