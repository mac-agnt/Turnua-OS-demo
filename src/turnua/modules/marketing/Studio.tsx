/* Social Studio: a media library of photos and videos, posts built from one or
   more of them (more than one makes a carousel), the Turnua brand template on
   every slide, captions per channel drafted by the Marketing agent, brand
   checks, then save, schedule or publish (demo) across channels. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ID, MediaItem, SocialPlatform, SocialPost } from "../../types";
import { SOCIAL_PLATFORMS } from "../../types";
import { useDB, useClock, newId, nowIso } from "../../store";
import { navigate, useRoute, withQuery, toast } from "../../ui";
import { addMedia, deletePost, publishPostNow, removeMedia, savePost } from "../../growthActions";
import { Avatar, Badge, Btn, Card, Field, Icon, Search, Seg } from "../../kit";
import AgentFace from "../../../components/AgentFace";
import { nameOf } from "../../selectors";
import { addDays, fmtDateTime, relDay, hhmm, todayKey, at, ago } from "../../time";
import { cachedUrl, ingest, loadElement, putBlob, urlOf } from "../../mediaStore";
import { BEST_TIMES, BRAND, FORMATS, TEMPLATES, TOPICS, brandAssets, brandChecks, draftPost, renderCreative, thumbOf, type TemplateId, type Topic } from "./brand";

type Loaded = { el: HTMLImageElement | HTMLVideoElement; w: number; h: number; url: string };
type Fmt = keyof typeof FORMATS;
const MAX_SLIDES = 10;

export default function Studio() {
  const db = useDB();
  const now = useClock();
  const r = useRoute();
  const editing = r.query.post ? db.posts.find((p) => p.id === r.query.post) : undefined;
  const agent = db.agents.find((a) => a.id === "marketing");

  const [slideIds, setSlideIds] = useState<ID[]>([]);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<Record<ID, Loaded | null>>({});
  const [over, setOver] = useState(false);
  const [format, setFormat] = useState<Fmt>("4:5");
  const [template, setTemplate] = useState<TemplateId>("bar");
  const [topic, setTopic] = useState<Topic>("Project milestone");
  const [projectId, setProjectId] = useState("TRN-2048");
  const [point, setPoint] = useState("");
  const [tone, setTone] = useState<"Professional" | "Proud" | "Technical">("Professional");
  const [variant, setVariant] = useState(0);
  const [headline, setHeadline] = useState("");
  const [sub, setSub] = useState("");
  const [captions, setCaptions] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["LinkedIn", "Instagram"]);
  const [previewOn, setPreviewOn] = useState<SocialPlatform>("LinkedIn");
  const [date, setDate] = useState(addDays(todayKey(), 1));
  const [time, setTime] = useState("08:30");
  const [title, setTitle] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [assetsReady, setAssetsReady] = useState(0);
  const [tick, setTick] = useState(0);

  const slides = slideIds.map((id) => db.media.find((m) => m.id === id)).filter(Boolean) as MediaItem[];
  const cur = slides[active];
  const curLoaded = cur ? loaded[cur.id] : null;

  useEffect(() => { brandAssets().then(() => setAssetsReady((x) => x + 1)); }, []);
  // load the library files this post uses
  useEffect(() => {
    slides.forEach((m) => {
      if (m.id in loaded) return;
      setLoaded((x) => ({ ...x, [m.id]: null }));
      loadElement(m).then((l) => setLoaded((x) => ({ ...x, [m.id]: l })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIds.join(",")]);
  // open a saved post in the editor
  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title); setHeadline(editing.headline); setCaptions(editing.captions); setHashtags(editing.hashtags);
    setPlatforms(editing.platforms); setFormat(editing.format); setTopic((TOPICS as readonly string[]).includes(editing.topic) ? editing.topic as Topic : "Service line");
    setCampaignId(editing.campaignId || ""); setSlideIds(editing.mediaIds || []); setActive(0);
    setSub(editing.topic === "Award" ? "Turnua · Naas, Co. Kildare" : "");
    if (editing.scheduledAt) { setDate(editing.scheduledAt.slice(0, 10)); setTime(hhmm(editing.scheduledAt)); }
    if (editing.platforms[0]) setPreviewOn(editing.platforms[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);
  // draw the active slide
  useEffect(() => {
    if (!canvas.current) return;
    brandAssets().then((a) => {
      if (!canvas.current) return;
      renderCreative(canvas.current, curLoaded ? { el: curLoaded.el, w: curLoaded.w, h: curLoaded.h } : null, { format, template, headline, sub: active === 0 ? sub : "" }, a);
      setTick((t) => t + 1);
    });
  }, [curLoaded, format, template, headline, sub, assetsReady, active]);

  const onFiles = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files || []).slice(0, 20);
    if (!list.length) return;
    setBusy(true);
    const items: MediaItem[] = [];
    for (const f of list) {
      const got = await ingest(f).catch(() => null);
      if (!got) { toast(f.name + " is not an image or video", "warn"); continue; }
      const id = newId("MED");
      try { await putBlob(id, got.blob); } catch { toast("This browser blocked storage for " + f.name, "bad"); continue; }
      items.push({ id, name: f.name.replace(/\.[^.]+$/, ""), kind: got.kind, src: "idb:" + id, w: got.w, h: got.h, bytes: got.blob.size, addedAt: nowIso(), addedById: "P02", tags: [], origin: "user" });
    }
    setBusy(false);
    if (!items.length) return;
    addMedia(items);
    setSlideIds((ids) => {
      const next = ids.concat(items.map((m) => m.id)).slice(0, MAX_SLIDES);
      setActive(ids.length < MAX_SLIDES ? ids.length : 0);
      return next;
    });
    if (items.every((m) => m.kind === "video") && (format === "4:5" || format === "1:1")) setFormat("9:16");
  };
  const toggleSlide = (id: ID) => setSlideIds((ids) => {
    if (ids.includes(id)) { const n = ids.filter((x) => x !== id); setActive((a) => Math.min(a, Math.max(0, n.length - 1))); return n; }
    if (ids.length >= MAX_SLIDES) { toast("A carousel takes up to " + MAX_SLIDES + " slides", "warn"); return ids; }
    setActive(ids.length);
    return ids.concat([id]);
  });
  const move = (i: number, d: -1 | 1) => setSlideIds((ids) => { const j = i + d; if (j < 0 || j >= ids.length) return ids; const n = ids.slice(); [n[i], n[j]] = [n[j], n[i]]; setActive(j); return n; });

  const draft = (nextVariant = variant) => {
    setDrafting(true);
    setTimeout(() => {
      const kind = slides.some((m) => m.kind === "video") ? "video" : slides.length ? "image" : "none";
      const d = draftPost(db, { topic, projectId: topic === "Award" ? undefined : projectId || undefined, point, tone, variant: nextVariant, mediaKind: kind });
      setHeadline(d.headline); setCaptions(d.captions); setHashtags(d.hashtags);
      setSub(topic === "Award" ? "Turnua · Naas, Co. Kildare" : projectId ? (db.projects.find((p) => p.id === projectId)?.location || "") : "");
      if (!title) setTitle(topic + (projectId && topic !== "Award" ? ", " + db.projects.find((p) => p.id === projectId)?.short : ""));
      setDrafting(false);
    }, 650);
  };

  const checks = useMemo(() => {
    const c = brandChecks({ headline, captions, hashtags, platforms, hasMedia: slides.length > 0, template });
    if (slides.length > 1) c.splice(1, 0, { ok: !platforms.includes("X") || slides.length <= 4, text: "Carousel of " + slides.length + " slides" + (platforms.includes("X") && slides.length > 4 ? " (X takes 4; the rest are left off there)" : "") });
    return c;
  }, [headline, captions, hashtags, platforms, slides.length, template]);
  const passed = checks.filter((c) => c.ok).length;
  const toggle = (p: SocialPlatform) => setPlatforms((xs) => xs.includes(p) ? xs.filter((x) => x !== p) : xs.concat([p]));

  /** Render every slide off screen and keep a small branded copy of each. */
  const renderAll = async (): Promise<string[]> => {
    const a = await brandAssets();
    const out: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const l = loaded[slides[i].id] || await loadElement(slides[i]);
      const c = document.createElement("canvas");
      renderCreative(c, l ? { el: l.el, w: l.w, h: l.h } : null, { format, template, headline, sub: i === 0 ? sub : "" }, a);
      out.push(thumbOf(c, 640));
    }
    if (!out.length && canvas.current) out.push(thumbOf(canvas.current, 640));
    return out;
  };
  const commit = async (status: SocialPost["status"]) => {
    if (!captions.LinkedIn && !captions.Instagram) { toast("Draft the post first", "warn"); return; }
    if (status !== "Draft" && !platforms.length) { toast("Pick at least one channel", "warn"); return; }
    const scheduledAt = status === "Scheduled" ? at(date, Number(time.slice(0, 2)), Number(time.slice(3, 5))) : status === "Published" ? new Date().toISOString() : undefined;
    if (status === "Scheduled" && Date.parse(scheduledAt!) < Date.now()) { toast("Pick a time in the future", "warn"); return; }
    setBusy(true);
    const thumbs = await renderAll();
    setBusy(false);
    const id = savePost({ id: editing?.id, title: title || headline, mediaKind: slides.some((m) => m.kind === "video") ? "video" : slides.length ? "image" : "none",
      mediaName: slides.map((m) => m.name).join(", "), mediaIds: slides.map((m) => m.id), slides: thumbs, creative: thumbs[0], format,
      headline, captions: Object.fromEntries(platforms.map((p) => [p, captions[p] || ""])), hashtags, platforms, scheduledAt, publishedAt: status === "Published" ? scheduledAt : undefined,
      status, ownerId: "P02", campaignId: campaignId || undefined, topic, stats: status === "Published" ? { reach: 0, engagement: 0, clicks: 0 } : undefined });
    navigate(withQuery("/marketing/studio", { post: id }), { replace: true });
  };
  const reset = () => { setSlideIds([]); setActive(0); setHeadline(""); setSub(""); setCaptions({}); setHashtags([]); setTitle(""); setPoint(""); navigate("/marketing/studio"); };

  const pv = platforms.includes(previewOn) ? previewOn : platforms[0];
  const preview = (pv && captions[pv]) || "";
  const showSaved = !!(cur && cur.id in loaded && loaded[cur.id] === null && editing?.slides?.[active] && !loaded[cur.id]);

  return (
    <div className="tu-stack">
      <input ref={fileIn} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <div className="ss-grid">
        {/* left: slides and creative */}
        <Card title={editing ? "Editing: " + editing.title : "New post"}
          sub={(editing ? editing.id + " · " + editing.status + " · " : "") + (slides.length > 1 ? "Carousel, " + slides.length + " slides" : slides.length ? "Single " + (slides[0].kind === "video" ? "video" : "photo") : "Pick from the library below or upload")}
          right={<div className="tu-row" style={{ gap: 6 }}>{(editing || headline || slides.length > 0) && <Btn size="sm" kind="ghost" onClick={reset}>New post</Btn>}<Btn size="sm" icon="plus" disabled={busy} onClick={() => fileIn.current?.click()}>{busy ? "Adding…" : "Upload"}</Btn></div>}>
          {!slides.length && (
            <div className={"ss-drop" + (over ? " over" : "")} role="button" tabIndex={0} onClick={() => fileIn.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileIn.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
              <Icon name="dl" size={22} style={{ transform: "rotate(180deg)" }} />
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>Drop photos or videos here, as many as you like</div>
              <div className="tu-small">JPG, PNG, WebP, MP4 or MOV. Two or more makes a carousel. Saved to the library in this browser.</div>
            </div>
          )}
          {slides.length > 0 && (
            <div className="ss-strip" onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
              {slides.map((m, i) => (
                <div key={m.id} className={"ss-slide" + (i === active ? " on" : "")}>
                  <button className="ss-slide-img" onClick={() => setActive(i)} aria-label={"Slide " + (i + 1) + ": " + m.name}><LibThumb m={m} /><span className="n">{i + 1}</span>{m.kind === "video" && <span className="v"><Icon name="play" size={10} /></span>}</button>
                  {i === active && (
                    <div className="ss-slide-ctl">
                      <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left"><Icon name="chevL" size={12} /></button>
                      <button onClick={() => toggleSlide(m.id)} aria-label="Remove slide"><Icon name="close" size={12} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="Move right"><Icon name="chevR" size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
              {slides.length < MAX_SLIDES && <button className="ss-slide add" onClick={() => fileIn.current?.click()} aria-label="Add more"><Icon name="plus" size={18} /><span className="tu-small">Add</span></button>}
            </div>
          )}
          <div className="ss-stage" style={{ marginTop: 12 }}>
            {showSaved && <img src={editing!.slides![active]} alt="Saved slide" style={{ maxWidth: "100%", maxHeight: 520, borderRadius: 10 }} />}
            <canvas ref={canvas} aria-label="Branded creative preview" style={showSaved ? { display: "none" } : undefined} />
          </div>
          {cur?.kind === "video" && curLoaded && (
            <div className="tu-stack" style={{ gap: 8, marginTop: 10 }}>
              <video src={curLoaded.url} controls muted style={{ width: "100%", maxHeight: 220, borderRadius: 12, background: "#000" }} />
              <div className="tu-row" style={{ gap: 8 }}>
                <span className="tu-small tu-muted">Cover frame</span>
                <input type="range" min={0} max={100} defaultValue={33} aria-label="Cover frame" style={{ flex: 1 }}
                  onChange={(e) => { const v = curLoaded.el as HTMLVideoElement; v.onseeked = () => setLoaded((x) => ({ ...x, [cur.id]: { ...curLoaded } })); v.currentTime = (Number(e.target.value) / 100) * (v.duration || 1); }} />
              </div>
              <div className="tu-small tu-muted">The video posts as uploaded with this branded cover. Lower third and end card are added at publish (demo).</div>
            </div>
          )}
          <div className="tu-section">
            <div className="tu-eyebrow">Format</div>
            <div className="tu-row tu-wrap" style={{ gap: 6 }}>
              {(Object.keys(FORMATS) as Fmt[]).map((f) => <button key={f} className={"tu-chip" + (format === f ? " on" : "")} onClick={() => setFormat(f)} title={FORMATS[f].for}>{FORMATS[f].label}</button>)}
            </div>
          </div>
          <div className="tu-section">
            <div className="tu-eyebrow">Brand template{slides.length > 1 ? ", applied to every slide" : ""}</div>
            <div className="tu-row tu-wrap" style={{ gap: 6 }}>
              {TEMPLATES.map((t) => <button key={t.id} className={"tu-chip" + (template === t.id ? " on" : "")} onClick={() => setTemplate(t.id)} title={t.blurb}>{t.label}</button>)}
            </div>
          </div>
          <div className="tu-grid tu-g2" style={{ marginTop: 14 }}>
            <Field label="Headline on the creative"><input className="tu-input" value={headline} onChange={(e) => setHeadline(e.target.value.toUpperCase())} placeholder="ONE TO FIVE WORDS" /></Field>
            <Field label="Sub line (first slide)"><input className="tu-input" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Place or project" /></Field>
          </div>
        </Card>

        {/* right: agent drafting, captions, checks, schedule */}
        <div className="tu-stack">
          <Card title={<div className="tu-row" style={{ gap: 10 }}>{agent && <AgentFace shape={agent.shape} tint={agent.tint} size={30} state={drafting ? "working" : "idle"} />}<div><h2 style={{ margin: 0 }}>Marketing agent</h2><div className="tu-sub">Drafts to the Turnua brand guidelines. You approve before anything goes out.</div></div></div>}>
            <div className="tu-stack" style={{ gap: 10 }}>
              <div className="tu-grid tu-g2">
                <Field label="Topic"><select className="tu-select" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Project"><select className="tu-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">None</option>{db.projects.map((p) => <option key={p.id} value={p.id}>{p.short}</option>)}</select></Field>
              </div>
              <Field label="What happened?" help="One line in your words. The agent does the rest."><input className="tu-input" value={point} onChange={(e) => setPoint(e.target.value)} placeholder="e.g. Cabinets C01 to C14 passed OTDR testing first time" /></Field>
              <div className="tu-row tu-wrap" style={{ gap: 10, justifyContent: "space-between" }}>
                <Seg label="Tone" value={tone} onChange={setTone} options={[{ id: "Professional", label: "Professional" }, { id: "Proud", label: "Proud" }, { id: "Technical", label: "Technical" }]} />
                <div className="tu-row" style={{ gap: 6 }}>
                  {headline && <Btn size="sm" icon="sync" onClick={() => { setVariant(variant + 1); draft(variant + 1); }}>Another version</Btn>}
                  <Btn kind="primary" size="sm" icon="bolt" disabled={drafting} onClick={() => draft()}>{drafting ? "Drafting…" : headline ? "Redraft" : "Draft post"}</Btn>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Channels and captions" sub="Each channel gets its own length and hashtags">
            <div className="ss-plat" style={{ marginBottom: 12 }}>
              {SOCIAL_PLATFORMS.map((p) => <button key={p} className={"tu-chip" + (platforms.includes(p) ? " on" : "")} onClick={() => toggle(p)} aria-pressed={platforms.includes(p)}>{platforms.includes(p) && <Icon name="check" size={12} />}{p}</button>)}
            </div>
            {pv && (
              <>
                <Seg label="Preview channel" value={pv} onChange={setPreviewOn} options={platforms.map((p) => ({ id: p, label: p }))} />
                <div className="tu-grid tu-g2" style={{ marginTop: 10, alignItems: "start" }}>
                  <Field label={pv + " caption"} help={pv === "X" ? (captions.X || "").length + " / 280" : BEST_TIMES[pv] + " is the usual best time"}>
                    <textarea className="tu-textarea" style={{ minHeight: 190 }} value={captions[pv] || ""} onChange={(e) => setCaptions((c) => ({ ...c, [pv]: e.target.value }))} placeholder="Draft the post or write your own" />
                  </Field>
                  <div className="ss-preview" aria-label="Post preview">
                    <div className="hd"><img src="/turnua-mark.svg" alt="" width={22} height={27} style={{ background: "#16181C", padding: 4, borderRadius: 6, flex: "none", width: 30, height: 30, objectFit: "contain" }} /><div><b>Turnua</b><div className="tu-small tu-muted">{pv} · {relDay(at(date, 8), now)}</div></div></div>
                    <div className="tx">{preview.length > 260 ? preview.slice(0, 260) + "… more" : preview || "Your caption appears here."}</div>
                    <CanvasMirror src={canvas} tick={tick} fallback={showSaved ? editing?.slides?.[active] : undefined} />
                    {slides.length > 1 && <div className="ss-dots">{slides.map((_, i) => <button key={i} className={i === active ? "on" : ""} onClick={() => setActive(i)} aria-label={"Show slide " + (i + 1)} />)}</div>}
                  </div>
                </div>
                <Field label="Hashtags"><input className="tu-input" value={hashtags.join(" ")} onChange={(e) => setHashtags(e.target.value.split(/\s+/).filter(Boolean).map((t) => t.startsWith("#") ? t : "#" + t))} /></Field>
              </>
            )}
          </Card>

          <Card title="Brand check" right={<Badge tone={passed === checks.length ? "ok" : "warn"}>{passed} of {checks.length}</Badge>}>
            <div className="ss-checks">
              {checks.map((c, i) => <div key={i}><Icon name={c.ok ? "ok" : "x"} size={15} style={{ color: c.ok ? "var(--ok)" : "var(--warn)" }} /><span>{c.text}</span></div>)}
            </div>
          </Card>

          <Card title="Schedule">
            <div className="tu-stack" style={{ gap: 10 }}>
              <Field label="Post title (internal)"><input className="tu-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <div className="tu-grid tu-g3">
                <Field label="Date"><input className="tu-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Time"><input className="tu-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
                <Field label="Campaign"><select className="tu-select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">None</option>{db.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              </div>
              <div className="tu-row tu-wrap" style={{ gap: 6 }}>
                <span className="tu-small tu-muted">Suggested:</span>
                {[["Tomorrow 08:30", 1, "08:30"], ["Thu 12:30", ((4 - new Date().getDay() + 7) % 7) || 7, "12:30"], ["Next Tue 08:30", ((2 - new Date().getDay() + 7) % 7) || 7, "08:30"]].map(([l, d, t]) => (
                  <button key={l as string} className="tu-chip" onClick={() => { setDate(addDays(todayKey(), d as number)); setTime(t as string); }}>{l as string}</button>
                ))}
              </div>
              <div className="tu-row tu-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
                {editing && <Btn kind="ghost" icon="trash" onClick={() => { deletePost(editing.id); reset(); }}>Delete</Btn>}
                <Btn disabled={busy} onClick={() => commit("Draft")}>Save draft</Btn>
                <Btn disabled={busy} onClick={() => commit("Published")}>Publish now</Btn>
                <Btn kind="primary" icon="cal" disabled={busy} onClick={() => commit("Scheduled")}>Schedule {platforms.length ? "on " + platforms.length + " channel" + (platforms.length > 1 ? "s" : "") : ""}</Btn>
              </div>
              <div className="tu-small tu-muted">Demo: channels are simulated. Connecting LinkedIn, Meta, X and TikTok accounts is a Settings integration in the full build.</div>
            </div>
          </Card>
        </div>
      </div>

      <Library selected={slideIds} onToggle={toggleSlide} onUpload={() => fileIn.current?.click()} onFiles={onFiles} busy={busy} />
      <BrandPanel />
      <Queue />
    </div>
  );
}

/** Thumbnail for a library item; uploads resolve from IndexedDB. */
function LibThumb({ m }: { m: MediaItem }) {
  const [url, setUrl] = useState<string | null>(cachedUrl(m));
  useEffect(() => { let on = true; urlOf(m).then((u) => { if (on) setUrl(u); }); return () => { on = false; }; }, [m]);
  if (!url) return <span className="ss-missing">Not in this browser</span>;
  return m.kind === "video" ? <video src={url + "#t=0.5"} muted preload="metadata" /> : <img src={url} alt="" loading="lazy" />;
}

/** Shows the main canvas in the preview card without drawing it twice. */
function CanvasMirror({ src, tick, fallback }: { src: React.RefObject<HTMLCanvasElement | null>; tick: number; fallback?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const t = setTimeout(() => { if (src.current && src.current.width) setUrl(thumbOf(src.current, 520)); }, 80); return () => clearTimeout(t); }, [tick, src]);
  const u = fallback || url;
  return u ? <img src={u} alt="" /> : null;
}

/* ── media library ───────────────────────────────────────────────── */
function Library({ selected, onToggle, onUpload, onFiles, busy }: { selected: ID[]; onToggle: (id: ID) => void; onUpload: () => void; onFiles: (f: FileList) => void; busy: boolean }) {
  const db = useDB();
  const now = useClock();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [over, setOver] = useState(false);
  const rows = db.media.filter((m) => (kind === "all" || m.kind === kind) && (!q || (m.name + " " + m.tags.join(" ")).toLowerCase().includes(q.toLowerCase())));
  const used = (id: ID) => db.posts.filter((p) => p.mediaIds?.includes(id)).length;
  const mb = db.media.reduce((n, m) => n + m.bytes, 0) / 1048576;
  return (
    <Card title="Media library" sub={db.media.length + " file" + (db.media.length === 1 ? "" : "s") + " · " + mb.toFixed(1) + " MB · click to add to the post, click again to take it out"}
      right={<div className="tu-row tu-wrap" style={{ gap: 8 }}>
        <Search value={q} onChange={setQ} placeholder="Search name or tag" width={190} />
        <Seg label="Kind" value={kind} onChange={setKind} options={[{ id: "all", label: "All" }, { id: "image", label: "Photos" }, { id: "video", label: "Videos" }]} />
        <Btn size="sm" kind="primary" icon="plus" disabled={busy} onClick={onUpload}>{busy ? "Adding…" : "Upload"}</Btn>
      </div>}>
      <div className={"ss-lib" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
        {rows.map((m) => {
          const i = selected.indexOf(m.id);
          const n = used(m.id);
          return (
            <div key={m.id} className={"ss-libitem" + (i > -1 ? " on" : "")}>
              <button className="ss-libimg" onClick={() => onToggle(m.id)} aria-pressed={i > -1} aria-label={(i > -1 ? "Take out " : "Add ") + m.name}>
                <LibThumb m={m} />
                {i > -1 && <span className="n">{i + 1}</span>}
                {m.kind === "video" && <span className="v"><Icon name="play" size={10} /></span>}
              </button>
              <div className="ss-libmeta">
                <div className="tu-ellipsis" style={{ fontSize: 12, fontWeight: 550, color: "var(--ink)" }} title={m.name}>{m.name}</div>
                <div className="tu-small tu-muted">{m.w}×{m.h} · {ago(m.addedAt, now).toLowerCase()}{n ? " · in " + n + " post" + (n > 1 ? "s" : "") : ""}</div>
                {m.tags.length > 0 && <div className="tu-row tu-wrap" style={{ gap: 4, marginTop: 4 }}>{m.tags.slice(0, 3).map((t) => <Badge key={t} tone="outline">{t}</Badge>)}</div>}
              </div>
              {m.origin === "user" && <button className="ss-libdel" onClick={() => removeMedia(m.id)} aria-label={"Delete " + m.name}><Icon name="trash" size={12} /></button>}
            </div>
          );
        })}
        <button className="ss-libitem add" onClick={onUpload}><Icon name="plus" size={20} /><span className="tu-small">Upload photos or videos</span><span className="tu-small tu-faint">or drop them here</span></button>
      </div>
    </Card>
  );
}

function BrandPanel() {
  return (
    <Card title="Turnua brand guidelines" sub="What the template and the agent follow (demo set; replace with the real guide)">
      <div className="tu-grid tu-g3" style={{ alignItems: "start" }}>
        <div>
          <div className="tu-eyebrow" style={{ marginBottom: 8 }}>Colour</div>
          <div className="tu-stack" style={{ gap: 8 }}>{BRAND.colours.map((c) => <div key={c.hex} className="tu-row" style={{ gap: 10 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: c.hex, border: "1px solid var(--border)", flex: "none" }} /><div><div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{c.name} <span className="tu-muted tu-mono" style={{ fontWeight: 400 }}>{c.hex}</span></div><div className="tu-small tu-muted">{c.use}</div></div></div>)}</div>
        </div>
        <div>
          <div className="tu-eyebrow" style={{ marginBottom: 8 }}>Voice</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--body)" }}>{BRAND.voice.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
        <div>
          <div className="tu-eyebrow" style={{ marginBottom: 8 }}>Type and photography</div>
          <div className="tu-small" style={{ lineHeight: 1.6 }}>{BRAND.type}</div>
          <div className="tu-small" style={{ lineHeight: 1.6, marginTop: 8 }}>{BRAND.photo}</div>
        </div>
      </div>
    </Card>
  );
}

function PostThumb({ p }: { p: SocialPost }) {
  const db = useDB();
  const m = p.mediaIds?.[0] ? db.media.find((x) => x.id === p.mediaIds![0]) : undefined;
  if (p.creative) return <img src={p.creative} alt="" />;
  if (m) return <LibThumb m={m} />;
  return <>{p.headline}</>;
}

function Queue() {
  const db = useDB();
  const now = useClock();
  const [show, setShow] = useState<"Scheduled" | "Draft" | "Published">("Draft");
  const rows = db.posts.filter((p) => p.status === show).sort((a, b) => show === "Published" ? Date.parse(b.publishedAt || b.createdAt) - Date.parse(a.publishedAt || a.createdAt) : Date.parse(a.scheduledAt || a.createdAt) - Date.parse(b.scheduledAt || b.createdAt));
  return (
    <Card title="Post queue" right={<Seg label="Queue" value={show} onChange={setShow} options={(["Draft", "Scheduled", "Published"] as const).map((s) => ({ id: s, label: s + " · " + db.posts.filter((p) => p.status === s).length }))} />}>
      <div className="ss-queue">
        {rows.map((p) => (
          <button key={p.id} className="ss-card" onClick={() => { navigate(withQuery("/marketing/studio", { post: p.id })); document.querySelector("[data-scroll-main]")?.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <div className="ss-thumb"><PostThumb p={p} />{(p.mediaIds?.length || 0) > 1 && <span className="ss-count">1 / {p.mediaIds!.length}</span>}</div>
            <div className="b">
              <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{p.title}</div>
              <div className="tu-small tu-muted">{p.status === "Scheduled" ? relDay(p.scheduledAt!, now) + " " + hhmm(p.scheduledAt!) : p.status === "Published" ? "Published " + fmtDateTime(p.publishedAt) : "Draft by " + nameOf(db, p.ownerId)}</div>
              <div className="tu-row tu-wrap" style={{ gap: 4 }}>{p.platforms.map((x) => <Badge key={x} tone="outline">{x}</Badge>)}{p.mediaKind === "video" && <Badge tone="accent">Video</Badge>}{(p.mediaIds?.length || 0) > 1 && <Badge tone="accent">Carousel</Badge>}</div>
              {p.stats && <div className="tu-small tu-muted">{p.stats.reach.toLocaleString("en-IE")} reach · {p.stats.engagement} engagements</div>}
              {p.status === "Scheduled" && <span className="tu-link tu-small" role="button" onClick={(e) => { e.stopPropagation(); publishPostNow(p.id); }}>Publish now</span>}
            </div>
          </button>
        ))}
        {!rows.length && <div className="tu-small tu-muted">Nothing here yet.</div>}
      </div>
      <div className="tu-row" style={{ gap: 8, marginTop: 12 }}><Avatar person={db.people.find((p) => p.id === "P02")} size={20} /><span className="tu-small tu-muted">Posts are approved by Gillian Daly before they go out, per Governance & AI.</span></div>
    </Card>
  );
}
