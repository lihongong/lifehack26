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
      <a
        className="profile-button"
        href={participant ? "/profile" : "/univus/"}
        aria-label={participant ? "Open private profile" : "Open through uNivUS"}
      >
        <CircleUserRound aria-hidden="true" size={21} />
      </a>
    </header>
  );
}
