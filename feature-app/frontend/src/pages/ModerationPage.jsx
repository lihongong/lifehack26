import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  getContentReports,
  getModerationComments,
  getModerationListings,
  getSourceAuthorConsents,
  getSourceDiscrepancies,
  moderateComment,
  moderateListing,
  recordSourceAuthorConsent,
  resolveContentReport,
  resolveSourceDiscrepancy,
  withdrawSourceAuthorConsent,
} from "../api/privilegeApi.js";

const feedId = "telegram-marketplace-demo";
const emptyConsent = { externalAuthorId: "", displayName: "", contactUrl: "", evidenceReference: "", reason: "", displayNameAllowed: true, contactAllowed: false };

export default function ModerationPage() {
  const { participant, loading } = useAuth();
  const [listings, setListings] = useState([]);
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [consents, setConsents] = useState([]);
  const [consentForm, setConsentForm] = useState(emptyConsent);
  const [withdrawalReasons, setWithdrawalReasons] = useState({});
  const [resolutionReasons, setResolutionReasons] = useState({});
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const refresh = async () => {
    const [listingData, reportData, commentData, discrepancyData, consentData] = await Promise.all([
      getModerationListings(),
      getContentReports(),
      getModerationComments(),
      getSourceDiscrepancies(),
      getSourceAuthorConsents(feedId),
    ]);
    setListings(listingData.listings);
    setReports(reportData.reports);
    setComments(commentData.comments);
    setDiscrepancies(discrepancyData.discrepancies);
    setConsents(consentData.consents);
  };
  useEffect(() => {
    if (participant?.role === "moderator") refresh().catch((caught) => setError(caught.message));
  }, [participant]);
  if (loading) return <main className="app-shell"><p className="status-message">Loading moderation…</p></main>;
  if (participant?.role !== "moderator") return <Navigate to="/" replace />;

  return (
    <main className="app-shell">
      <AppHeader />
      <section className="privileged-page">
        <p className="eyebrow">MODERATOR</p>
        <h1>Content and Source Feed moderation</h1>
        <p>Review Content Reports and Source Discrepancies, manage author consent, and directly moderate public Comments and Marketplace Listings. Every sensitive decision is recorded.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {status && <p className="action-status" role="status">{status}</p>}
        <section aria-labelledby="content-reports-title">
          <h2 id="content-reports-title">Content Reports</h2>
          {reports.length ? (
            <ul className="report-list">{reports.map((report) => (
              <li key={report.id}>
                <div className="report-heading">
                  <strong>{report.evidence.label}</strong>
                  <span>{formatCategory(report.category)}</span>
                </div>
                <p>{report.evidence.text}</p>
                <small>Reported by {report.reporter.displayName}</small>
                <label>Resolution reason<input required minLength="3" maxLength="500" value={reasons[report.id] || ""} onChange={(event) => setReasons({ ...reasons, [report.id]: event.target.value })} /></label>
                <div className="report-actions">
                  <button className="danger-action" type="button" onClick={() => resolve(report, "hidden")}>Hide content</button>
                  <button className="secondary-action" type="button" onClick={() => resolve(report, "dismissed")}>Dismiss report</button>
                </div>
              </li>
            ))}</ul>
          ) : <p>No open Content Reports.</p>}
        </section>
        <h2>Direct Comment moderation</h2>
        {comments.length ? (
          <ul className="moderation-list comment-moderation-list">{comments.map((comment) => (
            <li key={comment.id} className={comment.hidden ? "is-hidden" : ""}>
              <div>
                <span className="category">{comment.listingTitle}</span>
                <strong>{comment.authorDisplayName}</strong>
                <span>{comment.hidden ? "Hidden" : comment.body}</span>
              </div>
              {!comment.hidden && (
                <>
                  <label>Moderation reason<input required minLength="3" maxLength="500" value={reasons[`comment-${comment.id}`] || ""} onChange={(event) => setReasons({ ...reasons, [`comment-${comment.id}`]: event.target.value })} /></label>
                  <button className="danger-action" type="button" onClick={async () => {
                    setError(""); setStatus("");
                    try {
                      await moderateComment(comment.id, reasons[`comment-${comment.id}`]);
                      setStatus("Comment hidden.");
                      setReasons({ ...reasons, [`comment-${comment.id}`]: "" });
                      await refresh();
                    } catch (caught) { setError(caught.message); }
                  }}>Hide Comment</button>
                </>
              )}
            </li>
          ))}</ul>
        ) : <p>No Comments to moderate.</p>}
        <h2>Direct Marketplace moderation</h2>
        <ul className="moderation-list">{listings.map((listing) => (
          <li key={listing.id} className={listing.hidden ? "is-hidden" : ""}>
            <div><span className="category">{listing.category}</span><strong>{listing.title}</strong><span>{listing.hidden ? "Hidden" : "Publicly visible"}</span></div>
            {listing.moderationReason && <p>Last reason: {listing.moderationReason}</p>}
            <label>Reason<input required minLength="3" maxLength="500" value={reasons[listing.id] || ""} onChange={(event) => setReasons({ ...reasons, [listing.id]: event.target.value })} /></label>
            <button type="button" className={listing.hidden ? "primary-action" : "danger-action"} onClick={async () => {
              setError(""); setStatus("");
              try {
                await moderateListing(listing.id, !listing.hidden, reasons[listing.id]);
                setStatus(`${listing.title} ${listing.hidden ? "restored" : "hidden"}.`);
                setReasons({ ...reasons, [listing.id]: "" });
                await refresh();
              } catch (caught) { setError(caught.message); }
            }}>{listing.hidden ? "Restore listing" : "Hide listing"}</button>
          </li>
        ))}</ul>

        <form className="privileged-form" onSubmit={async (event) => {
          event.preventDefault(); setError(""); setStatus("");
          try {
            const scopes = [consentForm.displayNameAllowed && "display_name", consentForm.contactAllowed && "contact"].filter(Boolean);
            await recordSourceAuthorConsent(feedId, { ...consentForm, scopes });
            setConsentForm(emptyConsent);
            setStatus("Source author consent recorded.");
            await refresh();
          } catch (caught) { setError(caught.message); }
        }}>
          <h2>Record source author consent</h2>
          <label>Private source author id<input required value={consentForm.externalAuthorId} onChange={(event) => setConsentForm({ ...consentForm, externalAuthorId: event.target.value })} /></label>
          <label className="gate-toggle"><input type="checkbox" checked={consentForm.displayNameAllowed} onChange={(event) => setConsentForm({ ...consentForm, displayNameAllowed: event.target.checked })} />Allow public display name</label>
          <label>Consented display name<input disabled={!consentForm.displayNameAllowed} value={consentForm.displayName} onChange={(event) => setConsentForm({ ...consentForm, displayName: event.target.value })} /></label>
          <label className="gate-toggle"><input type="checkbox" checked={consentForm.contactAllowed} onChange={(event) => setConsentForm({ ...consentForm, contactAllowed: event.target.checked })} />Allow public contact link</label>
          <label>Consented HTTPS contact URL<input type="url" disabled={!consentForm.contactAllowed} value={consentForm.contactUrl} onChange={(event) => setConsentForm({ ...consentForm, contactUrl: event.target.value })} /></label>
          <label>Private evidence reference<input required value={consentForm.evidenceReference} onChange={(event) => setConsentForm({ ...consentForm, evidenceReference: event.target.value })} /></label>
          <label>Consent reason<input required minLength="3" maxLength="500" value={consentForm.reason} onChange={(event) => setConsentForm({ ...consentForm, reason: event.target.value })} /></label>
          <button className="primary-action">Record consent</button>
        </form>

        <section aria-labelledby="consents-title">
          <h2 id="consents-title">Recorded author consent</h2>
          {consents.length ? <ul className="management-list">{consents.map((consent) => (
            <li key={consent.id}>
              <div><strong>{consent.displayName || "Identity not consented"}</strong><span>{consent.active ? "Active" : "Withdrawn"} · Evidence: {consent.evidenceReference || "scrubbed"}</span></div>
              {consent.contactUrl && <span>{consent.contactUrl}</span>}
              {consent.active && <>
                <label>Withdrawal reason<input required minLength="3" maxLength="500" value={withdrawalReasons[consent.id] || ""} onChange={(event) => setWithdrawalReasons({ ...withdrawalReasons, [consent.id]: event.target.value })} /></label>
                <button type="button" className="danger-action" onClick={async () => {
                  setError(""); setStatus("");
                  try {
                    await withdrawSourceAuthorConsent(feedId, consent.id, withdrawalReasons[consent.id]);
                    setStatus("Consent withdrawn and imported identity, contact, and content removed.");
                    await refresh();
                  } catch (caught) { setError(caught.message); }
                }}>Withdraw consent and remove content</button>
              </>}
            </li>
          ))}</ul> : <p>No author consent has been recorded.</p>}
        </section>

        <section aria-labelledby="discrepancies-title">
          <h2 id="discrepancies-title">Source Discrepancies</h2>
          {discrepancies.length ? <ul className="moderation-list">{discrepancies.map((discrepancy) => (
            <li key={discrepancy.id}>
              <div><strong>{discrepancy.listingId || "Removed source post"}</strong><span>{label(discrepancy.type)} · {discrepancy.feedName}</span></div>
              <div className="source-snapshot"><strong>Current</strong><br />{snapshot(discrepancy.current)}</div>
              <div className="source-snapshot"><strong>Incoming</strong><br />{discrepancy.redacted ? "Content redacted after consent withdrawal." : snapshot(discrepancy.incoming?.listing)}</div>
              <label>Resolution reason<input required minLength="3" maxLength="500" value={resolutionReasons[discrepancy.id] || ""} onChange={(event) => setResolutionReasons({ ...resolutionReasons, [discrepancy.id]: event.target.value })} /></label>
              <div className="decision-row">
                <button type="button" className="primary-action" disabled={discrepancy.redacted} onClick={() => decide(discrepancy.id, "apply_source")}>Apply source</button>
                <button type="button" className="secondary-action" onClick={() => decide(discrepancy.id, "retain_current")}>Retain current</button>
              </div>
            </li>
          ))}</ul> : <p>No open Source Discrepancies.</p>}
        </section>
      </section>
    </main>
  );

  async function resolve(report, outcome) {
    setError("");
    setStatus("");
    try {
      const { resolution } = await resolveContentReport(report.id, outcome, reasons[report.id]);
      setStatus(resolution.outcome === "hidden" ? "Content hidden and report resolved." : resolution.outcome === "already_unavailable" ? "Report resolved. Content was already unavailable." : "Report dismissed.");
      setReasons({ ...reasons, [report.id]: "" });
      await refresh();
    } catch (caught) {
      setError(caught.message);
    }
  }

  async function decide(id, decision) {
    setError(""); setStatus("");
    try {
      await resolveSourceDiscrepancy(id, decision, resolutionReasons[id]);
      setStatus(`Source Discrepancy ${decision === "apply_source" ? "applied" : "retained"}.`);
      await refresh();
    } catch (caught) { setError(caught.message); }
  }
}

function formatCategory(category) {
  return `${category.slice(0, 1).toUpperCase()}${category.slice(1)}`;
}

const label = (value) => value.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const snapshot = (listing) => listing ? `${listing.title} · ${listing.category} · $${listing.price} · ${listing.description}` : "No current public content.";
