import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { css } from "../runtime/template";
import { FACE_TINTS } from "../logic/data";
import { eyePose, REST, trackFace } from "./agentGaze";
import type { GazeEye, GazeSpec } from "./agentGaze";
import "../styles/agent-face.css";

/* Twelve flat, evenly lit shells, each with its own kind of eyes.
   The shell is the agent's own colour: pale on dark themes, deep on light ones,
   with the eyes in the other of the pair. The state lives in the status light
   on the shoulder, so a recoloured agent can never be mistaken for a state. */
const STATES: Record<string, string> = {
  working: "#6aa6f0", thinking: "#e8b23a", waiting: "#9d7cf0",
  complete: "#4fd48a", attention: "#e8705a", idle: "#7c8087"
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rounded box with elliptical corners [rx, ry]: tl, tr, br, bl. */
function box(x: number, y: number, w: number, h: number, c: [number, number][]): string {
  const [tl, tr, br, bl] = c;
  return "M" + r2(x + tl[0]) + " " + y + "H" + r2(x + w - tr[0])
    + "A" + tr[0] + " " + tr[1] + " 0 0 1 " + r2(x + w) + " " + r2(y + tr[1]) + "V" + r2(y + h - br[1])
    + "A" + br[0] + " " + br[1] + " 0 0 1 " + r2(x + w - br[0]) + " " + r2(y + h) + "H" + r2(x + bl[0])
    + "A" + bl[0] + " " + bl[1] + " 0 0 1 " + x + " " + r2(y + h - bl[1]) + "V" + r2(y + tl[1])
    + "A" + tl[0] + " " + tl[1] + " 0 0 1 " + r2(x + tl[0]) + " " + y + "Z";
}
const rounded = (x: number, y: number, w: number, h: number, r: number) => box(x, y, w, h, [[r, r], [r, r], [r, r], [r, r]]);
/** Centred pill (a circle when w = h). */
const pill = (w: number, h: number) => rounded(-w / 2, -h / 2, w, h, Math.min(w, h) / 2);

function squircle(a: number, b: number, n: number): string {
  let d = "";
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = 50 + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = 50 + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    d += (i ? "L" : "M") + r2(x) + " " + r2(y);
  }
  return d + "Z";
}

