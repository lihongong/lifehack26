import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { getContentReports, getModerationComments, getModerationListings, moderateComment, moderateListing, resolveContentReport } from "../api/privilegeApi.js";

export default function ModerationPage() {
  const { participant, loading } = useAuth();
  const [listings, setListings] = useState([]);
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const refresh = async () => {
    const [listingData, reportData, commentData] = await Promise.all([
      getModerationListings(),
      getContentReports(),
      getModerationComments(),
    ]);
    setListings(listingData.listings);
    setReports(reportData.reports);
    setComments(commentData.comments);
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
        <h1>Marketplace moderation</h1>
        <p>Hide or restore a Marketplace Listing with a reason. Every action is immutable in the Operator audit trail.</p>
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
            <button className={listing.hidden ? "primary-action" : "danger-action"} onClick={async () => {
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
}

function formatCategory(category) {
  return `${category.slice(0, 1).toUpperCase()}${category.slice(1)}`;
}
