import { CalendarDays, ImageOff, MapPin, PackageCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  createFoundItemReport,
  getMyFoundItemReports,
  replaceFoundItemReport,
  withdrawFoundItemReport,
} from "../api/foundItemApi.js";
import CommentThread from "./CommentThread.jsx";
import ReportControl from "./ReportControl.jsx";
import { DateControl, SelectControl } from "./PropertyControls.jsx";
import GemRewardToast, { GemAmount } from "./GemRewardToast.jsx";

const categories = ["Electronics", "Wallets & Cards", "Keys", "Bags", "Clothing", "Accessories", "Documents", "Other"];
const zones = [["utown", "UTown"], ["museum-ucc", "Museum/UCC"], ["cde", "CDE"], ["central", "Central"], ["fass", "FASS"], ["business", "Business"], ["computing", "Computing"], ["pgp", "PGP"], ["science", "Science"], ["medicine-kent-ridge", "Medicine/Kent Ridge MRT"]];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
const blank = () => ({ category: "Other", foundDate: today(), nusZoneId: "central", description: "", privateIdentifyingDetails: "", retainedPhotoIds: [] });

export default function FoundItemWorkflow({ onChanged }) {
  const { participant, refresh } = useAuth();
  const navigate = useNavigate();
  const [mine, setMine] = useState([]);
  const [draft, setDraft] = useState(blank);
  const [files, setFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState(null);
  const loadMine = async () => participant && setMine((await getMyFoundItemReports()).reports);

  useEffect(() => {
    if (participant) loadMine().catch((caught) => setError(caught.message));
    else setMine([]);
  }, [participant]);

  const reset = () => { setDraft(blank()); setFiles([]); setEditingId(null); };
  const edit = (report) => {
    setEditingId(report.id);
    setDraft({
      category: report.category,
      foundDate: report.foundDate,
      nusZoneId: report.nusZone.id,
      description: report.description,
      privateIdentifyingDetails: report.privateIdentifyingDetails,
      retainedPhotoIds: report.photos.map(({ id }) => id),
    });
    document.getElementById("found-item-report-form")?.scrollIntoView({ behavior: "smooth" });
  };

  if (!participant) return <aside className="lost-item-sign-in found-item-sign-in">
    <h3>Sign in to report what you found</h3>
    <p>Use your uNivUS session so a Moderator can review the report and privately arrange handover.</p>
    <a href="/univus/">Open through uNivUS</a>
  </aside>;

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setStatus("");
    try {
      if (editingId) {
        const current = mine.find(({ id }) => id === editingId);
        await replaceFoundItemReport(editingId, { ...draft, revision: current.revision, retainedPhotoIds: JSON.stringify(draft.retainedPhotoIds) }, files);
        setStatus("Found-Item Report updated and returned to review.");
      } else {
        const result = await createFoundItemReport(draft, files);
        setReward(result.report.reward);
        setStatus("Found-Item Report submitted privately for review · +20 Gems.");
        await refresh();
      }
      reset();
      await loadMine();
      await onChanged?.();
    } catch (caught) {
      if (caught.status === 428) navigate(`/policies?action=posting&returnTo=${encodeURIComponent("/lost-and-found")}`);
      else setError(caught.message);
    } finally { setBusy(false); }
  }

  return <section className="participant-property-workflow found-participant-workflow" aria-labelledby="found-report-form-title">
    {error && <p className="form-error" role="alert">{error}</p>}
    {status && <p className="action-status" role="status">{status}</p>}
    <form id="found-item-report-form" className="lost-item-form" onSubmit={submit}>
      <div><p className="eyebrow">YOU FOUND AN ITEM</p><h2 id="found-report-form-title">{editingId ? "Update found-item report" : "Tell us what you found"}</h2><p>Share where and when you found it. Identifying details stay private and help with later ownership checks.</p></div>
      <SelectControl label="Found category" value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} options={categories.map((value) => [value, value])} />
      <DateControl required label="Found date" max={today()} value={draft.foundDate} onChange={(value) => setDraft({ ...draft, foundDate: value })} />
      <SelectControl label="Found NUS Zone" value={draft.nusZoneId} onChange={(value) => setDraft({ ...draft, nusZoneId: value })} options={zones} />
      <label>What did you find? <small>Private until a Moderator writes a safe public description</small><textarea required minLength="10" rows="5" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Private identifying details <small>Marks, contents, serial details, or anything useful for checking ownership</small><textarea required minLength="3" rows="4" value={draft.privateIdentifyingDetails} onChange={(event) => setDraft({ ...draft, privateIdentifyingDetails: event.target.value })} /></label>
      {editingId && mine.find(({ id }) => id === editingId)?.photos.length > 0 && <fieldset className="retained-photos"><legend>Keep existing photos</legend>{mine.find(({ id }) => id === editingId).photos.map((photo) => <label key={photo.id}><input type="checkbox" checked={draft.retainedPhotoIds.includes(photo.id)} onChange={(event) => setDraft({ ...draft, retainedPhotoIds: event.target.checked ? [...draft.retainedPhotoIds, photo.id] : draft.retainedPhotoIds.filter((id) => id !== photo.id) })} /><img src={photo.url} alt="Private sanitized Found-Item preview" /></label>)}</fieldset>}
      <label>Photos <small>Optional, up to three. Metadata is stripped before encrypted storage.</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles([...event.target.files].slice(0, 3))} /></label>
      <div className="lost-item-form-actions"><button className="primary-action" disabled={busy}>{busy ? "Submitting…" : editingId ? "Update and resubmit" : <>Submit found-item report <GemAmount amount={20} /></>}</button>{!editingId && <button type="button" className="secondary-action" onClick={() => setDraft({ category: "Accessories", foundDate: today(), nusZoneId: "central", description: "Fictional blue water bottle found beside the Central Library entrance.", privateIdentifyingDetails: "Demo-only detail: small star sticker beneath the bottle.", retainedPhotoIds: [] })}>Load fictional demo details</button>}{editingId && <button type="button" className="secondary-action" onClick={reset}>Cancel edit</button>}</div>
      <GemRewardToast reward={reward} message="Thank you for reporting found property." />
    </form>
    <MyFoundItemReports reports={mine} onEdit={edit} onWithdraw={async (reportId) => {
      try {
        await withdrawFoundItemReport(reportId);
        setStatus("Found-Item Report withdrawn. No additional Gems were awarded.");
        await loadMine();
        await onChanged?.();
      } catch (caught) { setError(caught.message); }
    }} />
  </section>;
}

