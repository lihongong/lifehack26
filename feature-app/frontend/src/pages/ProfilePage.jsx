import { Navigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import ProfileForm from "../components/ProfileForm.jsx";
import ProtectedActionsPanel from "../components/ProtectedActionsPanel.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { getGems, logout, updateProfile } from "../api/participantApi.js";
import { getPolicyAcceptances } from "../api/policyApi.js";
import { getNotifications } from "../api/commentApi.js";
import { getBuffetAlerts } from "../api/buffetApi.js";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  const { participant, loading, refresh } = useAuth();
  const [ledger, setLedger] = useState([]);
  const [acceptances, setAcceptances] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [zoneName, setZoneName] = useState("");
  useEffect(() => {
    if (participant) {
      getGems().then((data) => setLedger(data.entries));
      getPolicyAcceptances().then((data) => setAcceptances(data.acceptances));
      getNotifications().then((data) => setNotifications(data.notifications));
      getBuffetAlerts().then(({ settings }) => setZoneName(settings.zones.find(({ id }) => id === participant.nusZone)?.name || ""));
    }
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
            <dd>{zoneName || "Not selected"}</dd>
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
        <ProtectedActionsPanel />
        <section className="notifications" aria-labelledby="notifications-title">
          <h2 id="notifications-title">Notifications</h2>
          {notifications.length ? (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <span>{notification.message}</span>
                  <time dateTime={notification.createdAt}>{formatAcceptanceTime(notification.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : <p>No notifications yet.</p>}
        </section>
        <section className="acceptance-history" aria-labelledby="acceptance-history-title">
          <h2 id="acceptance-history-title">Policy acceptance history</h2>
          {acceptances.length ? (
            <ul>
              {acceptances.map((acceptance) => (
                <li key={acceptance.id}>
                  <span><strong>{acceptance.type === "terms" ? "Terms" : "Privacy"}</strong> · version {acceptance.version}</span>
                  <time dateTime={acceptance.acceptedAt}>{formatAcceptanceTime(acceptance.acceptedAt)}</time>
                </li>
              ))}
            </ul>
          ) : <p>No policy acceptances recorded yet.</p>}
        </section>
        <h2>Gem Ledger</h2>
        <ul className="ledger">
          {ledger.map((entry) => (
            <li key={entry.id}>
              <span>{gemReason(entry.reason)} · {entry.singaporeDate}</span>
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

function gemReason(reason) {
  return ({
    BUFFET_GOING: "Buffet “I’m going” reward",
    MARKETPLACE_CONTACT: "Marketplace contact reward",
    MARKETPLACE_SALE_BUYER: "Marketplace buyer sale reward",
    MARKETPLACE_SALE_SELLER: "Marketplace seller sale reward",
    FOUND_ITEM_REPORT: "Found-Item Report submission reward",
    FOUND_ITEM_HANDOVER: "Verified Found-Item handover reward",
    DAILY_LOGIN: "Daily login award",
  })[reason] || reason.replaceAll("_", " ").toLowerCase();
}

function formatAcceptanceTime(value) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
