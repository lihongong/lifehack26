import { Clock3, MapPin } from "lucide-react";

const time = (value) => new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));

export default function BuffetCard({ post }) {
  const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(post.sourceTime)) / 60_000));
  return (
    <article className={`buffet-card${post.zone ? "" : " location-unclear"}`}>
      <div className="buffet-card-heading">
        <span className="fictional-note">Fictional Buffet Post</span>
        <span>{minutesAgo}m ago</span>
      </div>
      <h3>{post.title}</h3>
      <p>{post.description}</p>
      <div className="buffet-location">
        <MapPin aria-hidden="true" size={17} />
        <div><strong>{post.zone?.name || "Location unclear"}</strong><span>Reported as {post.reportedLocation}</span></div>
      </div>
      <div className="buffet-expiry">
        <Clock3 aria-hidden="true" size={16} />
        <div><strong>{post.expiryBasis === "stated" ? "Collect by" : "Estimated expiry"} {time(post.expiresAt)}</strong><span>{post.expiryBasis === "fallback" ? "Two-hour fallback because no deadline was stated" : "Deadline stated in the source post"}</span></div>
      </div>
      <small>Source: {post.source} · <time dateTime={post.sourceTime}>{time(post.sourceTime)}</time></small>
    </article>
  );
}
