import { Navigate, useNavigate } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import ProfileForm from "../components/ProfileForm.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { updateProfile } from "../api/participantApi.js";

export default function ProfileSetupPage() {
  const { participant, loading, refresh } = useAuth();
  const navigate = useNavigate();
  if (loading)
    return (
      <main className="app-shell">
        <p className="status-message">Loading profile…</p>
      </main>
    );
  if (!participant) return <Navigate to="/" replace />;
  if (participant.displayName) return <Navigate to="/profile" replace />;
  return (
    <main className="app-shell">
      <AppHeader />
      <section className="profile-page">
        <p className="eyebrow">WELCOME, PARTICIPANT</p>
        <h1>Choose your public name</h1>
        <p>Your email, NUS Zone, Gems, and activity stay private.</p>
        <ProfileForm
          participant={participant}
          submitLabel="Complete profile"
          onSubmit={async (profile) => {
            await updateProfile(profile);
            await refresh();
            navigate("/profile");
          }}
        />
      </section>
    </main>
  );
}
