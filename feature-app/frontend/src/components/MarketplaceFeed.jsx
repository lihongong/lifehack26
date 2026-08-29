import { useMemo, useState } from "react";
import ListingCard from "./ListingCard.jsx";
import ListingFilters from "./ListingFilters.jsx";
import { useListings } from "../hooks/useListings.js";

export default function MarketplaceFeed() {
  const [filters, setFilters] = useState({ query: "", category: "All", sort: "fresh" });
  const stableFilters = useMemo(() => filters, [filters]);
  const { listings, loading, error } = useListings(stableFilters);
  return (
    <section className="marketplace" aria-labelledby="marketplace-title">
      <div className="section-heading">
        <div><p className="eyebrow">BROWSE PUBLICLY</p><h2 id="marketplace-title">Marketplace listings</h2></div>
        <span aria-live="polite">{loading ? "Loading…" : `${listings.length} ${listings.length === 1 ? "listing" : "listings"}`}</span>
      </div>
      <ListingFilters filters={filters} onChange={(change) => setFilters((current) => ({ ...current, ...change }))} />
      {error ? <p className="status-message" role="alert">{error.message}</p>
        : loading ? <p className="status-message" role="status">Loading listings…</p>
        : listings.length ? <div className="listing-grid" aria-live="polite">{listings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>
        : <p className="status-message">No listings found. Try another search.</p>}
    </section>
  );
}
