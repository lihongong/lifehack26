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
        <a
          className="profile-button"
          href={participant ? "/profile" : "/univus/"}
          aria-label={participant ? "Open private profile" : "Open through uNivUS"}
        >
          <CircleUserRound aria-hidden="true" size={21} />
        </a>
      </nav>
    </header>
  );
}
