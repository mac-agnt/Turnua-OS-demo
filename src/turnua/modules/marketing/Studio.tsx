/* Social Studio: upload an image or a video, apply the Turnua brand template,
   draft captions per channel with the Marketing agent, check them against the
   brand guidelines, then save, schedule or publish (demo) across channels. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ID, SocialPlatform, SocialPost } from "../../types";
import { SOCIAL_PLATFORMS } from "../../types";
import { useDB, useClock } from "../../store";
import { navigate, useRoute, withQuery, toast } from "../../ui";
import { deletePost, publishPostNow, savePost } from "../../growthActions";
import { Avatar, Badge, Btn, Card, Field, Icon, Seg } from "../../kit";
import AgentFace from "../../../components/AgentFace";
import { nameOf } from "../../selectors";
import { addDays, fmtDateTime, relDay, hhmm, todayKey, at } from "../../time";
import { BEST_TIMES, BRAND, FORMATS, TEMPLATES, TOPICS, brandAssets, brandChecks, draftPost, renderCreative, thumbOf, type TemplateId, type Topic } from "./brand";

type Media = { kind: "image" | "video"; name: string; url: string; el: HTMLImageElement | HTMLVideoElement; w: number; h: number };
type Fmt = keyof typeof FORMATS;

/* Video object URLs live for the session only; posts keep their branded cover. */
const sessionMedia = new Map<ID, Media>();

