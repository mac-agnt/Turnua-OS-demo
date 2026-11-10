/* One shared animator for every agent face on the page.
   Each face registers its <svg>; a single rAF loop moves the eyes of the faces
   that are on screen. The eyes sit on an imaginary ellipsoid behind the shell,
   so a sideways look slides them across and foreshortens them, the way a
   painted eye on a ball would turn. They follow the pointer when it is near,
   otherwise they glance around on a clock that suits the agent's state. */

export type GazeEye = { ex: number; ey: number; rot?: number };
export type GazeSpec = {
  /** Ellipsoid radii and centre, in the 0–100 viewBox. */
  sx: number; sy: number; cx: number; cy: number;
  /** How far the eyes may turn, 0–1. Wide eyes get less so they stay on the shell. */
  travel: number;
  eyes: GazeEye[];
};

type Mood = { every: [number, number]; back: number; x: number; y: [number, number]; scan?: boolean };

// How each state looks around while nobody is steering it.
const MOODS: Record<string, Mood> = {
  working:   {every: [650, 1500],  back: .12, x: .75, y: [-.12, .1], scan: true},
  thinking:  {every: [1300, 2800], back: .2,  x: .55, y: [.3, .65]},
  waiting:   {every: [2200, 4200], back: .6,  x: .4,  y: [-.1, .2]},
  attention: {every: [800, 1800],  back: .5,  x: .5,  y: [-.15, .2]},
  idle:      {every: [1800, 4200], back: .35, x: .6,  y: [-.4, .3]}
};

export const REST = {x: 0, y: .06};
const IDLE_MS = 3000;
const BLINK_SHUT = .1;

type Orb = {
  el: SVGSVGElement;
  eyes: SVGGElement[];
  spec: GazeSpec;
  mood: Mood;
  size: number;
  visible: boolean;
  look: {x: number; y: number};
  glance: {x: number; y: number};
  aim: {x: number; y: number} | null;
  seen: number;
  nextGlance: number;
  nextBlink: number;
  blinkAt: number;
  doubleAt: number;
  last: string[];
};

const orbs = new Map<Element, Orb>();
let raf = 0;
let last = 0;
let pointer = {x: 0, y: 0, at: -Infinity, seq: 0};
let io: IntersectionObserver | null = null;
let mq: MediaQueryList | null = null;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const f = (n: number, d = 2) => n.toFixed(d);

/** SVG transform for one eye at a given look and blink (1 open, ~0 shut). */
export function eyePose(spec: GazeSpec, eye: GazeEye, lx: number, ly: number, blink = 1): string {
  const yaw = lx * .62 * spec.travel, pitch = -ly * .5 * spec.travel;
  const n = Math.hypot(eye.ex, eye.ey, 1);
  const x = eye.ex / n, y = eye.ey / n, z = 1 / n;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
  const px = spec.cx + x2 * spec.sx, py = spec.cy - y1 * spec.sy;
  // Squash along the line from the centre out to the eye, by how far it has turned away.
  const ang = Math.atan2(-y1 * spec.sy, x2 * spec.sx) * 180 / Math.PI;
  const k = Math.max(.42, z2);
  return "translate(" + f(px) + " " + f(py) + ") rotate(" + f(ang, 1) + ") scale(" + f(k, 3) + " 1) rotate("
    + f(-ang + (eye.rot || 0), 1) + ") scale(1 " + f(blink, 3) + ")";
}

function blinkAmount(t: number): number {
  if (t < 0) return 1;
  if (t < 60) return 1 - (1 - BLINK_SHUT) * (t / 60);
  if (t < 100) return BLINK_SHUT;
  if (t < 190) return BLINK_SHUT + (1 - BLINK_SHUT) * ((t - 100) / 90);
  return 1;
}

function pickGlance(o: Orb, now: number) {
  const m = o.mood;
  if (Math.random() < m.back) {
    o.glance = {...REST};
  } else {
    const side = m.scan ? (o.glance.x > 0 ? -1 : 1) : (Math.random() < .5 ? -1 : 1);
    o.glance = {x: side * rand(m.x * .45, m.x), y: rand(m.y[0], m.y[1])};
  }
  o.nextGlance = now + rand(m.every[0], m.every[1]);
}

