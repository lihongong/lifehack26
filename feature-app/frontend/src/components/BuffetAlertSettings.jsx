import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SelectControl } from "./ExchangePrimitives.jsx";
import { synchronizeBuffetAlerts, updateBuffetAlertPreference } from "../api/buffetApi.js";

export default function BuffetAlertSettings({ data, onData }) {
  const navigate = useNavigate();
  const [nusZone, setNusZone] = useState(data.settings.nusZone || "");
  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleError = (caught) => {
    if (caught.status === 428) {
      navigate(`/policies?action=alerts&returnTo=${encodeURIComponent("/buffets")}`);
      return;
    }
    setError(caught.message);
  };

  return (
    <section className="exchange-panel buffet-alert-settings" aria-labelledby="buffet-alert-settings-title">
      <div>
        <p className="eyebrow">PRIVATE ALERT SETTINGS</p>
        <h3 id="buffet-alert-settings-title">Buffet Alerts</h3>
        <p>Choose one NUS Zone. Alerts include that zone and each Nearby Zone one graph hop away.</p>
      </div>
      <SelectControl label="Buffet Alert NUS Zone" value={nusZone} onChange={(event) => {
        const value = event.target.value;
        setNusZone(value);
        if (!value) setEnabled(false);
      }}>
        <option value="">Not selected</option>
        {data.settings.zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}
      </SelectControl>
      <label className="buffet-alert-toggle">
        <input type="checkbox" checked={enabled} disabled={!nusZone} onChange={(event) => setEnabled(event.target.checked)} />
        <span>Enable Buffet Alerts</span>
      </label>
      <div className="buffet-settings-actions">
        <button className="primary-action" type="button" disabled={pending} onClick={async () => {
          setPending(true); setError(""); setStatus("");
          try {
            const updated = await updateBuffetAlertPreference({ nusZone, enabled });
            onData(updated);
            setStatus(enabled ? "Buffet Alerts enabled." : "Buffet Alerts saved as off.");
          } catch (caught) { handleError(caught); } finally { setPending(false); }
        }}>{pending ? "Saving..." : "Save Buffet Alert settings"}</button>
        <button className="secondary-action" type="button" disabled={pending || !data.settings.enabled} onClick={async () => {
          setPending(true); setError(""); setStatus("");
          try {
            const synchronized = await synchronizeBuffetAlerts();
            onData({ settings: data.settings, alerts: synchronized.alerts });
            setStatus(synchronized.delivered ? `${synchronized.delivered} new Buffet Alert${synchronized.delivered === 1 ? "" : "s"}.` : "Buffet Alerts are up to date.");
          } catch (caught) { handleError(caught); } finally { setPending(false); }
        }}>Check for Buffet Alerts</button>
      </div>
      {status && <p className="action-status" role="status" aria-live="polite">{status}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
