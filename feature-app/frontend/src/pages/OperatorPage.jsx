import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { enrollModerator, getAuditLog, getModerators, getSourceFeeds, removeModerator, updateSourceFeedGates } from "../api/privilegeApi.js";

export default function OperatorPage() {
  const { participant, loading } = useAuth();
  const [moderators, setModerators] = useState([]);
  const [audit, setAudit] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [gateDrafts, setGateDrafts] = useState({});
  const [form, setForm] = useState({ email: "", reason: "" });
  const [removalReasons, setRemovalReasons] = useState({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    const [moderatorData, auditData, feedData] = await Promise.all([getModerators(), getAuditLog(), getSourceFeeds()]);
    setModerators(moderatorData.moderators);
    setAudit(auditData.entries);
    setFeeds(feedData.feeds);
    setGateDrafts(Object.fromEntries(feedData.feeds.map((feed) => [feed.id, {
      permissionApproved: feed.permission.approved,
      permissionEvidenceReference: feed.permission.evidenceReference || "",
      privacyApproved: feed.privacyReview.approved,
      privacyEvidenceReference: feed.privacyReview.evidenceReference || "",
      liveEnabled: feed.liveEnabled,
      reason: "",
    }])));
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

        <section aria-labelledby="source-feeds-title">
          <h2 id="source-feeds-title">Source Feed gates</h2>
          <p>Live ingestion stays off until written permission, privacy review, and the explicit live gate are all enabled.</p>
          <ul className="management-list">{feeds.map((feed) => {
            const draft = gateDrafts[feed.id];
            if (!draft) return null;
            const updateDraft = (change) => setGateDrafts((current) => ({ ...current, [feed.id]: { ...current[feed.id], ...change } }));
            return <li key={feed.id}>
              <div><strong>{feed.name}</strong><span>{feed.provider} · {feed.contentType} · Live {feed.liveEnabled ? "enabled" : "disabled"}</span></div>
              <label className="gate-toggle"><input type="checkbox" checked={draft.permissionApproved} onChange={(event) => updateDraft({ permissionApproved: event.target.checked, liveEnabled: event.target.checked ? draft.liveEnabled : false })} />Written permission approved</label>
              <label>Permission evidence reference<input disabled={!draft.permissionApproved} value={draft.permissionEvidenceReference} onChange={(event) => updateDraft({ permissionEvidenceReference: event.target.value })} /></label>
              <label className="gate-toggle"><input type="checkbox" checked={draft.privacyApproved} onChange={(event) => updateDraft({ privacyApproved: event.target.checked, liveEnabled: event.target.checked ? draft.liveEnabled : false })} />Privacy review approved</label>
              <label>Privacy review reference<input disabled={!draft.privacyApproved} value={draft.privacyEvidenceReference} onChange={(event) => updateDraft({ privacyEvidenceReference: event.target.value })} /></label>
              <label className="gate-toggle"><input type="checkbox" checked={draft.liveEnabled} onChange={(event) => updateDraft({ liveEnabled: event.target.checked })} />Live ingestion explicitly enabled</label>
              <label>Gate change reason<input required minLength="3" maxLength="500" value={draft.reason} onChange={(event) => updateDraft({ reason: event.target.value })} /></label>
              <button className="primary-action" onClick={async () => {
                setError(""); setStatus("");
                try {
                  await updateSourceFeedGates(feed.id, draft);
                  setStatus(`${feed.name} gates updated.`);
                  await refresh();
                } catch (caught) { setError(caught.message); }
              }}>Save Source Feed gates</button>
            </li>;
          })}</ul>
        </section>

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