export default function Studio() {
  const db = useDB();
  const now = useClock();
  const r = useRoute();
  const editing = r.query.post ? db.posts.find((p) => p.id === r.query.post) : undefined;
  const agent = db.agents.find((a) => a.id === "marketing");

  const [media, setMedia] = useState<Media | null>(null);
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const [assetsReady, setAssetsReady] = useState(0);

  useEffect(() => { brandAssets().then(() => setAssetsReady((x) => x + 1)); }, []);
  // load a saved post into the editor
  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title); setHeadline(editing.headline); setCaptions(editing.captions); setHashtags(editing.hashtags);
    setPlatforms(editing.platforms); setFormat(editing.format); setTopic((TOPICS as readonly string[]).includes(editing.topic) ? editing.topic as Topic : "Service line");
    setCampaignId(editing.campaignId || "");
    if (editing.scheduledAt) { setDate(editing.scheduledAt.slice(0, 10)); setTime(hhmm(editing.scheduledAt)); }
    setMedia(sessionMedia.get(editing.id) || null);
    if (editing.platforms[0]) setPreviewOn(editing.platforms[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // redraw the creative whenever inputs change; video redraws on seek
  useEffect(() => {
    if (!canvas.current) return;
    brandAssets().then((a) => { if (canvas.current) renderCreative(canvas.current, media ? { el: media.el, w: media.w, h: media.h } : null, { format, template, headline: headline || (editing ? editing.headline : ""), sub }, a); });
  }, [media, format, template, headline, sub, assetsReady, editing]);

  const onFile = (file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => { setMedia({ kind: "image", name: file.name, url, el: img, w: img.naturalWidth, h: img.naturalHeight }); toast("Image added. Brand template applied."); };
      img.src = url;
    } else if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = () => { setMedia({ kind: "video", name: file.name, url, el: v, w: v.videoWidth, h: v.videoHeight }); };
      if (format === "4:5" || format === "1:1") setFormat("9:16");
      toast("Video added. A branded cover is made from a frame.");
    } else toast("Use an image (JPG, PNG, WebP) or a video (MP4, MOV)", "warn");
  };

  const draft = (nextVariant = variant) => {
    setDrafting(true);
    setTimeout(() => {
      const d = draftPost(db, { topic, projectId: projectId || undefined, point, tone, variant: nextVariant, mediaKind: media?.kind || "none" });
      setHeadline(d.headline); setCaptions(d.captions); setHashtags(d.hashtags);
      setSub(projectId ? (db.projects.find((p) => p.id === projectId)?.location || "") : "");
      if (!title) setTitle(topic + (projectId ? ", " + db.projects.find((p) => p.id === projectId)?.short : ""));
      setDrafting(false);
    }, 650);
  };

  const checks = useMemo(() => brandChecks({ headline, captions, hashtags, platforms, hasMedia: !!media || !!editing?.creative, template }), [headline, captions, hashtags, platforms, media, editing, template]);
  const passed = checks.filter((c) => c.ok).length;
  const toggle = (p: SocialPlatform) => setPlatforms((xs) => xs.includes(p) ? xs.filter((x) => x !== p) : xs.concat([p]));

  const commit = (status: SocialPost["status"]) => {
    if (!captions.LinkedIn && !captions.Instagram) { toast("Draft the post first", "warn"); return; }
    if (status !== "Draft" && !platforms.length) { toast("Pick at least one channel", "warn"); return; }
    const creative = !media && editing?.creative ? editing.creative : canvas.current ? thumbOf(canvas.current) : undefined;
    const scheduledAt = status === "Scheduled" ? at(date, Number(time.slice(0, 2)), Number(time.slice(3, 5))) : status === "Published" ? new Date().toISOString() : undefined;
    if (status === "Scheduled" && Date.parse(scheduledAt!) < Date.now()) { toast("Pick a time in the future", "warn"); return; }
    const id = savePost({ id: editing?.id, title: title || headline, mediaKind: media?.kind || editing?.mediaKind || "none", mediaName: media?.name || editing?.mediaName || "", creative, format,
      headline, captions: Object.fromEntries(platforms.map((p) => [p, captions[p] || ""])), hashtags, platforms, scheduledAt, publishedAt: status === "Published" ? scheduledAt : undefined,
      status, ownerId: "P02", campaignId: campaignId || undefined, topic, stats: status === "Published" ? { reach: 0, engagement: 0, clicks: 0 } : undefined });
    if (media) sessionMedia.set(id, media);
    navigate(withQuery("/marketing/studio", { post: id }), { replace: true });
  };
  const reset = () => { setMedia(null); setHeadline(""); setSub(""); setCaptions({}); setHashtags([]); setTitle(""); setPoint(""); navigate("/marketing/studio"); };

  const preview = captions[previewOn] || "";
  const showStored = !!(editing?.creative && !media);
  const creativeUrl = showStored ? editing!.creative : undefined;

  return (
    <div className="tu-stack">
      <div className="ss-grid">
        {/* left: media and creative */}
        <Card title={editing ? "Editing: " + editing.title : "New post"} sub={editing ? editing.id + " · " + editing.status : "Upload an image or video. The brand template is applied as you go."}
          right={<div className="tu-row" style={{ gap: 6 }}>{(editing || headline || media) && <Btn size="sm" kind="ghost" onClick={reset}>New post</Btn>}<Btn size="sm" icon="plus" onClick={() => fileIn.current?.click()}>{media ? "Replace media" : "Upload"}</Btn></div>}>
          <input ref={fileIn} type="file" accept="image/*,video/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          {!media && !editing?.creative && (
            <div className={"ss-drop" + (over ? " over" : "")} role="button" tabIndex={0} onClick={() => fileIn.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileIn.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}>
              <Icon name="dl" size={22} style={{ transform: "rotate(180deg)" }} />
              <div style={{ fontWeight: 600, color: "var(--ink)" }}>Drop a site photo or a video here</div>
              <div className="tu-small">JPG, PNG, WebP, MP4 or MOV. Stays in this browser.</div>
            </div>
          )}
          <div className="ss-stage" style={{ marginTop: !media && !editing?.creative ? 12 : 0 }}>
            {showStored && <img src={editing!.creative} alt="Saved creative" style={{ maxWidth: "100%", maxHeight: 520, borderRadius: 10 }} />}
            <canvas ref={canvas} aria-label="Branded creative preview" style={showStored ? { display: "none" } : undefined} />
          </div>
          {media?.kind === "video" && (
            <div className="tu-stack" style={{ gap: 8, marginTop: 10 }}>
              <video src={media.url} controls muted style={{ width: "100%", maxHeight: 220, borderRadius: 12, background: "#000" }} />
              <div className="tu-row" style={{ gap: 8 }}>
                <span className="tu-small tu-muted">Cover frame</span>
                <input type="range" min={0} max={100} defaultValue={33} aria-label="Cover frame" style={{ flex: 1 }}
                  onChange={(e) => { const v = media.el as HTMLVideoElement; v.currentTime = (Number(e.target.value) / 100) * (v.duration || 1); v.onseeked = () => setMedia({ ...media }); }} />
              </div>
              <div className="tu-small tu-muted">The video posts as uploaded with the branded cover. Lower third and end card are added at publish (demo).</div>
            </div>
          )}
          <div className="tu-section">
            <div className="tu-eyebrow">Format</div>
            <div className="tu-row tu-wrap" style={{ gap: 6 }}>
              {(Object.keys(FORMATS) as Fmt[]).map((f) => <button key={f} className={"tu-chip" + (format === f ? " on" : "")} onClick={() => setFormat(f)} title={FORMATS[f].for}>{FORMATS[f].label}</button>)}
            </div>
          </div>
          <div className="tu-section">
            <div className="tu-eyebrow">Brand template</div>
            <div className="tu-row tu-wrap" style={{ gap: 6 }}>
              {TEMPLATES.map((t) => <button key={t.id} className={"tu-chip" + (template === t.id ? " on" : "")} onClick={() => setTemplate(t.id)} title={t.blurb}>{t.label}</button>)}
            </div>
          </div>
          <div className="tu-grid tu-g2" style={{ marginTop: 14 }}>
            <Field label="Headline on the creative"><input className="tu-input" value={headline} onChange={(e) => setHeadline(e.target.value.toUpperCase())} placeholder="ONE TO FIVE WORDS" /></Field>
            <Field label="Sub line"><input className="tu-input" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Place or project" /></Field>
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
            {platforms.length > 0 && (
              <>
                <Seg label="Preview channel" value={platforms.includes(previewOn) ? previewOn : platforms[0]} onChange={setPreviewOn} options={platforms.map((p) => ({ id: p, label: p }))} />
                <div className="tu-grid tu-g2" style={{ marginTop: 10, alignItems: "start" }}>
                  <Field label={(platforms.includes(previewOn) ? previewOn : platforms[0]) + " caption"} help={previewOn === "X" ? (captions.X || "").length + " / 280" : BEST_TIMES[previewOn] + " is the usual best time"}>
                    <textarea className="tu-textarea" style={{ minHeight: 190 }} value={captions[platforms.includes(previewOn) ? previewOn : platforms[0]] || ""}
                      onChange={(e) => setCaptions((c) => ({ ...c, [platforms.includes(previewOn) ? previewOn : platforms[0]]: e.target.value }))} placeholder="Draft the post or write your own" />
                  </Field>
                  <div className="ss-preview" aria-label="Post preview">
                    <div className="hd"><img src="/turnua-mark.svg" alt="" width={22} height={27} style={{ background: "#16181C", padding: 4, borderRadius: 6, flex: "none", width: 30, height: 30, objectFit: "contain" }} /><div><b>Turnua</b><div className="tu-small tu-muted">{previewOn} · {relDay(at(date, 8), now)}</div></div></div>
                    <div className="tx">{preview.length > 260 ? preview.slice(0, 260) + "… more" : preview || "Your caption appears here."}</div>
                    {creativeUrl ? <img src={creativeUrl} alt="" /> : <CanvasMirror src={canvas} deps={[media, format, template, headline, sub, assetsReady]} />}
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
                <Btn onClick={() => commit("Draft")}>Save draft</Btn>
                <Btn onClick={() => commit("Published")}>Publish now</Btn>
                <Btn kind="primary" icon="cal" onClick={() => commit("Scheduled")}>Schedule {platforms.length ? "on " + platforms.length + " channel" + (platforms.length > 1 ? "s" : "") : ""}</Btn>
              </div>
              <div className="tu-small tu-muted">Demo: channels are simulated. Connecting LinkedIn, Meta, X and TikTok accounts is a Settings integration in the full build.</div>
            </div>
          </Card>
        </div>
      </div>

      <BrandPanel />
      <Queue />
    </div>
  );
}

