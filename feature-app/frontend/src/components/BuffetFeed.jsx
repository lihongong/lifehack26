import { useEffect, useMemo, useState } from "react";
import BuffetCard from "./BuffetCard.jsx";
import BuffetFilters from "./BuffetFilters.jsx";
import BuffetAlertSettings from "./BuffetAlertSettings.jsx";
import { FeedHeader } from "./ExchangePrimitives.jsx";
import { useBuffets } from "../hooks/useBuffets.js";
import { getBuffetAlerts, recordBuffetAlertFeedback, recordBuffetGoing } from "../api/buffetApi.js";
import { useAuth } from "../auth/AuthContext.jsx";

export default function BuffetFeed() {
  const [filters, setFilters] = useState({ query: "", zone: "all", freshness: "active" });
  const stableFilters = useMemo(() => filters, [filters]);
  const { participant, refresh: refreshAuth } = useAuth();
  const { posts, zones, loading, error, refresh: refreshBuffets } = useBuffets(stableFilters);
  const [alertData, setAlertData] = useState(null);
  const [alertError, setAlertError] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [goingPending, setGoingPending] = useState("");
  const [rewardNotice, setRewardNotice] = useState(null);
  useEffect(() => {
    if (!participant) { setAlertData(null); return; }
    getBuffetAlerts().then(setAlertData).catch((caught) => caught.status !== 401 && setAlertError(caught.message));
  }, [participant]);
  const alertsByPost = new Map((alertData?.alerts || []).map((alert) => [alert.postId, alert]));
  return (
    <section className="exchange-feed buffet-feed" aria-labelledby="buffet-title">
      <FeedHeader
        eyebrow="AVAILABLE NOW"
        title="Fresh buffet posts"
        id="buffet-title"
        countLabel={loading ? "Loading…" : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}
        description="Fictional demonstration posts expire automatically at their collection deadline."
      />
      {participant && alertData && <BuffetAlertSettings data={alertData} onData={setAlertData} />}
      {participant && !alertData && !alertError && <p className="private-alert-status" role="status">Loading private Buffet Alert settings...</p>}
      {alertError && <p className="form-error private-alert-status" role="alert">{alertError}</p>}
      <BuffetFilters filters={filters} zones={zones} onChange={(change) => setFilters((current) => ({ ...current, ...change }))} />
      {error ? <p className="feed-state is-error" role="alert">{error.message}</p>
        : loading ? <p className="feed-state" role="status">Loading Buffet Posts…</p>
        : posts.length ? <div className="buffet-grid" aria-live="polite">{posts.map((post) => <BuffetCard post={post} participant={participant} reward={rewardNotice?.postId === post.id ? rewardNotice.reward : null} goingPending={goingPending === post.id} onGoing={async (postId) => {
          setGoingPending(postId); setAlertError("");
          try { const result = await recordBuffetGoing(postId); setRewardNotice({ postId, reward: result.reward }); await Promise.all([refreshAuth(), refreshBuffets()]); }
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
        : <p className="feed-state" aria-live="polite">No active Buffet Posts match these filters.</p>}
    </section>
  );
}
