/* Turnua brand guidelines (demo) and the post drafting used by Social Studio
   and the Marketing agent. Drafting is template based and runs in the browser;
   nothing is sent to a model or a social network. */
import type { DB, SocialPlatform } from "../../types";
import { eurShort, num } from "../../time";

export const BRAND = {
  colours: [
    { name: "Turnua Lime", hex: "#DBFF00", use: "One accent per creative: the bar, a word or the frame" },
    { name: "Graphite", hex: "#16181C", use: "Backgrounds, gradients and text panels" },
    { name: "White", hex: "#FFFFFF", use: "Headlines on photography" },
    { name: "Steel", hex: "#A6C4D9", use: "Secondary detail only" },
  ],
  type: "Geist Bold, all caps, tight tracking for headlines. One to five words.",
  voice: [
    "Plain words. Numbers over adjectives.",
    "Credit the crew by team, not by first name only.",
    "Never name a confidential client; say “a hyperscale client”.",
    "No emojis. Three to five hashtags, always #Turnua.",
    "End with one clear next step or turnua.com.",
  ],
  photo: "Real sites and real crews. Full PPE in every safety shot. No stock photos of handshakes.",
};

export const TEMPLATES = [
  { id: "bar", label: "Lime bar", blurb: "Photo full bleed, graphite fade, headline over a lime bar" },
  { id: "split", label: "Split panel", blurb: "Graphite panel with lime headline beside the photo" },
  { id: "frame", label: "Lime frame", blurb: "Thin lime frame, logo badge, headline bottom left" },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]["id"];

export const FORMATS = {
  "1:1": { w: 1080, h: 1080, label: "Square 1:1", for: "Instagram, Facebook, LinkedIn" },
  "4:5": { w: 1080, h: 1350, label: "Portrait 4:5", for: "Instagram and LinkedIn feed" },
  "9:16": { w: 1080, h: 1920, label: "Story 9:16", for: "Reels, Stories, TikTok" },
  "1.91:1": { w: 1200, h: 628, label: "Landscape 1.91:1", for: "LinkedIn, X, Facebook links" },
} as const;

export const TOPICS = ["Award", "Project milestone", "Crew spotlight", "Safety", "Case study", "Hiring", "Event", "Service line"] as const;
export type Topic = (typeof TOPICS)[number];

export const BEST_TIMES: Record<SocialPlatform, string> = { LinkedIn: "Tue to Thu, 08:30", Instagram: "Weekdays, 12:30", Facebook: "Weekdays, 13:00", X: "Weekdays, 09:00", TikTok: "Weekdays, 19:00" };

const pick = <T,>(xs: readonly T[], i: number) => xs[((i % xs.length) + xs.length) % xs.length];

export interface Draft { headline: string; captions: Partial<Record<SocialPlatform, string>>; hashtags: string[] }