/** Shows the main canvas in the preview card without drawing it twice. */
function CanvasMirror({ src, deps }: { src: React.RefObject<HTMLCanvasElement | null>; deps: unknown[] }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const t = setTimeout(() => { if (src.current && src.current.width) setUrl(thumbOf(src.current, 520)); }, 120); return () => clearTimeout(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return url ? <img src={url} alt="" /> : null;
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

function Queue() {
  const db = useDB();
  const now = useClock();
  const [show, setShow] = useState<"Scheduled" | "Draft" | "Published">("Scheduled");
  const rows = db.posts.filter((p) => p.status === show).sort((a, b) => show === "Published" ? Date.parse(b.publishedAt || b.createdAt) - Date.parse(a.publishedAt || a.createdAt) : Date.parse(a.scheduledAt || a.createdAt) - Date.parse(b.scheduledAt || b.createdAt));
  return (
    <Card title="Post queue" right={<Seg label="Queue" value={show} onChange={setShow} options={(["Scheduled", "Draft", "Published"] as const).map((s) => ({ id: s, label: s + " · " + db.posts.filter((p) => p.status === s).length }))} />}>
      <div className="ss-queue">
        {rows.map((p) => (
          <button key={p.id} className="ss-card" onClick={() => { navigate(withQuery("/marketing/studio", { post: p.id })); document.querySelector("[data-scroll-main]")?.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <div className="ss-thumb">{p.creative ? <img src={p.creative} alt="" /> : p.headline}</div>
            <div className="b">
              <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13 }}>{p.title}</div>
              <div className="tu-small tu-muted">{p.status === "Scheduled" ? relDay(p.scheduledAt!, now) + " " + hhmm(p.scheduledAt!) : p.status === "Published" ? "Published " + fmtDateTime(p.publishedAt) : "Draft by " + nameOf(db, p.ownerId)}</div>
              <div className="tu-row tu-wrap" style={{ gap: 4 }}>{p.platforms.map((x) => <Badge key={x} tone="outline">{x}</Badge>)}{p.mediaKind === "video" && <Badge tone="accent">Video</Badge>}</div>
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
