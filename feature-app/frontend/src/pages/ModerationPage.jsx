import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { getModerationListings, moderateListing } from "../api/privilegeApi.js";

export default function ModerationPage() {
  const { participant, loading } = useAuth();
  const [listings, setListings] = useState([]);
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const refresh = () => getModerationListings().then((data) => setListings(data.listings));
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
        <h1>Marketplace moderation</h1>
        <p>Hide or restore a Marketplace Listing with a reason. Every action is immutable in the Operator audit trail.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {status && <p className="action-status" role="status">{status}</p>}
        <ul className="moderation-list">{listings.map((listing) => (
          <li key={listing.id} className={listing.hidden ? "is-hidden" : ""}>
            <div><span className="category">{listing.category}</span><strong>{listing.title}</strong><span>{listing.hidden ? "Hidden" : "Publicly visible"}</span></div>
            {listing.moderationReason && <p>Last reason: {listing.moderationReason}</p>}
            <label>Reason<input required minLength="3" maxLength="500" value={reasons[listing.id] || ""} onChange={(event) => setReasons({ ...reasons, [listing.id]: event.target.value })} /></label>
            <button className={listing.hidden ? "primary-action" : "danger-action"} onClick={async () => {
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
      </section>
    </main>
  );
}
