import { useMemo, useState } from "react";
import BuffetCard from "./BuffetCard.jsx";
import BuffetFilters from "./BuffetFilters.jsx";
import { useBuffets } from "../hooks/useBuffets.js";

export default function BuffetFeed() {
  const [filters, setFilters] = useState({ query: "", zone: "all", freshness: "active" });
  const stableFilters = useMemo(() => filters, [filters]);
  const { posts, zones, loading, error } = useBuffets(stableFilters);
  return (
    <section className="marketplace buffet-feed" aria-labelledby="buffet-title">
      <div className="section-heading">
        <div><p className="eyebrow">AVAILABLE NOW</p><h2 id="buffet-title">Fresh Buffet Posts</h2></div>
        <span aria-live="polite">{loading ? "Loading…" : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}</span>
      </div>
      <p className="feed-note">Fictional demonstration posts expire automatically at their collection deadline.</p>
      <BuffetFilters filters={filters} zones={zones} onChange={(change) => setFilters((current) => ({ ...current, ...change }))} />
      {error ? <p className="status-message" role="alert">{error.message}</p>
        : loading ? <p className="status-message" role="status">Loading Buffet Posts…</p>
        : posts.length ? <div className="buffet-grid" aria-live="polite">{posts.map((post) => <BuffetCard post={post} key={post.id} />)}</div>
        : <p className="status-message">No active Buffet Posts match these filters.</p>}
    </section>
  );
}
