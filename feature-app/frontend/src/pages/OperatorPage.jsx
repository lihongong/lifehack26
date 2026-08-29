import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { enrollModerator, getAuditLog, getModerators, removeModerator } from "../api/privilegeApi.js";

export default function OperatorPage() {
  const { participant, loading } = useAuth();
  const [moderators, setModerators] = useState([]);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState({ email: "", reason: "" });
  const [removalReasons, setRemovalReasons] = useState({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    const [moderatorData, auditData] = await Promise.all([getModerators(), getAuditLog()]);
    setModerators(moderatorData.moderators);
    setAudit(auditData.entries);
  };
  useEffect(() => {
    if (participant?.role === "platform_operator") refresh().catch((caught) => setError(caught.message));
  }, [participant]);
  if (loading) return <main className="app-shell"><p className="status-message">Loading Operator controls…</p></main>;
  if (participant?.role !== "platform_operator") return <Navigate to="/" replace />;

  return (
    <main className="app-shell">
      <AppHeader />
      <section className="privileged-page">
        <p className="eyebrow">PLATFORM OPERATOR</p>
        <h1>Moderator access and audit</h1>
        <p>Enroll existing Participants, revoke privileged sessions, and inspect immutable sensitive-action records.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {status && <p className="action-status" role="status">{status}</p>}

        <form className="privileged-form" onSubmit={async (event) => {
          event.preventDefault(); setError(""); setStatus("");
          try {
            await enrollModerator(form.email, form.reason);
            setForm({ email: "", reason: "" });
            setStatus("Moderator enrolled.");
            await refresh();
          } catch (caught) { setError(caught.message); }
        }}>
          <h2>Enroll Moderator</h2>
          <label>Participant email<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Reason<input required minLength="3" maxLength="500" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
          <button className="primary-action">Enroll Moderator</button>
        </form>

        <section aria-labelledby="moderators-title">
          <h2 id="moderators-title">Current Moderators</h2>
          {moderators.length ? <ul className="management-list">{moderators.map((moderator) => (
            <li key={moderator.id}>
              <div><strong>{moderator.displayName || "Profile not completed"}</strong><span>{moderator.email}</span></div>
              <label>Removal reason<input required minLength="3" value={removalReasons[moderator.id] || ""} onChange={(event) => setRemovalReasons({ ...removalReasons, [moderator.id]: event.target.value })} /></label>
              <button className="danger-action" onClick={async () => {
                setError(""); setStatus("");
                try {
                  await removeModerator(moderator.id, removalReasons[moderator.id]);
                  setStatus("Moderator removed and sessions revoked.");
                  await refresh();
                } catch (caught) { setError(caught.message); }
              }}>Remove Moderator</button>
            </li>
          ))}</ul> : <p>No Moderators enrolled.</p>}
        </section>

        <section className="audit-log" aria-labelledby="audit-title">
          <h2 id="audit-title">Complete audit trail</h2>
          <ul>{audit.map((entry) => (
            <li key={entry.id}>
              <div><strong>{label(entry.eventType)}</strong>{entry.selfDirected && <span className="self-badge">Self-directed</span>}</div>
              <span>{entry.actorDisplayName || entry.actorEmail} · {entry.targetType} {entry.targetId}</span>
              <p>{entry.reason}</p>
              <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</time>
            </li>
          ))}</ul>
        </section>
      </section>
    </main>
  );
}

const label = (value) => value.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
