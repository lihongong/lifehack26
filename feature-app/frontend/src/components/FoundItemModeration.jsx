import { useEffect, useState } from "react";
import {
  arrangeFoundItemHandover,
  closeFoundItemReport,
  getModerationCustodyLocations,
  getModerationFoundItemReports,
  intakeFoundItem,
  reviewFoundItemReport,
} from "../api/privilegeApi.js";

const categories = ["Electronics", "Wallets & Cards", "Keys", "Bags", "Clothing", "Accessories", "Documents", "Other"];
const zones = [["utown", "UTown"], ["museum-ucc", "Museum/UCC"], ["cde", "CDE"], ["central", "Central"], ["fass", "FASS"], ["business", "Business"], ["computing", "Computing"], ["pgp", "PGP"], ["science", "Science"], ["medicine-kent-ridge", "Medicine/Kent Ridge MRT"]];
const futureLocal = () => { const value = new Date(Date.now() + 864e5); value.setMinutes(0, 0, 0); return value.toISOString().slice(0, 16); };

export default function FoundItemModeration() {
  const [reports, setReports] = useState([]);
  const [locations, setLocations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const refresh = async () => {
    const [pending, approved, arranged, locationData] = await Promise.all([
      getModerationFoundItemReports("pending_review"), getModerationFoundItemReports("approved"),
      getModerationFoundItemReports("handover_arranged"), getModerationCustodyLocations(),
    ]);
    const values = [...pending.reports, ...approved.reports, ...arranged.reports];
    setReports(values); setLocations(locationData.locations);
    setDrafts((current) => {
      const next = { ...current };
      for (const report of values) next[report.id] ||= {
        category: report.approvedPublic?.category || report.category,
        foundDate: report.approvedPublic?.foundDate || report.foundDate,
        nusZoneId: report.approvedPublic?.nusZoneId || report.nusZone.id,
        publicDescription: report.approvedPublic?.description || "",
        approvedPhotoIds: report.approvedPublic?.approvedPhotoIds || report.photos.map(({ id }) => id),
        reason: "", closureOutcome: "abandoned", locationId: locationData.locations[0]?.id || "",
        appointmentAt: futureLocal(), instructions: "", condition: "good", conditionNotes: "",
      };
      return next;
    });
  };
  useEffect(() => { refresh().catch((caught) => setError(caught.message)); }, []);
  const update = (id, change) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  const act = async (operation, message) => { setError(""); setStatus(""); try { await operation(); setStatus(message); await refresh(); } catch (caught) { setError(caught.message); } };
  return <section aria-labelledby="found-item-moderation-title">
    <h2 id="found-item-moderation-title">Found-Item custody workflow</h2>
    <p>Approve sanitized public candidates, privately arrange handover, and record physical intake. The Participant already received 20 Gems when submitting the report.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{status && <p className="action-status" role="status">{status}</p>}
    {reports.length ? <ul className="moderation-list found-custody-list">{reports.map((report) => {
      const draft = drafts[report.id]; if (!draft) return null;
      const togglePhoto = (id, checked) => update(report.id, { approvedPhotoIds: checked ? [...draft.approvedPhotoIds, id] : draft.approvedPhotoIds.filter((value) => value !== id) });
      return <li key={report.id}>
        <div><strong>{report.category} found on {report.foundDate}</strong><span>{report.status.replaceAll("_", " ")} · {report.nusZone.name} · Revision {report.revision}</span></div>
        <section className="private-review-panel"><strong>Original candidate — private</strong><p>{report.description}</p><strong>Private Identifying Details</strong><p>{report.privateIdentifyingDetails}</p></section>
        {report.photos.length > 0 && <fieldset className="moderator-photo-grid"><legend>Public photo subset</legend>{report.photos.map((photo) => <label key={photo.id}><input type="checkbox" checked={draft.approvedPhotoIds.includes(photo.id)} onChange={(event) => togglePhoto(photo.id, event.target.checked)} /><img src={photo.url} alt="Sanitized Found-Item photo for Moderator review" /></label>)}</fieldset>}
        {report.status === "pending_review" && <>
          <PublicFields draft={draft} update={(change) => update(report.id, change)} />
          <label>Review reason<input value={draft.reason} onChange={(event) => update(report.id, { reason: event.target.value })} /></label>
          <div className="decision-row"><button className="primary-action" type="button" onClick={() => act(() => reviewFoundItemReport(report.id, { revision: report.revision, decision: "approve", ...draft }), "Found-Item Report approved publicly.")}>Approve report</button><button className="danger-action" type="button" onClick={() => act(() => reviewFoundItemReport(report.id, { revision: report.revision, decision: "reject", reason: draft.reason }), "Found-Item Report rejected.")}>Reject report</button></div>
        </>}
        {["approved", "handover_arranged"].includes(report.status) && <>
          {report.appointment && <div className="source-snapshot"><strong>Private appointment</strong><br />{report.appointment.custodyLocation.name} · {new Date(report.appointment.appointmentAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}<br />{report.appointment.instructions}</div>}
          <label>Custody Location<select value={draft.locationId} onChange={(event) => update(report.id, { locationId: event.target.value })}><option value="">Select active location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label>Appointment time<input type="datetime-local" value={draft.appointmentAt} onChange={(event) => update(report.id, { appointmentAt: event.target.value })} /></label>
          <label>Participant instructions<textarea rows="3" value={draft.instructions} onChange={(event) => update(report.id, { instructions: event.target.value })} /></label>
          <label>Appointment/closure reason<input value={draft.reason} onChange={(event) => update(report.id, { reason: event.target.value })} /></label>
          <button className="secondary-action" type="button" onClick={() => act(() => arrangeFoundItemHandover(report.id, { revision: report.revision, locationId: draft.locationId, appointmentAt: new Date(draft.appointmentAt).toISOString(), instructions: draft.instructions, reason: draft.reason }), report.status === "approved" ? "Handover arranged." : "Handover rescheduled.")}>{report.status === "approved" ? "Arrange private handover" : "Reschedule handover"}</button>
          <label>Closure outcome<select value={draft.closureOutcome} onChange={(event) => update(report.id, { closureOutcome: event.target.value })}><option value="abandoned">Abandoned</option><option value="otherwise_closed">Otherwise closed</option></select></label>
          <button className="danger-action" type="button" onClick={() => act(() => closeFoundItemReport(report.id, { revision: report.revision, outcome: draft.closureOutcome, reason: draft.reason }), "Found-Item Report closed without reward.")}>Close without reward</button>
        </>}
        {report.status === "handover_arranged" && <>
          <h3>Record physical intake</h3><PublicFields draft={draft} update={(change) => update(report.id, change)} />
          <label>Condition<select value={draft.condition} onChange={(event) => update(report.id, { condition: event.target.value })}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="unknown">Unknown</option></select></label>
          <label>Private condition notes<textarea rows="3" value={draft.conditionNotes} onChange={(event) => update(report.id, { conditionNotes: event.target.value })} /></label>
          <label>Intake reason<input value={draft.reason} onChange={(event) => update(report.id, { reason: event.target.value })} /></label>
          <button className="primary-action" type="button" onClick={() => act(() => intakeFoundItem(report.id, { revision: report.revision, ...draft }), "Physical intake recorded.")}>Confirm physical intake</button>
        </>}
      </li>;
    })}</ul> : <p>No Found-Item Reports require custody action.</p>}
  </section>;
}

function PublicFields({ draft, update }) {
  return <div className="correction-fields"><label>Public category<select value={draft.category} onChange={(event) => update({ category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Public found date<input type="date" value={draft.foundDate} onChange={(event) => update({ foundDate: event.target.value })} /></label><label>Public NUS Zone<select value={draft.nusZoneId} onChange={(event) => update({ nusZoneId: event.target.value })}>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Sanitized public description<textarea rows="4" value={draft.publicDescription} onChange={(event) => update({ publicDescription: event.target.value })} /></label></div>;
}