/** Draft headline, per platform captions and hashtags from the topic, project and point. */
export function draftPost(db: DB, o: { topic: Topic; projectId?: string; point: string; tone: "Professional" | "Proud" | "Technical"; variant: number; mediaKind: "image" | "video" | "none" }): Draft {
  const p = db.projects.find((x) => x.id === o.projectId);
  const client = p ? db.clients.find((c) => c.id === p.clientId) : undefined;
  const who = client ? (client.confidential ? "a hyperscale client" : client.name) : "our clients";
  const where = p ? p.location : "Ireland";
  const point = o.point.trim().replace(/\.$/, "");
  const progress = p?.progressLabel || "";
  const v = o.variant;
  const watch = o.mediaKind === "video" ? "Watch the team at work. " : "";
  const close = pick(["More at turnua.com.", "Talk to us about your next project at turnua.com.", "Find out how we deliver at turnua.com."], v);

  let headline = "";
  let body = "";
  let tags: string[] = [];
  switch (o.topic) {
    case "Award":
      headline = pick(["BUSINESS ALL-STAR", "RECOGNISED", "AWARD WINNING"], v);
      body = (point || "Turnua has been recognised for how we run our business and look after our clients and people") + ". This belongs to every person on our sites, in our CI Hub and on our 24/7 helpdesk. Thank you to our clients and partners for the trust behind it.";
      tags = ["#Turnua", "#BusinessAllStar", "#IrishBusiness", "#CriticalInfrastructure"];
      break;
    case "Project milestone":
      headline = pick(["MILESTONE REACHED", "ON PROGRAMME", "DELIVERED"], v);
      body = (point || "A key milestone reached") + (p ? " on " + p.name + " for " + who + " in " + where + "." : ".") + (progress ? " " + progress + "." : "");
      tags = ["#Turnua", "#Construction", p?.service.includes("Fibre") ? "#Fibre" : "#Infrastructure"];
      break;
    case "Crew spotlight":
      headline = pick(["MEET THE CREW", "BUILT BY PEOPLE", "THE TEAM BEHIND IT"], v);
      body = "Meet the team " + (p ? "delivering " + p.short + " in " + where : "on site this week") + ". " + (point ? point + "." : "Skilled, certified and proud of the work.");
      tags = ["#Turnua", "#Careers", "#Engineering"];
      break;
    case "Safety":
      headline = pick(["SAFE BY DESIGN", "ZERO HARM", "HOME SAFE"], v);
      body = (point || "Toolbox talks every morning and every risk assessed before work starts") + "." + (p ? " " + p.safety.toolboxTalks + " toolbox talks on " + p.short + " so far." : "") + " Everyone goes home safe.";
      tags = ["#Turnua", "#SafetyFirst", "#HSEQ"];
      break;
    case "Case study":
      headline = pick(["THE RESULTS", "PROVEN AT SCALE", "CASE STUDY"], v);
      body = (point || "How we delivered") + (p ? " for " + who + "." + (p.contractValue ? " A " + eurShort(p.contractValue) + " programme across " + where + "." : "") : ".") + " Full case study at turnua.com.";
      tags = ["#Turnua", "#CaseStudy", "#CriticalInfrastructure"];
      break;
    case "Hiring":
      headline = pick(["WE'RE HIRING", "JOIN THE TEAM", "BUILD WITH US"], v);
      body = (point || "We're hiring engineers, supervisors and operatives") + ". Real projects, proper training and a team that backs you. Apply at turnua.com/careers.";
      tags = ["#Turnua", "#Hiring", "#CareersInConstruction"];
      break;
    case "Event":
      headline = pick(["SEE YOU THERE", "COME AND MEET US", "ON THE STAND"], v);
      body = (point || "Our team will be at the event") + ". Come and talk about fibre, critical facilities and data centre delivery.";
      tags = ["#Turnua", "#DataCentres", "#Events"];
      break;
    default:
      headline = pick(["ONE PARTNER", "END TO END", "24/7 CRITICAL CARE"], v);
      body = (point || "From fibre and low voltage cabling to 24/7 critical facilities management") + ". One partner from build to operate, across Ireland, the UK and the US.";
      tags = ["#Turnua", "#DataCentres", "#CriticalFacilities"];
  }
  if (o.tone === "Proud") body = pick(["Proud of this one. ", "Great work from the team. ", "This is what good looks like. "], v) + body;
  if (o.tone === "Technical" && p) body += " Scope: " + p.service.toLowerCase() + ".";
  const tagLine = tags.slice(0, 5).join(" ");
  const li = watch + body + "\n\n" + close + "\n\n" + tagLine;
  const ig = watch + body + "\n\n" + tagLine;
  const fb = watch + body + " " + close;
  let x = body.length > 200 ? body.slice(0, 197).replace(/\s+\S*$/, "") + "…" : body;
  x = x + " " + tags.slice(0, 2).join(" ");
  const tt = (o.mediaKind === "video" ? "" : "") + headline.charAt(0) + headline.slice(1).toLowerCase() + ". " + (point || body.split(".")[0]) + ". " + tags.slice(0, 3).join(" ");
  return { headline, hashtags: tags, captions: { LinkedIn: li, Instagram: ig, Facebook: fb, X: x, TikTok: tt } };
}

const EMOJI = /\p{Extended_Pictographic}/u;
const NAMED = /\b(microsoft|google|amazon|aws|meta|apple|oracle)\b/i;
export interface Check { ok: boolean; text: string }
export function brandChecks(o: { headline: string; captions: Partial<Record<SocialPlatform, string>>; hashtags: string[]; platforms: SocialPlatform[]; hasMedia: boolean; template: string }): Check[] {
  const all = o.platforms.map((p) => o.captions[p] || "").join(" ");
  const words = o.headline.trim().split(/\s+/).filter(Boolean).length;
  const tagCount = o.hashtags.length;
  return [
    { ok: o.hasMedia, text: o.hasMedia ? "Media attached" : "Add an image or video" },
    { ok: words >= 1 && words <= 5, text: "Headline is " + words + " word" + (words === 1 ? "" : "s") + " (one to five)" },
    { ok: !!o.template, text: "Brand template applied: logo, lime accent, Geist caps" },
    { ok: !EMOJI.test(all + o.headline), text: "No emojis" },
    { ok: tagCount >= 3 && tagCount <= 5 && o.hashtags.includes("#Turnua"), text: tagCount + " hashtags including #Turnua (three to five)" },
    { ok: !NAMED.test(all + o.headline), text: "No confidential client named" },
    { ok: !o.platforms.includes("X") || (o.captions.X || "").length <= 280, text: "X post " + (o.captions.X || "").length + " of 280 characters" },
    { ok: o.platforms.length > 0, text: o.platforms.length + " channel" + (o.platforms.length === 1 ? "" : "s") + " selected" },
  ];
}

