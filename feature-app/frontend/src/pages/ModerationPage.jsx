import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import FoundItemModeration from "../components/FoundItemModeration.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  getContentReports,
  getModerationComments,
  getModerationListings,
  getModerationLostItemPosts,
  getSourceAuthorConsents,
  getSourceDiscrepancies,
  moderateComment,
  moderateListing,
  recordSourceAuthorConsent,
  reviewLostItemPost,
  resolveContentReport,
  resolveSourceDiscrepancy,
  withdrawSourceAuthorConsent,
} from "../api/privilegeApi.js";

const feedId = "telegram-marketplace-demo";
const categories = ["Study", "Room & Living", "Transport", "Electronics"];
const emptyConsent = { externalAuthorId: "", displayName: "", contactUrl: "", evidenceReference: "", reason: "", displayNameAllowed: true, contactAllowed: false };

export default function ModerationPage() {
  const { participant, loading } = useAuth();
  const [listings, setListings] = useState([]);
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState([]);
  const [lostItemPosts, setLostItemPosts] = useState([]);
  const [lostItemReviews, setLostItemReviews] = useState({});
  const [discrepancies, setDiscrepancies] = useState([]);
  const [consents, setConsents] = useState([]);
  const [consentForm, setConsentForm] = useState(emptyConsent);
  const [withdrawalReasons, setWithdrawalReasons] = useState({});
  const [resolutionReasons, setResolutionReasons] = useState({});
  const [corrections, setCorrections] = useState({});
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const refresh = async () => {
    const [listingData, reportData, commentData, discrepancyData, consentData, lostItemData] = await Promise.all([
      getModerationListings(),
      getContentReports(),
      getModerationComments(),
      getSourceDiscrepancies(),
      getSourceAuthorConsents(feedId),
      getModerationLostItemPosts(),
    ]);
    setListings(listingData.listings);
    setReports(reportData.reports);
    setComments(commentData.comments);
    setDiscrepancies(discrepancyData.discrepancies);
    setConsents(consentData.consents);
    setLostItemPosts(lostItemData.posts);
    setLostItemReviews((current) => {
      const next = { ...current };
      for (const post of lostItemData.posts) next[post.id] ||= { publicDescription: "", approvedPhotoIds: post.photos.map(({ id }) => id), reason: "" };
      return next;
    });
    setCorrections((current) => {
      const next = { ...current };
      for (const discrepancy of discrepancyData.discrepancies) {
        if (discrepancy.type !== "unparseable_marketplace_message" || next[discrepancy.id]) continue;
        const candidate = discrepancy.incoming?.candidate || {};
        next[discrepancy.id] = {
          title: candidate.title || "",
          category: candidate.category || "",
          price: candidate.price ?? "",
          description: candidate.description || "",
        };
      }
      return next;
    });
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
        <FoundItemModeration />
        <section aria-labelledby="lost-item-review-title">
          <h2 id="lost-item-review-title">Lost-Item Post review</h2>
          {lostItemPosts.length ? <ul className="moderation-list lost-item-review-list">{lostItemPosts.map((post) => {
            const review = lostItemReviews[post.id] || { publicDescription: "", approvedPhotoIds: [], reason: "" };
            const updateReview = (changes) => setLostItemReviews((current) => ({ ...current, [post.id]: { ...review, ...changes } }));
            const submitReview = async (decision) => {
              setError(""); setStatus("");
              try {
                await reviewLostItemPost(post.id, { revision: post.revision, decision, publicDescription: review.publicDescription, approvedPhotoIds: review.approvedPhotoIds, reason: review.reason });
                setStatus(decision === "publish" ? "Sanitized Lost-Item Post published." : "Lost-Item Post rejected for Participant revision.");
                await refresh();
              } catch (caught) { setError(caught.message); }
            };
            return <li key={post.id}>
              <div className="review-heading"><strong>{post.category} · {post.lostDate}</strong><span>{post.nusZone.name} · Revision {post.revision}</span></div>
              <section className="private-review-panel" aria-label="Private Participant submission"><strong>Original description — private</strong><p>{post.description}</p><strong>Private Identifying Details — never publish</strong><p>{post.privateIdentifyingDetails}</p></section>
              {post.photos.length ? <fieldset className="moderator-photo-grid"><legend>Approve a safe subset</legend>{post.photos.map((photo) => <label key={photo.id}><input type="checkbox" checked={review.approvedPhotoIds.includes(photo.id)} onChange={(event) => updateReview({ approvedPhotoIds: event.target.checked ? [...review.approvedPhotoIds, photo.id] : review.approvedPhotoIds.filter((id) => id !== photo.id) })} /><img src={photo.url} alt="Sanitized private Lost-Item photo awaiting visual review" /></label>)}</fieldset> : <p>No submitted photos. Publication without photos is allowed.</p>}
              <label>Sanitized public description<textarea required minLength="10" maxLength="1200" rows="4" value={review.publicDescription} onChange={(event) => updateReview({ publicDescription: event.target.value })} /></label>
              <label>Immutable review reason<input required minLength="3" maxLength="500" value={review.reason} onChange={(event) => updateReview({ reason: event.target.value })} /></label>
              <div className="decision-row"><button className="primary-action" type="button" onClick={() => submitReview("publish")}>Publish sanitized post</button><button className="danger-action" type="button" onClick={() => submitReview("reject")}>Reject submission</button></div>
            </li>;
          })}</ul> : <p>No Lost-Item Posts pending review.</p>}
        </section>
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
              <div className="source-snapshot"><strong>Incoming</strong><br />{discrepancy.redacted ? "Content redacted after consent withdrawal." : snapshot(discrepancy.incoming?.listing || discrepancy.incoming?.candidate)}</div>
              {discrepancy.incoming?.parseIssues?.length > 0 && <p>Parser issues: {discrepancy.incoming.parseIssues.map(label).join(", ")}</p>}
              {discrepancy.type === "unparseable_marketplace_message" && !discrepancy.redacted && <div className="correction-fields" aria-label="Correct and publish fields">
                <label>Corrected title<input required maxLength="160" value={corrections[discrepancy.id]?.title || ""} onChange={(event) => updateCorrection(discrepancy.id, "title", event.target.value)} /></label>
                <label>Corrected category<select required value={corrections[discrepancy.id]?.category || ""} onChange={(event) => updateCorrection(discrepancy.id, "category", event.target.value)}><option value="">Select category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Corrected whole SGD price<input required type="number" min="0" step="1" value={corrections[discrepancy.id]?.price ?? ""} onChange={(event) => updateCorrection(discrepancy.id, "price", event.target.value)} /></label>
                <label>Corrected description<textarea required maxLength="2000" rows="4" value={corrections[discrepancy.id]?.description || ""} onChange={(event) => updateCorrection(discrepancy.id, "description", event.target.value)} /></label>
              </div>}
              <label>Resolution reason<input required minLength="3" maxLength="500" value={resolutionReasons[discrepancy.id] || ""} onChange={(event) => setResolutionReasons({ ...resolutionReasons, [discrepancy.id]: event.target.value })} /></label>
              <div className="decision-row">
                <button type="button" className="primary-action" disabled={discrepancy.redacted} onClick={() => decide(discrepancy, "apply_source")}>{discrepancy.type === "unparseable_marketplace_message" ? "Correct and publish" : "Apply source"}</button>
                <button type="button" className="secondary-action" onClick={() => decide(discrepancy, "retain_current")}>Retain current</button>
              </div>
            </li>
          ))}</ul> : <p>No open Source Discrepancies.</p>}
        </section>
      </section>
    </main>
  );

  function updateCorrection(id, field, value) {
    setCorrections((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

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

  async function decide(discrepancy, decision) {
    setError(""); setStatus("");
    try {
      const correction = decision === "apply_source" && discrepancy.type === "unparseable_marketplace_message"
        ? {
          ...corrections[discrepancy.id],
          price: corrections[discrepancy.id]?.price === "" ? null : Number(corrections[discrepancy.id]?.price),
        }
        : undefined;
      await resolveSourceDiscrepancy(discrepancy.id, decision, resolutionReasons[discrepancy.id], correction);
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
