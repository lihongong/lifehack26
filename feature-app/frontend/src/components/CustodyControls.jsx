import { useEffect, useState } from "react";
import {
  createCustodyLocation,
  getCustodyLocations,
  getCustodySettings,
  updateCustodyLocation,
  updateCustodySettings,
} from "../api/privilegeApi.js";

const zones = [["utown", "UTown"], ["museum-ucc", "Museum/UCC"], ["cde", "CDE"], ["central", "Central"], ["fass", "FASS"], ["business", "Business"], ["computing", "Computing"], ["pgp", "PGP"], ["science", "Science"], ["medicine-kent-ridge", "Medicine/Kent Ridge MRT"]];
const emptyLocation = { name: "", nusZoneId: "central", defaultInstructions: "", reason: "" };

export default function CustodyControls({ onChanged }) {
  const [settings, setSettings] = useState(null);
  const [locations, setLocations] = useState([]);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [locationDraft, setLocationDraft] = useState(emptyLocation);
  const [reasons, setReasons] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = async () => {
    const [settingData, locationData] = await Promise.all([getCustodySettings(), getCustodyLocations()]);
    setSettings(settingData.settings); setLocations(locationData.locations);
    setSettingsDraft({ ...settingData.settings, reason: "", procedureEvidenceReference: settingData.settings.procedureEvidenceReference || "" });
  };
  useEffect(() => { refresh().catch((caught) => setError(caught.message)); }, []);
  if (!settingsDraft) return <p>Loading custody controls…</p>;
  return <section aria-labelledby="custody-controls-title">
    <h2 id="custody-controls-title">Custody operations</h2>
    <p>Appointments and physical intake remain blocked until procedure evidence, explicit enablement, and an active Custody Location are all present.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="action-status" role="status">{message}</p>}
    <form className="privileged-form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { await updateCustodySettings({ revision: settings.revision, procedureApproved: settingsDraft.procedureApproved, procedureEvidenceReference: settingsDraft.procedureEvidenceReference, custodyEnabled: settingsDraft.custodyEnabled, reason: settingsDraft.reason }); setMessage("Custody settings updated."); await refresh(); await onChanged?.(); } catch (caught) { setError(caught.message); } }}>
      <h2>Custody procedure gate</h2>
      <label className="gate-toggle"><input type="checkbox" checked={settingsDraft.procedureApproved} onChange={(event) => setSettingsDraft({ ...settingsDraft, procedureApproved: event.target.checked, custodyEnabled: event.target.checked ? settingsDraft.custodyEnabled : false })} />Custody procedure approved</label>
      <label>Private evidence reference<input disabled={!settingsDraft.procedureApproved} value={settingsDraft.procedureEvidenceReference} onChange={(event) => setSettingsDraft({ ...settingsDraft, procedureEvidenceReference: event.target.value })} /></label>
      <label className="gate-toggle"><input type="checkbox" checked={settingsDraft.custodyEnabled} onChange={(event) => setSettingsDraft({ ...settingsDraft, custodyEnabled: event.target.checked })} />Custody explicitly enabled</label>
      <span>{settings.ready ? "Ready for appointments and intake" : `Blocked · ${settings.activeLocationCount} active location(s)`}</span>
      <label>Reason for custody change<input required minLength="3" maxLength="500" value={settingsDraft.reason} onChange={(event) => setSettingsDraft({ ...settingsDraft, reason: event.target.value })} /></label>
      <button className="primary-action">Save custody gate</button>
    </form>
    <form className="privileged-form" onSubmit={async (event) => { event.preventDefault(); setError(""); try { await createCustodyLocation(locationDraft); setLocationDraft(emptyLocation); setMessage("Custody Location created."); await refresh(); await onChanged?.(); } catch (caught) { setError(caught.message); } }}>
      <h2>Create Custody Location</h2>
      <label>Name<input required value={locationDraft.name} onChange={(event) => setLocationDraft({ ...locationDraft, name: event.target.value })} /></label>
      <label>NUS Zone<select value={locationDraft.nusZoneId} onChange={(event) => setLocationDraft({ ...locationDraft, nusZoneId: event.target.value })}>{zones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Private default instructions<textarea required rows="4" value={locationDraft.defaultInstructions} onChange={(event) => setLocationDraft({ ...locationDraft, defaultInstructions: event.target.value })} /></label>
      <label>Creation reason<input required minLength="3" maxLength="500" value={locationDraft.reason} onChange={(event) => setLocationDraft({ ...locationDraft, reason: event.target.value })} /></label>
      <button className="primary-action">Create Custody Location</button>
    </form>
    <ul className="management-list">{locations.map((location) => <li key={location.id}><div><strong>{location.name}</strong><span>{location.nusZone.name} · {location.active ? "Active" : "Inactive"}{location.fictional ? " · Fictional" : ""} · Revision {location.revision}</span></div><p>{location.defaultInstructions}</p><label>Change reason<input required value={reasons[location.id] || ""} onChange={(event) => setReasons({ ...reasons, [location.id]: event.target.value })} /></label><button className={location.active ? "danger-action" : "primary-action"} type="button" onClick={async () => { setError(""); try { await updateCustodyLocation(location.id, { revision: location.revision, active: !location.active, reason: reasons[location.id] }); setMessage(`Custody Location ${location.active ? "deactivated" : "reactivated"}.`); await refresh(); await onChanged?.(); } catch (caught) { setError(caught.message); } }}>{location.active ? "Deactivate location" : "Reactivate location"}</button></li>)}</ul>
  </section>;
}
