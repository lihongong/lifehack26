import { useMemo, useState } from "react";
import AppHeader from "../components/AppHeader.jsx";
import FeatureTabs from "../components/FeatureTabs.jsx";
import ListingCard from "../components/ListingCard.jsx";
import ListingFilters from "../components/ListingFilters.jsx";
import PlaceholderView from "../components/PlaceholderView.jsx";
import { useListings } from "../hooks/useListings.js";
const routes = { "/buffets": "Buffets", "/lost-and-found": "Lost & Found" };
export default function ExchangePage() {
  const active = routes[window.location.pathname] || "Marketplace";
  const [filters, setFilters] = useState({ query: "", category: "All", sort: "fresh" });
  const stableFilters = useMemo(() => filters, [filters]);
  const { listings, loading, error } = useListings(stableFilters);
  return (
    <main className="app-shell">
      <AppHeader />
      <section className="welcome">
        <p className="eyebrow">NUS COMMUNITY EXCHANGE</p>
        <h1>
          Find it. Share it.
          <br />
          <strong>Keep it on campus.</strong>
        </h1>
        <p>A public preview for the NUS community.</p>
      </section>
      <FeatureTabs active={active} />
      {active === "Marketplace" ? (
        <section className="marketplace" aria-labelledby="marketplace-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BROWSE PUBLICLY</p>
              <h2 id="marketplace-title">Marketplace listings</h2>
            </div>
            <span aria-live="polite">
              {loading ? "Loading…" : `${listings.length} ${listings.length === 1 ? "listing" : "listings"}`}
            </span>
          </div>
          <ListingFilters
            filters={filters}
            onChange={(change) => setFilters((current) => ({ ...current, ...change }))}
          />
          {error ? (
            <p className="status-message" role="alert">
              {error.message}
            </p>
          ) : loading ? (
            <p className="status-message" role="status">
              Loading listings…
            </p>
          ) : listings.length ? (
            <div className="listing-grid" aria-live="polite">
              {listings.map((listing) => (
                <ListingCard listing={listing} key={listing.id} />
              ))}
            </div>
          ) : (
            <p className="status-message">No listings found. Try another search.</p>
          )}
        </section>
      ) : (
        <PlaceholderView
          title={active}
          description={
            active === "Buffets"
              ? "A fresh public Buffet feed is coming soon."
              : "A safe public Lost & Found feed is coming soon."
          }
        />
      )}
      <footer>
        <span>All listings are fictional demo data.</span>
        <span>Protected actions require sign in.</span>
      </footer>
    </main>
  );
}
