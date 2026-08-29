import { ImageOff, PackageCheck, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  createFoundItemReport,
  getFoundItemReports,
  getFoundItems,
  getMyFoundItemReports,
  replaceFoundItemReport,
  withdrawFoundItemReport,
} from "../api/foundItemApi.js";
import CommentThread from "./CommentThread.jsx";
import ReportControl from "./ReportControl.jsx";

const categories = ["Electronics", "Wallets & Cards", "Keys", "Bags", "Clothing", "Accessories", "Documents", "Other"];
const zones = [["utown", "UTown"], ["museum-ucc", "Museum/UCC"], ["cde", "CDE"], ["central", "Central"], ["fass", "FASS"], ["business", "Business"], ["computing", "Computing"], ["pgp", "PGP"], ["science", "Science"], ["medicine-kent-ridge", "Medicine/Kent Ridge MRT"]];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
const blank = () => ({ category: "Other", foundDate: today(), nusZoneId: "central", description: "", privateIdentifyingDetails: "", retainedPhotoIds: [] });

export default function FoundItemWorkflow() {
  const { participant } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [zone, setZone] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reports, setReports] = useState([]);
  const [items, setItems] = useState([]);
  const [mine, setMine] = useState([]);
  const [draft, setDraft] = useState(blank);
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const loadPublic = async () => {
    const filters = { query, category, zone, dateFrom, dateTo };
    const [reportData, itemData] = await Promise.all([getFoundItemReports(filters), getFoundItems(filters)]);
    setReports(reportData.reports); setItems(itemData.items);
  };
  const loadMine = async () => participant && setMine((await getMyFoundItemReports()).reports);
  useEffect(() => { loadPublic().catch((caught) => setError(caught.message)); }, [query, category, zone, dateFrom, dateTo]);
  useEffect(() => { if (participant) loadMine().catch((caught) => setError(caught.message)); else setMine([]); }, [participant]);
  const reset = () => { setDraft(blank()); setFiles([]); setEditingId(null); };
  const edit = (report) => { setEditingId(report.id); setDraft({ category: report.category, foundDate: report.foundDate, nusZoneId: report.nusZone.id, description: report.description, privateIdentifyingDetails: report.privateIdentifyingDetails, retainedPhotoIds: report.photos.map(({ id }) => id) }); document.getElementById("found-item-report-form")?.scrollIntoView({ behavior: "smooth" }); };
  return <section className="found-item-workflow" aria-labelledby="found-property-title">
    <div className="section-heading"><h2 id="found-property-title">Found property</h2><span>{reports.length} awaiting handover · {items.length} in custody</span></div>
    <div className="lost-item-filters found-property-filters">
      <label className="search-field found-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search found property</span><input type="search" placeholder="Search found property…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>Found category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Found NUS Zone<select value={zone} onChange={(event) => setZone(event.target.value)}><option value="">All zones</option>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Found from<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label>Found to<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{status && <p className="action-status" role="status">{status}</p>}
    <div className="lost-item-grid">{reports.map((report) => <FoundPropertyCard key={report.id} value={report} type="found_item_report" />)}{items.map((item) => <FoundPropertyCard key={item.id} value={item} type="found_item" />)}{!reports.length && !items.length && <p className="status-message">No public found property matches this search.</p>}</div>
    {participant && <>
      <form id="found-item-report-form" className="lost-item-form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { if (editingId) { const current = mine.find(({ id }) => id === editingId); await replaceFoundItemReport(editingId, { ...draft, revision: current.revision, retainedPhotoIds: JSON.stringify(draft.retainedPhotoIds) }, files); setStatus("Found-Item Report replaced and returned to review."); } else { await createFoundItemReport(draft, files); setStatus("Found-Item Report submitted privately for Moderator review."); } reset(); await Promise.all([loadMine(), loadPublic()]); } catch (caught) { if (caught.status === 428) navigate(`/policies?action=posting&returnTo=${encodeURIComponent("/lost-and-found")}`); else setError(caught.message); } }}>
        <div><p className="eyebrow">PRIVATE HANDOVER WORKFLOW</p><h2>{editingId ? "Replace Found-Item Report" : "I found something"}</h2><p>Your identity, original description, identifying evidence, and future handover appointment remain private.</p></div>
        <label>Found category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Found date<input type="date" max={today()} value={draft.foundDate} onChange={(event) => setDraft({ ...draft, foundDate: event.target.value })} /></label>
        <label>Found NUS Zone<select value={draft.nusZoneId} onChange={(event) => setDraft({ ...draft, nusZoneId: event.target.value })}>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Original candidate description <small>Private until a Moderator authors a sanitized public version</small><textarea required minLength="10" rows="5" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Private Identifying Details<textarea required minLength="3" rows="4" value={draft.privateIdentifyingDetails} onChange={(event) => setDraft({ ...draft, privateIdentifyingDetails: event.target.value })} /></label>
        {editingId && mine.find(({ id }) => id === editingId)?.photos.length > 0 && <fieldset className="retained-photos"><legend>Retain sanitized photos</legend>{mine.find(({ id }) => id === editingId).photos.map((photo) => <label key={photo.id}><input type="checkbox" checked={draft.retainedPhotoIds.includes(photo.id)} onChange={(event) => setDraft({ ...draft, retainedPhotoIds: event.target.checked ? [...draft.retainedPhotoIds, photo.id] : draft.retainedPhotoIds.filter((id) => id !== photo.id) })} /><img src={photo.url} alt="Private sanitized Found-Item preview" /></label>)}</fieldset>}
        <label>Safe photos (optional, up to three)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles([...event.target.files].slice(0, 3))} /><small>Metadata is stripped and every photo remains encrypted at rest.</small></label>
        <div className="lost-item-form-actions"><button className="primary-action">{editingId ? "Replace and resubmit" : "Submit Found-Item Report"}</button>{editingId && <button type="button" className="secondary-action" onClick={reset}>Cancel</button>}</div>
      </form>
      <section className="my-lost-items"><h2>My Found-Item Reports</h2>{mine.length ? <ul>{mine.map((report) => <li key={report.id}><div><strong>{report.category} · {report.foundDate}</strong><span className={`status-badge status-${report.status}`}>{report.status.replaceAll("_", " ")}</span></div><p>{report.description}</p>{report.rejectionReason && <p className="rejection-reason">Moderator reason: {report.rejectionReason}</p>}{report.closure && <p className="rejection-reason">Closed: {report.closure.outcome.replaceAll("_", " ")} · {report.closure.reason}</p>}{report.appointment && <div className="source-snapshot"><strong>Private handover appointment</strong><br />{report.appointment.custodyLocation.name}<br />{new Date(report.appointment.appointmentAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}<br />{report.appointment.instructions}</div>}{report.intake?.reward && <p className="reward-note">Physical intake verified · +{report.intake.reward.amount} Gems</p>}<div className="management-actions">{["pending_review", "rejected"].includes(report.status) && <button type="button" className="secondary-action" onClick={() => edit(report)}>Edit report</button>}{!["withdrawn", "closed", "received"].includes(report.status) && <button type="button" className="danger-action" onClick={async () => { try { await withdrawFoundItemReport(report.id); setStatus("Found-Item Report withdrawn without a reward."); await Promise.all([loadMine(), loadPublic()]); } catch (caught) { setError(caught.message); } }}>Withdraw before handover</button>}</div></li>)}</ul> : <p>No Found-Item Reports yet.</p>}</section>
    </>}
  </section>;
}

function FoundPropertyCard({ value, type }) {
  const isItem = type === "found_item";
  return <article className="listing-card lost-item-card found-property-card"><div className="lost-item-gallery">{value.photos.length ? value.photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.alt} />) : <div className="listing-image is-fallback"><ImageOff aria-hidden="true" /><span>No public photo</span></div>}</div><div className="listing-content"><div className="listing-top"><span className="category">{value.category}</span><span className="status-badge">{isItem ? "In Custody" : value.handoverArranged ? "Handover arranged" : "Awaiting handover"}</span></div><h3>{isItem ? "Found Item" : "Found-Item Report"}</h3>{value.fictional && <span className="fictional-note">Fictional fixture</span>}<p>{value.description}</p><div className="lost-item-facts"><span><PackageCheck size={15} aria-hidden="true" />Found {value.foundDate} · {value.nusZone.name}</span>{isItem && <span>Condition: {value.condition}</span>}</div><ReportControl targetType={type} targetId={value.id} label={`Report ${isItem ? "Found Item" : "Found-Item Report"}`} /><CommentThread post={value} postType={type} label={isItem ? "Found Item" : "Found-Item Report"} /></div></article>;
}