/* ── creative rendering on a canvas ──────────────────────────────── */
let markImg: HTMLImageElement | null = null;
let logoImg: HTMLImageElement | null = null;
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
export async function brandAssets() {
  if (!markImg) markImg = await loadImg("/turnua-mark.svg").catch(() => null);
  if (!logoImg) logoImg = await loadImg("/turnua-logo.svg").catch(() => null);
  return { mark: markImg, logo: logoImg };
}
function cover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / sw, h / sh);
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
/** Draw the branded creative. `media` is an image or a video element (current frame). */
export function renderCreative(canvas: HTMLCanvasElement, media: { el: CanvasImageSource; w: number; h: number } | null, o: { format: keyof typeof FORMATS; template: TemplateId; headline: string; sub: string }, assets: { mark: HTMLImageElement | null; logo: HTMLImageElement | null }) {
  const { w, h } = FORMATS[o.format];
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const LIME = "#DBFF00", INK = "#16181C";
  const pad = Math.round(w * 0.07);
  ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h);
  const font = (px: number, weight = 800) => weight + " " + px + "px Geist, 'Instrument Sans', system-ui, sans-serif";
  const headSize = Math.round(Math.min(w, h) * (o.format === "1.91:1" ? 0.1 : 0.115));
  const head = o.headline.toUpperCase().trim() || "YOUR HEADLINE";

  if (o.template === "split") {
    const panelW = o.format === "9:16" ? w : Math.round(w * 0.46);
    const panelH = o.format === "9:16" ? Math.round(h * 0.42) : h;
    if (media) { if (o.format === "9:16") cover(ctx, media.el, media.w, media.h, 0, panelH, w, h - panelH); else cover(ctx, media.el, media.w, media.h, panelW, 0, w - panelW, h); }
    ctx.fillStyle = INK; ctx.fillRect(0, 0, panelW, panelH);
    ctx.font = font(headSize); ctx.fillStyle = LIME; ctx.textBaseline = "top";
    const lines = wrap(ctx, head, panelW - pad * 2);
    const lh = headSize * 0.98;
    let y = Math.max(pad * 1.6, panelH / 2 - (lines.length * lh) / 2 - headSize * 0.3);
    lines.forEach((l) => { ctx.fillText(l, pad, y); y += lh; });
    if (o.sub) { ctx.font = font(Math.round(headSize * 0.3), 500); ctx.fillStyle = "#FFFFFF"; wrap(ctx, o.sub, panelW - pad * 2).slice(0, 3).forEach((l) => { y += headSize * 0.18; ctx.fillText(l, pad, y + headSize * 0.2); y += headSize * 0.34; }); }
    if (assets.logo) { const lw = Math.round(panelW * 0.36); ctx.drawImage(assets.logo, pad, panelH - pad - lw * 0.18, lw, lw * 0.18); }
  } else {
    if (media) cover(ctx, media.el, media.w, media.h, 0, 0, w, h);
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, "rgba(22,24,28,0)"); g.addColorStop(1, "rgba(22,24,28,0.92)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (o.template === "frame") { ctx.strokeStyle = LIME; ctx.lineWidth = Math.round(w * 0.012); const m = Math.round(w * 0.035); ctx.strokeRect(m, m, w - m * 2, h - m * 2); }
    ctx.font = font(headSize); ctx.fillStyle = "#FFFFFF"; ctx.textBaseline = "alphabetic";
    const lines = wrap(ctx, head, w - pad * 2);
    const lh = headSize * 0.98;
    const subLines = o.sub ? (ctx.font = font(Math.round(headSize * 0.3), 500), wrap(ctx, o.sub, w - pad * 2).slice(0, 2)) : [];
    const bottom = h - pad * 1.25 - (o.template === "bar" ? 0 : headSize * 0.5);
    let y = bottom - subLines.length * headSize * 0.42 - (lines.length - 1) * lh - headSize * 0.5;
    ctx.font = font(headSize);
    lines.forEach((l) => { ctx.fillStyle = "#FFFFFF"; ctx.fillText(l, pad, y); y += lh; });
    if (o.template === "bar") { ctx.fillStyle = LIME; ctx.fillRect(pad, y - lh + headSize * 0.22, Math.min(w - pad * 2, w * 0.28), Math.round(headSize * 0.12)); }
    y += headSize * 0.05;
    ctx.font = font(Math.round(headSize * 0.3), 500); ctx.fillStyle = "rgba(255,255,255,.86)";
    subLines.forEach((l) => { ctx.fillText(l, pad, y); y += headSize * 0.42; });
    if (o.template === "frame" && assets.mark) {
      const s = Math.round(w * 0.085), m = Math.round(w * 0.07);
      ctx.fillStyle = LIME; ctx.beginPath(); ctx.arc(w - m - s / 2, m + s / 2, s * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(assets.mark, w - m - s / 2 - s * 0.3, m + s / 2 - s * 0.37, s * 0.6, s * 0.74);
    } else if (assets.logo) {
      const lw = Math.round(w * (o.format === "1.91:1" ? 0.2 : 0.26));
      ctx.drawImage(assets.logo, w - pad - lw, pad, lw, lw * 0.18);
    }
  }
  if (!media) {
    ctx.font = font(Math.round(Math.min(w, h) * 0.028), 500); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.textBaseline = "top";
    ctx.fillText("Upload an image or video to place it here", pad, pad);
  }
}
/** Small JPEG for storage and thumbnails. */
export function thumbOf(canvas: HTMLCanvasElement, maxW = 640): string {
  const s = Math.min(1, maxW / canvas.width);
  const c = document.createElement("canvas");
  c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
  c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
export const fmtNum = num;
