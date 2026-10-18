import { api, formatBytes, formatDate } from "@/lib/api";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";

interface AppRecord {
  id: number;
  name: string;
  slug: string;
  packageName: string;
  developerName: string;
  shortDescription: string;
  fullDescription: string;
  iconUrl: string | null;
  status: string;
}
interface Version {
  id: number;
  versionName: string;
  versionCode: number;
  fileSize: number | null;
  sha256: string | null;
  minSdk: number | null;
  targetSdk: number | null;
  changelog: string | null;
  publishedAt: string | null;
  downloadUrl: string;
}

type AppDetailPayload = { app: AppRecord & { screenshots?: string[] }; versions: Version[] };

export function Catalog() {
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load(search = "") {
    setLoading(true); setError("");
    try { const data = await api<{ apps: AppRecord[] }>(`/api/v1/apps${search ? `?q=${encodeURIComponent(search)}` : ""}`); setApps(data.apps); }
    catch (e) { setError(e instanceof Error ? e.message : "Catalog unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function submit(event: React.FormEvent) { event.preventDefault(); void load(query); }
  return <div className="public-page"><PublicNav /><section className="catalog-hero"><div><div className="eyebrow">PUBLISHED ARTIFACTS</div><h1>Apps that can be traced.</h1><p>Browse releases that passed validation and were explicitly published by an administrator.</p></div><form className="search-box" onSubmit={submit}><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, package, or developer" /><button>Search</button></form></section><main className="catalog-content">{loading ? <div className="catalog-state">Loading published records…</div> : error ? <div className="catalog-state error">{error}</div> : apps.length === 0 ? <div className="catalog-state"><ShieldCheck size={24} /><h2>No published apps yet</h2><p>When an administrator publishes a validated release, it will appear here. This catalog does not invent listings.</p></div> : <div className="catalog-grid">{apps.map(app => <Link key={app.id} href={`/apps/${app.slug}`} className="catalog-card"><div className="catalog-card-top"><div className="app-mark large">{app.iconUrl ? <img src={app.iconUrl} alt="" /> : app.name.slice(0, 1).toUpperCase()}</div><span className="verified-tag"><ShieldCheck size={13} /> Published</span></div><h2>{app.name}</h2><span className="mono">{app.packageName}</span><p>{app.shortDescription}</p><div className="catalog-card-footer"><span>{app.developerName}</span><ArrowUpRight size={15} /></div></Link>)}</div>}</main></div>;
}

export function AppDetail() {
  const [, params] = useRoute<{ slug: string }>("/apps/:slug");
  const [, navigate] = useLocation();
  const [data, setData] = useState<AppDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!params?.slug) return;
    void api<AppDetailPayload>(`/api/v1/apps/${params.slug}`).then(setData).catch(e => setError(e instanceof Error ? e.message : "App not found.")).finally(() => setLoading(false));
  }, [params?.slug]);
  if (loading) return <div className="public-page"><PublicNav /><div className="catalog-state">Loading app details…</div></div>;
  if (error || !data) return <div className="public-page"><PublicNav /><div className="catalog-state error"><h2>App unavailable</h2><p>{error || "This app is not currently published."}</p><button className="button secondary" onClick={() => navigate("/apps")}><ArrowLeft size={15} /> Back to catalog</button></div></div>;
  const latest = data.versions[0];
  return <div className="public-page"><PublicNav /><main className="detail-content"><button className="back-link" onClick={() => navigate("/apps")}><ArrowLeft size={15} /> Back to catalog</button><section className="detail-hero"><div className="detail-icon">{data.app.iconUrl ? <img src={data.app.iconUrl} alt="" /> : data.app.name.slice(0, 1)}</div><div className="detail-copy"><div className="eyebrow">VERIFIED PUBLISHED RELEASE</div><h1>{data.app.name}</h1><p>{data.app.shortDescription}</p><div className="detail-meta"><span>{data.app.developerName}</span><span className="mono">{data.app.packageName}</span></div></div>{latest && <a className="button primary download-button" href={latest.downloadUrl}><ArrowDownToLine size={17} /> Download {latest.versionName}</a>}</section>{data.app.screenshots && data.app.screenshots.length > 0 && <section className="screenshots-panel"><div className="section-heading"><div><span className="eyebrow">SCREENSHOTS</span><h2>Inside the published build</h2></div></div><div className="screenshot-strip">{data.app.screenshots.map((url, index) => <img key={`${url}-${index}`} src={url ?? ""} alt={`${data.app.name} screenshot ${index + 1}`} loading="lazy" />)}</div></section>}<div className="detail-grid"><article className="detail-panel"><div className="section-heading"><div><span className="eyebrow">ABOUT THIS APP</span><h2>Release notes and identity</h2></div></div><p className="long-copy">{data.app.fullDescription}</p>{latest && <><div className="changelog-block"><span className="eyebrow">LATEST CHANGELOG</span><p>{latest.changelog || "No changelog was supplied for this release."}</p></div><div className="artifact-facts"><Fact label="Current version" value={latest.versionName} /><Fact label="Version code" value={String(latest.versionCode)} /><Fact label="APK size" value={formatBytes(latest.fileSize)} /><Fact label="Android SDK" value={`${latest.minSdk ?? "—"} to ${latest.targetSdk ?? "—"}`} /><Fact label="Published" value={formatDate(latest.publishedAt)} /><Fact label="Checksum" value={latest.sha256 ? `${latest.sha256.slice(0, 16)}…` : "Not available"} mono /></div></>}</article><aside className="detail-panel history-panel"><div className="section-heading"><div><span className="eyebrow">VERSION HISTORY</span><h2>Published releases</h2></div></div>{data.versions.map(version => <div className="version-row" key={version.id}><div><strong>v{version.versionName}</strong><span className="mono">code {version.versionCode}</span></div><div><span>{formatDate(version.publishedAt)}</span><a href={version.downloadUrl} aria-label={`Download version ${version.versionName}`}><ArrowDownToLine size={15} /></a></div></div>)}</aside></div></main></div>;
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>; }
function PublicNav() { return <header className="public-nav"><Link href="/" className="brand-lockup"><span className="brand-glyph">A</span><span>APK Store <em>Console</em></span></Link><nav><Link href="/apps">Public catalog</Link><Link href="/console">Developer console</Link><Link className="nav-cta" href="/console">Publish an app <ArrowUpRight size={14} /></Link></nav></header>; }