function MyFoundItemReports({ reports, onEdit, onWithdraw }) {
  return <section className="my-lost-items"><h2>My found-item reports</h2>{reports.length ? <ul>{reports.map((report) => <li key={report.id}>
    <div><strong>{report.category} · {report.foundDate}</strong><span className={`status-badge status-${report.status}`}>{report.status.replaceAll("_", " ")}</span></div>
    <p>{report.description}</p>
    {report.rejectionReason && <p className="rejection-reason">Moderator reason: {report.rejectionReason}</p>}
    {report.closure && <p className="rejection-reason">Closed: {report.closure.outcome.replaceAll("_", " ")} · {report.closure.reason}</p>}
    {report.appointment && <div className="source-snapshot"><strong>Private handover appointment</strong><br />{report.appointment.custodyLocation.name}<br />{new Date(report.appointment.appointmentAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}<br />{report.appointment.instructions}</div>}
    {report.reward && <p className="reward-note">Report submitted · +{report.reward.amount} Gems</p>}
    <div className="management-actions">{["pending_review", "rejected"].includes(report.status) && <button type="button" className="secondary-action" onClick={() => onEdit(report)}>Edit report</button>}{!["withdrawn", "closed", "received"].includes(report.status) && <button type="button" className="danger-action" onClick={() => onWithdraw(report.id)}>Withdraw before handover</button>}</div>
  </li>)}</ul> : <p>No found-item reports yet.</p>}</section>;
}

export function FoundPropertyCard({ value, type }) {
  const isItem = type === "found_item";
  const foundDate = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(`${value.foundDate}T12:00:00+08:00`));
  return <article className="listing-card lost-item-card found-property-card">
    <div className="lost-item-gallery">{value.photos.length ? value.photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.alt} />) : <div className="listing-image is-fallback"><ImageOff aria-hidden="true" /><span>No public photo</span></div>}</div>
    <div className="listing-content"><div className="listing-top"><span className="category">{value.category}</span><span className="status-badge">{isItem ? "In custody" : "Found"}</span></div><h3>{isItem ? "Found Item" : "Found-Item Report"}</h3>{value.handoverArranged && <p className="handover-note">Handover has been arranged privately.</p>}{value.fictional && <span className="fictional-note">Fictional fixture</span>}<p>{value.description}</p><div className="lost-item-facts"><span><CalendarDays size={15} aria-hidden="true" />Found {foundDate}</span><span><MapPin size={15} aria-hidden="true" />{value.nusZone.name}</span>{isItem && <span><PackageCheck size={15} aria-hidden="true" />Condition: {value.condition}</span>}</div><ReportControl targetType={type} targetId={value.id} label={`Report ${isItem ? "Found Item" : "Found-Item Report"}`} /><CommentThread post={value} postType={type} label={isItem ? "Found Item" : "Found-Item Report"} /></div>
  </article>;
}
