import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BellRing, Gift, MessageSquareText, PackagePlus, SearchCheck } from "lucide-react";
import { performProtectedAction } from "../api/policyApi.js";

const actions = [
  { key: "posting", label: "Posting", icon: PackagePlus },
  { key: "comments", label: "Comments", icon: MessageSquareText },
  { key: "claims", label: "Claims", icon: SearchCheck },
  { key: "alerts", label: "Alerts", icon: BellRing },
  { key: "redemptions", label: "Redemptions", icon: Gift },
];

export default function ProtectedActionsPanel() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pendingAction, setPendingAction] = useState(null);
  const [message, setMessage] = useState("");
  const retried = useRef(false);

  const runAction = async (action) => {
    setPendingAction(action);
    setMessage("");
    try {
      const result = await performProtectedAction(action);
      setMessage(`${labelFor(action)} is ready. ${result.message}`);
    } catch (error) {
      if (error.status === 428) {
        navigate(`/policies?action=${encodeURIComponent(action)}&returnTo=${encodeURIComponent("/profile")}`);
        return;
      }
      setMessage(error.status === 401 ? "Open the app through uNivUS to use this action." : error.message);
    } finally {
      setPendingAction(null);
    }
  };

  useEffect(() => {
    const retryAction = searchParams.get("retryAction");
    if (!retried.current && actions.some(({ key }) => key === retryAction)) {
      retried.current = true;
      runAction(retryAction);
    }
  }, [searchParams]);

  return (
    <section className="protected-actions" aria-labelledby="protected-actions-title">
      <div className="profile-section-heading">
        <div>
          <p className="eyebrow">COMMUNITY TOOLS</p>
          <h2 id="protected-actions-title">Protected actions</h2>
        </div>
        <span>Policy acceptance required</span>
      </div>
      <p>Try the reusable policy gate for upcoming community features.</p>
      <div className="protected-action-grid">
        {actions.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" disabled={pendingAction === key} onClick={() => runAction(key)}>
            <Icon size={19} aria-hidden="true" />
            <span>{pendingAction === key ? "Checking…" : label}</span>
          </button>
        ))}
      </div>
      <p className="action-status" role="status" aria-live="polite">{message}</p>
    </section>
  );
}

function labelFor(action) {
  return actions.find(({ key }) => key === action)?.label || action;
}
