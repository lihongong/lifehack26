import { Clock3, MapPin } from "lucide-react";
import GemRewardToast, { GemAmount } from "./GemRewardToast.jsx";

const time = (value) => new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));

export default function BuffetCard({ post, alert, onFeedback, feedbackPending, participant, goingPending, onGoing, reward }) {
  const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(post.sourceTime)) / 60_000));
  return (
    <article className={`buffet-card${post.zone ? "" : " location-unclear"}`}>
      <div className="buffet-card-heading">
        <span className="fictional-note">Fictional Buffet Post</span>
        <span>{minutesAgo}m ago</span>
      </div>
      <h3>{post.title}</h3>
      {post.possiblyGone && <strong className="possibly-gone">Possibly gone - a Moderator is checking this Buffet Post.</strong>}
      <p>{post.description}</p>
      <div className="buffet-location">
        <MapPin aria-hidden="true" size={17} />
        <div><strong>{post.zone?.name || "Location unclear"}</strong><span>Reported as {post.reportedLocation}</span></div>
      </div>
      {post.persistentDemo ? <p className="demo-availability">Available throughout this demo</p> : <div className="buffet-expiry">
        <Clock3 aria-hidden="true" size={16} />
        <div><strong>{post.expiryBasis === "stated" ? "Collect by" : "Estimated expiry"} {time(post.expiresAt)}</strong><span>{post.expiryBasis === "fallback" ? "Two-hour fallback because no deadline was stated" : "Deadline stated in the source post"}</span></div>
      </div>}
      <small>Source: {post.source} · <time dateTime={post.sourceTime}>{time(post.sourceTime)}</time></small>
      {participant ? <button className="primary-action buffet-going-action" type="button" disabled={goingPending || post.going} onClick={() => onGoing(post.id)}>{post.going ? "✓ Going" : goingPending ? "Collecting…" : <>I’m going <GemAmount amount={2} /></>}</button>
        : <a className="primary-action buffet-going-action" href="/univus/">Sign in <GemAmount amount={2} /></a>}
      <GemRewardToast reward={reward} message="Thanks for helping reduce food waste." />
      {alert && !alert.outcome && <div className="buffet-alert-actions" aria-label={`Helpful Alert actions for ${post.title}`}>
        <span>{alert.matchType === "selected_zone" ? "Matches your selected NUS Zone" : "Matches a Nearby Zone"}</span>
        <div>
          <button type="button" disabled={feedbackPending} onClick={() => onFeedback(alert.id, "helpful")}>Mark helpful</button>
          <button type="button" disabled={feedbackPending} onClick={() => onFeedback(alert.id, "food_gone")}>Report food gone</button>
        </div>
      </div>}
      {alert?.outcome && <p className="alert-outcome">Helpful Alert recorded: {alert.outcome === "food_gone" ? "food gone" : "helpful"}.</p>}
    </article>
  );
}
