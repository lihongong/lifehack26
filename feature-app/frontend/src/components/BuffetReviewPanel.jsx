import { useCallback, useEffect, useState } from "react";
import { getBuffetFoodGoneReviews, resolveBuffetFoodGoneReview } from "../api/privilegeApi.js";
import BuffetPostManagement from "./BuffetPostManagement.jsx";

export default function BuffetReviewPanel() {
  const [reviews, setReviews] = useState([]);
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const refresh = useCallback(() => {
    setLoading(true);
    return getBuffetFoodGoneReviews()
      .then(({ reviews: next }) => setReviews(next))
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const resolve = async (review, outcome) => {
    setPending(review.id); setError(""); setStatus("");
    try {
      const { resolution } = await resolveBuffetFoodGoneReview(review.id, outcome, reasons[review.id]);
      setStatus(resolution.outcome === "restored" ? "Buffet Post restored." : "Buffet Post confirmed expired.");
      await refresh();
    } catch (caught) { setError(caught.message); } finally { setPending(null); }
  };

  return (
    <>
      <BuffetPostManagement />
      <section className="buffet-review-panel" aria-labelledby="buffet-reviews-title">
        <h2 id="buffet-reviews-title">Buffet food-gone reviews</h2>
        <p>Review Helpful Alert signals against the report-time Buffet Post snapshot.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {status && <p className="action-status" role="status">{status}</p>}
        {loading ? <p role="status">Loading Buffet reviews...</p> : reviews.length ? <ul className="buffet-review-list">{reviews.map((review) => (
          <li key={review.id}>
            <div className="report-heading"><strong>{review.title}</strong><span>{review.signalCount} food-gone {review.signalCount === 1 ? "signal" : "signals"}</span></div>
            <p>{review.description}</p>
            <small>{review.reportedLocation} · Review cycle {review.cycle}</small>
            <label>Buffet review reason for {review.title}<input required minLength="3" maxLength="500" value={reasons[review.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} /></label>
            <div className="report-actions">
              <button className="primary-action" type="button" disabled={pending === review.id} onClick={() => resolve(review, "restored")}>Restore Buffet Post</button>
              <button className="danger-action" type="button" disabled={pending === review.id} onClick={() => resolve(review, "expired")}>Confirm expired</button>
            </div>
          </li>
        ))}</ul> : <p>No open Buffet food-gone reviews.</p>}
      </section>
    </>
  );
}