/** Smooth closed curve through points on a wobbly ellipse. */
function pebble(radii: number[], rx: number, ry: number, turn: number): string {
  const n = radii.length;
  const p = radii.map((k, i) => {
    const a = turn + (i / n) * Math.PI * 2;
    return [50 + Math.cos(a) * rx * k, 50 + Math.sin(a) * ry * k];
  });
  let d = "M" + r2(p[0][0]) + " " + r2(p[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    d += "C" + r2(p1[0] + (p2[0] - p0[0]) / 6) + " " + r2(p1[1] + (p2[1] - p0[1]) / 6)
      + " " + r2(p2[0] - (p3[0] - p1[0]) / 6) + " " + r2(p2[1] - (p3[1] - p1[1]) / 6)
      + " " + r2(p2[0]) + " " + r2(p2[1]);
  }
  return d + "Z";
}

const CIRCLE = rounded(6, 6, 88, 88, 44);

type EyeKind = { d: string; ex: number; ey: number; rot?: number };
const pair = (k: EyeKind): GazeEye[] => k.ex
  ? [{ex: -k.ex, ey: k.ey, rot: k.rot}, {ex: k.ex, ey: k.ey, rot: k.rot ? -k.rot : 0}]
  : [{ex: 0, ey: k.ey}];

const EYES: Record<string, EyeKind> = {
  capsule:  {d: pill(10.5, 19), ex: .34, ey: .07},
  dot:      {d: pill(11.5, 11.5), ex: .34, ey: .05},
  small:    {d: pill(9.5, 9.5), ex: .36, ey: .3},
  round:    {d: pill(16, 16), ex: .38, ey: .05},
  bean:     {d: pill(16.5, 10.5), ex: .38, ey: .05},
  slit:     {d: pill(17, 5.5), ex: .4, ey: .03},
  visor:    {d: pill(50, 11.5), ex: 0, ey: .06},
  single:   {d: pill(13.5, 22), ex: 0, ey: .07},
  block:    {d: rounded(-6.5, -6.5, 13, 13, 3.6), ex: .34, ey: .05},
  // Flat-bottomed half moons read as a smile; flat-topped ones as a lowered lid.
  moon:     {d: "M-8 3.6A8 8.6 0 0 1 8 3.6Z", ex: .38, ey: .04},
  lid:      {d: "M-6.5 -5.5H6.5V0A6.5 6.5 0 0 1 -6.5 0Z", ex: .36, ey: .06},
  tilt:     {d: "M-5.8 0A5.8 9 0 1 0 5.8 0A5.8 9 0 1 0 -5.8 0Z", ex: .34, ey: .08, rot: 14}
};

type Variant = { body: string; light: [number, number]; gaze: Omit<GazeSpec, "eyes">; eye: string };

const VARIANTS: Record<string, Variant> = {
  "crown-pebble":      {body: squircle(44, 42, 2.7), light: [83, 18], gaze: {sx: 40, sy: 38, cx: 50, cy: 50, travel: 1}, eye: "capsule"},
  "executive-capsule": {body: rounded(6, 13, 88, 74, 30), light: [85, 22], gaze: {sx: 40, sy: 33, cx: 50, cy: 50, travel: .9}, eye: "dot"},
  "shield":            {body: "M50 7C75 7 92 17 92 39C92 63 75 92 50 93C25 92 8 63 8 39C8 17 25 7 50 7Z", light: [84, 21],
                        gaze: {sx: 38, sy: 36, cx: 50, cy: 45, travel: .85}, eye: "tilt"},
  "glass-visor":       {body: CIRCLE, light: [81, 19], gaze: {sx: 42, sy: 42, cx: 50, cy: 50, travel: .62}, eye: "visor"},
  "control-cube":      {body: rounded(8, 8, 84, 84, 24), light: [85, 15], gaze: {sx: 40, sy: 40, cx: 50, cy: 50, travel: .85}, eye: "block"},
  "low-dome":          {body: box(6, 8, 88, 84, [[44, 52], [44, 52], [18, 16], [18, 16]]), light: [81, 22],
                        gaze: {sx: 40, sy: 36, cx: 50, cy: 55, travel: .9}, eye: "moon"},
  "offset-pebble":     {body: pebble([1, .95, 1.03, .97, 1.04, .94, 1.01, 1.03], 44, 42, .35), light: [82, 19],
                        gaze: {sx: 39, sy: 37, cx: 51, cy: 50, travel: .9}, eye: "bean"},
  "rim-capsule":       {body: rounded(5, 20, 90, 60, 30), light: [86, 29], gaze: {sx: 42, sy: 26, cx: 50, cy: 50, travel: .85}, eye: "slit"},
  "wide-eyed":         {body: CIRCLE, light: [81, 19], gaze: {sx: 42, sy: 42, cx: 50, cy: 50, travel: .85}, eye: "round"},
  "precision-brow":    {body: rounded(10, 6, 80, 88, 28), light: [82, 14], gaze: {sx: 35, sy: 40, cx: 50, cy: 50, travel: .85}, eye: "lid"},
  "tall-unit":         {body: rounded(17, 4, 66, 92, 33), light: [74, 14], gaze: {sx: 28, sy: 40, cx: 50, cy: 46, travel: .8}, eye: "small"},
  "soft-asymmetric":   {body: pebble([1.03, .96, 1, 1.05, .95, 1.02, .97, 1], 44, 42, -.2), light: [83, 20],
                        gaze: {sx: 40, sy: 38, cx: 49, cy: 50, travel: .8}, eye: "single"}
};

const PALE = new Map<string, string>(FACE_TINTS.map((t: string[]) => [t[0].toLowerCase(), t[2]]));

/** A tint outside the palette still gets a pale partner: the tint mixed most of the way to white. */
function paleOf(tint: string): string {
  const hit = PALE.get(tint.toLowerCase());
  if (hit) return hit;
  const h = tint.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return "#e4e6e8";
  const n = parseInt(h, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * .86).toString(16).padStart(2, "0");
  return "#" + mix(n >> 16) + mix((n >> 8) & 255) + mix(n & 255);
}

type FaceProps = {
  shape?: string;
  state?: string;
  tint?: string;
  size?: number | string;
  /** Position-only styles placed on the host wrapper. */
  hostStyle?: string | Record<string, string>;
};

const HOST_STYLE_PROPS = new Set(["position", "left", "right", "top", "bottom", "inset", "width", "height", "z-index", "transform"]);

function hostPositionStyle(style: FaceProps["hostStyle"]) {
  const all = css(style);
  if (!all) return undefined;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(all)) {
    if (HOST_STYLE_PROPS.has(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()))) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** An agent's face: the shell is the agent's own colour, the status light carries its state. */
export default function AgentFace(props: FaceProps) {
  const size = Number(props.size) || 40;
  const shape = VARIANTS[props.shape || ""] ? props.shape! : "crown-pebble";
  const state = STATES[props.state ?? ""] ? props.state! : "idle";
  const tint = props.tint || "#191c1f";
  const v = VARIANTS[shape];
  const kind = EYES[v.eye];
  const spec: GazeSpec = {...v.gaze, eyes: pair(kind)};
  const mask = "ao" + useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);

  // Faces too small to see (the hidden preload in the shell) stay still.
  useEffect(() => {
    if (!ref.current || size < 12) return;
    return trackFace(ref.current, spec, state, size);
    // spec is derived from shape alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, state, size]);

  // Small faces get a relatively bigger light so the state still reads at 20px.
  const lightR = size < 28 ? 10.5 : 8;
  const live = state === "working" || state === "thinking";
  const vars = {"--ao-tint": tint, "--ao-pale": paleOf(tint)} as CSSProperties;

  return (
    <div className="sc-host" data-sc-name="AgentFace" style={hostPositionStyle(props.hostStyle)}>
      <svg ref={ref} data-agent-orb="" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"
        style={{...vars, display: "block", flex: "none", overflow: "visible"}}>
        <mask id={mask} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
          <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
          <circle cx={v.light[0]} cy={v.light[1]} r={lightR + 4} fill="#000" />
        </mask>
        <g mask={"url(#" + mask + ")"}>
          <path className="ao-body" d={v.body} />
          {spec.eyes.map((e, i) => (
            <g key={i} data-agent-eye="" transform={eyePose(spec, e, REST.x, REST.y)}>
              <path className="ao-eye" d={kind.d} />
            </g>
          ))}
        </g>
        <circle data-agent-light={live ? "live" : ""} cx={v.light[0]} cy={v.light[1]} r={lightR} fill={STATES[state]} />
      </svg>
    </div>
  );
}
