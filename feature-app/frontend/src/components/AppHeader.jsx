import { CircleUserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function AppHeader() {
  const { participant } = useAuth();
  return (
    <header className="app-header">
      <Link className="brand" to="/" aria-label="NUS Exchange home">
        <span>u</span>Niv<span>U</span>S
      </Link>
      <nav className="header-actions" aria-label="Account and privileged tools">
        {participant?.role === "platform_operator" && <Link className="privileged-link" to="/operator">Operator</Link>}
        {participant?.role === "moderator" && <Link className="privileged-link" to="/moderation/marketplace">Moderate</Link>}
        {participant ? (
          <Link className="profile-button" to="/profile" aria-label="Profile">
            <CircleUserRound aria-hidden="true" size={21} />
            <span className={`profile-button-copy${participant.displayName ? "" : " is-incomplete"}`} aria-hidden="true">
              <small>Profile</small>
              <strong>{participant.displayName || "Complete profile"}</strong>
            </span>
          </Link>
        ) : (
          <a className="profile-button profile-button-icon" href="/univus/" aria-label="Open through uNivUS">
            <CircleUserRound aria-hidden="true" size={21} />
          </a>
        )}
      </nav>
    </header>
  );
}
