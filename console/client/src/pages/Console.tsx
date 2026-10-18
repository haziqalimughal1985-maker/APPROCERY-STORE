import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { api, formatBytes, formatDate } from "@/lib/api";
import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, FileArchive, LockKeyhole, Plus, RefreshCw, UploadCloud } from "lucide-react";

interface Release { id: number; versionName: string; versionCode: number; status: string; fileSize: number | null; sha256: string | null; validationPassed: boolean; validationMessage: string | null; createdAt: string; }
interface OwnedApp { app: { id: number; name: string; packageName: string; developerName: string; shortDescription: string; status: string; }; versions: Release[]; }

const statusTone: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  validating: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export default function Console() {
  const { user, loading } = useAuth();
  const [apps, setApps] = useState<OwnedApp[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loadingApps, setLoadingApps] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: "", packageName: "", developerName: user?.name ?? "", shortDescription: "", fullDescription: "" });
  const [release, setRelease] = useState({ versionName: "", versionCode: "", changelog: "", file: null as File | null, iconFile: null as File | null, screenshotFiles: [] as File[] });

  const loadApps = async () => {
    if (!user) return;
    setLoadingApps(true);
    try { const data = await api<{ apps: OwnedApp[] }>("/api/v1/developer/apps"); setApps(data.apps); if (!selected && data.apps[0]) setSelected(data.apps[0].app.id); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load your apps." }); }
    finally { setLoadingApps(false); }
  };
  useEffect(() => { void loadApps(); }, [user]);

  if (loading) return <LoadingPanel label="Checking your publisher account…" />;
  if (!user) return <SignInPanel />;

  const selectedApp = apps.find(item => item.app.id === selected)?.app;
  const selectedReleases = apps.find(item => item.app.id === selected)?.versions ?? [];

  async function createApp(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setNotice(null);
    try {
      const result = await api<{ id: number }>("/api/v1/developer/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setNotice({ kind: "ok", text: "App listing created. Upload its first release when ready." }); setShowCreate(false); setForm({ name: "", packageName: "", developerName: user?.name ?? "", shortDescription: "", fullDescription: "" }); await loadApps(); setSelected(result.id);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create the listing." }); }
    finally { setCreating(false); }
  }

  async function uploadRelease(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedApp || !release.file) { setNotice({ kind: "error", text: "Choose an APK file before uploading." }); return; }
    setUploading(true); setNotice(null);
    try {
      if (release.iconFile) await api(`/api/v1/developer/apps/${selectedApp.id}/media`, { method: "POST", headers: { "Content-Type": release.iconFile.type, "X-Media-Kind": "icon" }, body: release.iconFile });
      for (const [index, screenshot] of release.screenshotFiles.entries()) await api(`/api/v1/developer/apps/${selectedApp.id}/media`, { method: "POST", headers: { "Content-Type": screenshot.type, "X-Media-Kind": "screenshot", "X-Sort-Order": String(index) }, body: screenshot });
      await api(`/api/v1/developer/apps/${selectedApp.id}/versions/upload`, { method: "POST", headers: { "Content-Type": release.file.type || "application/vnd.android.package-archive", "X-Version-Name": release.versionName, "X-Version-Code": release.versionCode, "X-Changelog": release.changelog }, body: release.file });
      setNotice({ kind: "ok", text: "Media and APK uploaded. The release passed validation and is now pending administrator review." }); setRelease({ versionName: "", versionCode: "", changelog: "", file: null, iconFile: null, screenshotFiles: [] }); const fileInput = document.getElementById("apk-file") as HTMLInputElement | null; if (fileInput) fileInput.value = ""; const iconInput = document.getElementById("icon-file") as HTMLInputElement | null; if (iconInput) iconInput.value = ""; const screenshotInput = document.getElementById("screenshots-file") as HTMLInputElement | null; if (screenshotInput) screenshotInput.value = ""; await loadApps();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "APK upload failed." }); }
    finally { setUploading(false); }
  }

  return <div className="console-page">
    <div className="console-topline"><span>DEVELOPER CONSOLE</span><span className="mono">AUTHENTICATED PUBLISHER</span></div>
    <div className="console-heading"><div><div className="eyebrow">SHIP WITH PROVENANCE</div><h1>Your release runway</h1><p>Create a listing, upload a real APK, and submit it for accountable review.</p></div><div className="heading-actions"><a className="button secondary" href="/apps"><ArrowUpRight size={16} /> View public catalog</a><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New app</button></div></div>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    <div className="console-grid">
      <aside className="release-rail"><div className="rail-header"><span>YOUR APPS</span><button className="icon-button" onClick={() => void loadApps()} aria-label="Refresh apps"><RefreshCw size={15} /></button></div>{loadingApps ? <div className="muted-block">Loading owned listings…</div> : apps.length === 0 ? <div className="empty-rail"><FileArchive size={22} /><p>No app listings yet.</p><button className="text-button" onClick={() => setShowCreate(true)}>Create your first app →</button></div> : <div className="app-list">{apps.map(item => <button className={`app-list-item ${selected === item.app.id ? "selected" : ""}`} key={item.app.id} onClick={() => setSelected(item.app.id)}><span className="app-mark">{item.app.name.slice(0, 1).toUpperCase()}</span><span><strong>{item.app.name}</strong><small className="mono">{item.app.packageName}</small></span><span className={`status-dot ${item.app.status}`} /></button>)}</div>}</aside>
      <main className="release-main">{selectedApp ? <><div className="release-header"><div><div className="eyebrow">LISTING / {selectedApp.status.toUpperCase()}</div><h2>{selectedApp.name}</h2><p>{selectedApp.shortDescription}</p><span className="mono package-line">{selectedApp.packageName}</span></div><span className={`status-pill ${statusTone[selectedApp.status] || statusTone.draft}`}>{selectedApp.status.replace("_", " ")}</span></div><section className="upload-card"><div className="section-heading"><div><span className="eyebrow">NEW RELEASE</span><h3>Upload an APK artifact</h3></div><span className="truth-note">Validation runs on the server</span></div><form onSubmit={uploadRelease} className="release-form"><div className="form-row"><label>Version name<input required value={release.versionName} onChange={event => setRelease({ ...release, versionName: event.target.value })} placeholder="1.0.0" /></label><label>Version code<input required type="number" min="1" value={release.versionCode} onChange={event => setRelease({ ...release, versionCode: event.target.value })} placeholder="1" /></label></div><label>Release notes<textarea value={release.changelog} onChange={event => setRelease({ ...release, changelog: event.target.value })} placeholder="What changed in this release?" rows={3} /></label><div className="media-row"><label className="file-drop compact" htmlFor="icon-file"><UploadCloud size={17} /><span>{release.iconFile ? release.iconFile.name : "App icon (optional)"}</span><input id="icon-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setRelease({ ...release, iconFile: event.target.files?.[0] ?? null })} /></label><label className="file-drop compact" htmlFor="screenshots-file"><UploadCloud size={17} /><span>{release.screenshotFiles.length ? `${release.screenshotFiles.length} screenshot(s)` : "Screenshots (optional)"}</span><input id="screenshots-file" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event => setRelease({ ...release, screenshotFiles: Array.from(event.target.files ?? []) })} /></label></div><label className="file-drop" htmlFor="apk-file"><UploadCloud size={21} /><span>{release.file ? release.file.name : "Choose an APK file"}</span><small>{release.file ? formatBytes(release.file.size) : "The server rejects HTML, malformed archives, and mismatched metadata."}</small><input id="apk-file" type="file" accept=".apk,application/vnd.android.package-archive" required onChange={event => setRelease({ ...release, file: event.target.files?.[0] ?? null })} /></label><div className="form-footer"><span className="muted">The release remains private until an administrator publishes it.</span><button className="button primary" disabled={uploading}>{uploading ? "Uploading & validating…" : "Upload for review"}</button></div></form></section><section className="history-card"><div className="section-heading"><div><span className="eyebrow">RELEASE HISTORY</span><h3>What has shipped</h3></div></div>{selectedReleases.length === 0 ? <div className="empty-history">No releases have been uploaded for this listing.</div> : <div className="release-table"><div className="table-head"><span>VERSION</span><span>STATE</span><span>ARTIFACT</span><span>CREATED</span></div>{selectedReleases.map(item => <div className="table-row" key={item.id}><span><strong>{item.versionName}</strong><small className="mono">code {item.versionCode}</small></span><span><span className={`status-pill ${statusTone[item.status] || statusTone.draft}`}>{item.status.replace("_", " ")}</span></span><span className="mono">{formatBytes(item.fileSize)}<small>{item.sha256 ? `${item.sha256.slice(0, 12)}…` : "checksum pending"}</small></span><span>{formatDate(item.createdAt)}</span></div>)}</div>}</section></> : <div className="blank-state"><LockKeyhole size={26} /><div><h2>Choose an app listing</h2><p>Select an app on the left or create one to begin publishing.</p></div></div>}</main>
    </div>
    {showCreate && <div className="modal-backdrop"><form className="modal-card" onSubmit={createApp}><div className="section-heading"><div><span className="eyebrow">NEW LISTING</span><h2>Register an app</h2></div><button type="button" className="icon-button" onClick={() => setShowCreate(false)}>×</button></div><p className="modal-copy">Package identity is permanent. Use the exact Android application ID from your APK.</p><label>App name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Signal Private Messenger" /></label><label>Package name<input required className="mono" value={form.packageName} onChange={event => setForm({ ...form, packageName: event.target.value })} placeholder="org.example.app" /></label><label>Developer name<input required value={form.developerName} onChange={event => setForm({ ...form, developerName: event.target.value })} /></label><label>Short description<input required value={form.shortDescription} onChange={event => setForm({ ...form, shortDescription: event.target.value })} placeholder="A concise description for catalog cards" /></label><label>Full description<textarea required value={form.fullDescription} onChange={event => setForm({ ...form, fullDescription: event.target.value })} rows={5} placeholder="Explain what the app does and who it is for." /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create listing"}</button></div></form></div>}
  </div>;
}

function SignInPanel() { return <div className="auth-panel"><div className="brand-lockup"><span className="brand-glyph">A</span><span>APK Store Console</span></div><LockKeyhole size={30} /><h1>Sign in to publish</h1><p>Use the secure Manus sign-in screen to continue with Google, Microsoft, Apple, or a passkey. Your email is not shown in this console.</p><button className="button primary" onClick={() => startLogin()}>Continue with Google</button><a href="/apps" className="text-button">Browse the public catalog →</a></div>; }
function LoadingPanel({ label }: { label: string }) { return <div className="auth-panel"><RefreshCw className="spin" size={24} /><p>{label}</p></div>; }
