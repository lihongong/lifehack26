import { Flag } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { createContentReport } from "../api/commentApi.js";

export default function ReportControl({ targetType, targetId, label }) {
  const { participant } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("fraud");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!participant) return null;

  return (
    <div className="report-control">
      {!open ? (
        <button type="button" className="report-toggle" onClick={() => { setOpen(true); setStatus(""); }}>
          <Flag size={13} aria-hidden="true" /> {label}
        </button>
      ) : (
        <form onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await createContentReport({ targetType, targetId, category });
            setStatus("Content Report sent to Moderators.");
            setOpen(false);
          } catch (caught) {
            setError(caught.message);
          } finally {
            setBusy(false);
          }
        }}>
          <label>
            Report reason
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="fraud">Fraud</option>
              <option value="safety">Safety</option>
              <option value="privacy">Privacy</option>
              <option value="staleness">Staleness</option>
            </select>
          </label>
          <div>
            <button type="submit" className="comment-primary" disabled={busy}>Submit Content Report</button>
            <button type="button" className="comment-secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {status && <p className="report-status" role="status">{status}</p>}
      {error && <p className="comment-error" role="alert">{error}</p>}
    </div>
  );
}