function schedule(o: Orb, now: number) {
  o.nextGlance = now + rand(300, 1500);
  o.nextBlink = now + rand(1200, 5200);
}

function reduced() {
  return !!mq && mq.matches;
}

function paint(o: Orb, lx: number, ly: number, blink: number) {
  for (let i = 0; i < o.eyes.length; i++) {
    const t = eyePose(o.spec, o.spec.eyes[i], lx, ly, blink);
    if (t !== o.last[i]) {
      o.eyes[i].setAttribute("transform", t);
      o.last[i] = t;
    }
  }
}

function tick(now: number) {
  raf = 0;
  const gap = now - last;
  last = now;
  const dt = Math.min(64, gap);
  const fresh = now - pointer.at < IDLE_MS;
  let live = false;

  // Reads first, writes after, so the rect reads never force a layout mid-frame.
  for (const o of orbs.values()) {
    if (!o.visible) continue;
    if (gap > 500) schedule(o, now);
    if (!fresh) { o.aim = null; continue; }
    if (o.seen === pointer.seq) continue;
    o.seen = pointer.seq;
    const r = o.el.getBoundingClientRect();
    const dx = pointer.x - (r.left + r.width / 2), dy = (r.top + r.height / 2) - pointer.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 160 + o.size * 5) { o.aim = null; continue; }
    const m = Math.min(1, dist / (o.size * 1.4)) / Math.max(dist, 1);
    o.aim = {x: dx * m, y: dy * m};
  }

  for (const o of orbs.values()) {
    if (!o.visible) continue;
    live = true;
    if (!o.aim && now >= o.nextGlance) pickGlance(o, now);
    const goal = o.aim || o.glance;
    const ease = 1 - Math.pow(1 - (o.aim ? .2 : .11), dt / 16.67);
    o.look.x += (goal.x - o.look.x) * ease;
    o.look.y += (goal.y - o.look.y) * ease;

    if (now >= o.nextBlink) {
      o.blinkAt = now;
      o.doubleAt = Math.random() < .14 ? now + 230 : -1;
      o.nextBlink = now + rand(2400, 6200);
    }
    const b = Math.min(blinkAmount(now - o.blinkAt), o.doubleAt > 0 ? blinkAmount(now - o.doubleAt) : 1);
    paint(o, o.look.x, o.look.y, b);
  }

  if (live && !reduced()) raf = requestAnimationFrame(tick);
}

function wake() {
  if (raf || reduced()) return;
  last = performance.now();
  raf = requestAnimationFrame(tick);
}

function onMove(e: PointerEvent) {
  pointer = {x: e.clientX, y: e.clientY, at: performance.now(), seq: pointer.seq + 1};
}

function onReduce() {
  if (reduced()) {
    cancelAnimationFrame(raf);
    raf = 0;
    for (const o of orbs.values()) { o.look = {...REST}; paint(o, REST.x, REST.y, 1); }
  } else {
    wake();
  }
}

function setup() {
  window.addEventListener("pointermove", onMove, {passive: true});
  mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onReduce);
  io = new IntersectionObserver(entries => {
    for (const en of entries) {
      const o = orbs.get(en.target);
      if (o) o.visible = en.isIntersecting;
    }
    wake();
  });
}

function teardown() {
  window.removeEventListener("pointermove", onMove);
  mq?.removeEventListener("change", onReduce);
  io?.disconnect();
  io = null;
  mq = null;
  cancelAnimationFrame(raf);
  raf = 0;
}

/** Starts animating a face. Returns the stop function. */
export function trackFace(el: SVGSVGElement, spec: GazeSpec, state: string, size: number): () => void {
  if (!orbs.size) setup();
  const eyes = Array.from(el.querySelectorAll<SVGGElement>("[data-agent-eye]"));
  const now = performance.now();
  const o: Orb = {
    el, eyes, spec, size, mood: MOODS[state] || MOODS.idle, visible: false,
    look: {...REST}, glance: {...REST}, aim: null, seen: -1,
    nextGlance: 0, nextBlink: 0, blinkAt: -1e9, doubleAt: -1, last: eyes.map(e => e.getAttribute("transform") || "")
  };
  schedule(o, now);
  orbs.set(el, o);
  io?.observe(el);
  return () => {
    io?.unobserve(el);
    orbs.delete(el);
    if (!orbs.size) teardown();
  };
}
