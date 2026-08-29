import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import ProfileForm from "../components/ProfileForm.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { getGems, logout, updateProfile } from "../api/participantApi.js";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const { participant, loading, refresh } = useAuth();
  const [ledger, setLedger] = useState([]);
  useEffect(() => {
    if (participant) getGems().then((data) => setLedger(data.entries));
  }, [participant]);
  if (loading)
    return (
      <main className="app-shell">
        <p className="status-message">Loading profile…</p>
      </main>
    );
  if (!participant) return <Navigate to="/" replace />;
  if (!participant.displayName) return <Navigate to="/profile/setup" replace />;
  return (
    <main className="app-shell">
      <AppHeader />
      <section className="profile-page">
        <div className="profile-title">
          <div className="avatar" aria-hidden="true">
            {participant.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="eyebrow">PRIVATE PROFILE</p>
            <h1>{participant.displayName}</h1>
            <span className="verified">✓ NUS verified</span>
          </div>
        </div>
        <div className="gem-card">
          <span>Gem balance</span>
          <strong>{participant.gemBalance} Gems</strong>
          <small>Earned from your immutable Gem Ledger</small>
        </div>
        <dl className="private-details">
          <div>
            <dt>Email</dt>
            <dd>{participant.email}</dd>
          </div>
          <div>
            <dt>NUS Zone</dt>
            <dd>{participant.nusZone || "Not selected"}</dd>
          </div>
        </dl>
        <h2>Edit profile</h2>
        <ProfileForm
          participant={participant}
          submitLabel="Save changes"
          onSubmit={async (profile) => {
            await updateProfile(profile);
            await refresh();
          }}
        />
        <h2>Gem Ledger</h2>
        <ul className="ledger">
          {ledger.map((entry) => (
            <li key={entry.id}>
              <span>Daily login award · {entry.singaporeDate}</span>
              <strong>+{entry.amount}</strong>
            </li>
          ))}
        </ul>
        <a className="public-profile-link" href={`/participants/${participant.publicId}`}>
          View public profile
        </a>
        <button
          className="secondary-action"
          onClick={async () => {
            await logout();
            window.location.href = "/";
          }}
        >
          Log out
        </button>
      </section>
    </main>
  );
}
