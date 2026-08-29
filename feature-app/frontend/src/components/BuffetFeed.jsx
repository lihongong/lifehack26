import { useEffect, useMemo, useState } from "react";
import BuffetCard from "./BuffetCard.jsx";
import BuffetFilters from "./BuffetFilters.jsx";
import BuffetAlertSettings from "./BuffetAlertSettings.jsx";
import { useBuffets } from "../hooks/useBuffets.js";
import { getBuffetAlerts, recordBuffetAlertFeedback, recordBuffetGoing } from "../api/buffetApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import GemRewardToast from "./GemRewardToast.jsx";

export default function BuffetFeed() {
  const [filters, setFilters] = useState({ query: "", zone: "all", freshness: "active" });
  const stableFilters = useMemo(() => filters, [filters]);
  const { participant, refresh: refreshAuth } = useAuth();
  const { posts, zones, loading, error, refresh: refreshBuffets } = useBuffets(stableFilters);
  const [alertData, setAlertData] = useState(null);
  const [alertError, setAlertError] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [goingPending, setGoingPending] = useState("");
  const [reward, setReward] = useState(null);
  useEffect(() => {
    if (!participant) { setAlertData(null); return; }
    getBuffetAlerts().then(setAlertData).catch((caught) => caught.status !== 401 && setAlertError(caught.message));
  }, [participant]);
  const alertsByPost = new Map((alertData?.alerts || []).map((alert) => [alert.postId, alert]));
  return (
    <section className="marketplace buffet-feed" aria-labelledby="buffet-title">
      <div className="section-heading">
        <div><p className="eyebrow">AVAILABLE NOW</p><h2 id="buffet-title">Fresh Buffet Posts</h2></div>
        <span aria-live="polite">{loading ? "Loading…" : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}</span>
      </div>
      <p className="feed-note">Fictional demonstration posts expire automatically at their collection deadline.</p>
      {participant && alertData && <BuffetAlertSettings data={alertData} onData={setAlertData} />}
      {participant && !alertData && !alertError && <p className="private-alert-status" role="status">Loading private Buffet Alert settings...</p>}
      {alertError && <p className="form-error private-alert-status" role="alert">{alertError}</p>}
      <GemRewardToast reward={reward} message="Thanks for helping reduce food waste." />
      <BuffetFilters filters={filters} zones={zones} onChange={(change) => setFilters((current) => ({ ...current, ...change }))} />
      {error ? <p className="status-message" role="alert">{error.message}</p>
        : loading ? <p className="status-message" role="status">Loading Buffet Posts…</p>
        : posts.length ? <div className="buffet-grid" aria-live="polite">{posts.map((post) => <BuffetCard post={post} participant={participant} goingPending={goingPending === post.id} onGoing={async (postId) => {
          setGoingPending(postId); setAlertError("");
          try { const result = await recordBuffetGoing(postId); setReward(result.reward); await Promise.all([refreshAuth(), refreshBuffets()]); }
          catch (caught) { setAlertError(caught.message); } finally { setGoingPending(""); }
        }} alert={alertsByPost.get(post.id)} feedbackPending={feedbackPending} onFeedback={async (alertId, outcome) => {
          setFeedbackPending(true); setAlertError("");
          try {
            await recordBuffetAlertFeedback(alertId, outcome);
            const updated = await getBuffetAlerts();
            setAlertData(updated);
            refreshBuffets();
          } catch (caught) { setAlertError(caught.message); } finally { setFeedbackPending(false); }
        }} key={post.id} />)}</div>
        : <p className="status-message">No active Buffet Posts match these filters.</p>}
    </section>
  );
}
