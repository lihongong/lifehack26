import { useMemo, useState } from "react";
import ListingCard from "./ListingCard.jsx";
import ListingFilters from "./ListingFilters.jsx";
import { FeedHeader } from "./ExchangePrimitives.jsx";
import { useListings } from "../hooks/useListings.js";

export default function MarketplaceFeed() {
  const [filters, setFilters] = useState({ query: "", category: "All", sort: "fresh" });
  const stableFilters = useMemo(() => filters, [filters]);
  const { listings, loading, error } = useListings(stableFilters);
  return (
    <section className="exchange-feed" aria-labelledby="marketplace-title">
      <FeedHeader
        eyebrow="BROWSE PUBLICLY"
        title="Marketplace listings"
        id="marketplace-title"
        countLabel={loading ? "Loading…" : `${listings.length} ${listings.length === 1 ? "listing" : "listings"}`}
      />
      <ListingFilters filters={filters} onChange={(change) => setFilters((current) => ({ ...current, ...change }))} />
      {error ? <p className="feed-state is-error" role="alert">{error.message}</p>
        : loading ? <p className="feed-state" role="status">Loading listings…</p>
        : listings.length ? <div className="listing-grid" aria-live="polite">{listings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>
        : <p className="feed-state" aria-live="polite">No listings found. Try another search.</p>}
    </section>
  );
}
