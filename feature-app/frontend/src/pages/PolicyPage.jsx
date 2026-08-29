import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import AppHeader from "../components/AppHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { acceptPolicies, getActivePolicies } from "../api/policyApi.js";

export default function PolicyPage() {
  const { participant, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [policies, setPolicies] = useState([]);
  const [confirmed, setConfirmed] = useState({});
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const action = searchParams.get("action");
  const requestedReturn = searchParams.get("returnTo");
  const returnTo = ["/", "/profile"].includes(requestedReturn) ? requestedReturn : "/profile";

  useEffect(() => {
    if (!participant) return;
    getActivePolicies()
      .then(({ policies: activePolicies }) => setPolicies(activePolicies))
      .catch((error) => setStatus(error.message))
      .finally(() => setPoliciesLoading(false));
  }, [participant]);

  const unaccepted = useMemo(() => policies.filter(({ accepted }) => !accepted), [policies]);
  const allConfirmed = unaccepted.length > 0 && unaccepted.every(({ id }) => confirmed[id]);

  if (loading) return <main className="app-shell"><p className="status-message">Loading policies…</p></main>;
  if (!participant) return <Navigate to="/" replace />;
  if (!participant.displayName) return <Navigate to="/profile/setup" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (!allConfirmed) return;
    setSubmitting(true);
    setStatus("");
    try {
      await acceptPolicies(unaccepted.map(({ id }) => id));
      const destination = action && returnTo === "/profile" ? `${returnTo}?retryAction=${encodeURIComponent(action)}` : returnTo;
      navigate(destination, { replace: true });
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <AppHeader />
      <section className="policy-page" aria-labelledby="policy-page-title">
        <div className="policy-intro">
          <ShieldCheck size={30} aria-hidden="true" />
          <p className="eyebrow">BEFORE YOUR PROTECTED ACTION</p>
          <h1 id="policy-page-title">Review community policies</h1>
          <p>Public browsing stays open. Please confirm each current document to continue with protected community actions.</p>
          {action && <p className="policy-required" role="status">Acceptance required to continue with {displayAction(action)}.</p>}
        </div>

        <form onSubmit={submit}>
          <div className="policy-list">
            {policies.map((policy) => (
              <article className="policy-card" key={policy.id}>
                <div className="policy-card-heading">
                  {policy.type === "terms" ? <FileCheck2 aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                  <div>
                    <span>{policy.type === "terms" ? "TERMS" : "PRIVACY NOTICE"} · VERSION {policy.version}</span>
                    <h2>{policy.title}</h2>
                  </div>
                </div>
                <p className="policy-content">{policy.content}</p>
                <p className="policy-scope">Applies to: {policy.affectedActions.join(", ")}</p>
                {policy.accepted ? (
                  <div className="policy-accepted"><CheckCircle2 size={18} aria-hidden="true" /> Already accepted</div>
                ) : (
                  <label className="policy-confirmation">
                    <input
                      type="checkbox"
                      checked={Boolean(confirmed[policy.id])}
                      onChange={(event) => setConfirmed((current) => ({ ...current, [policy.id]: event.target.checked }))}
                    />
                    <span>I have read and accept {policy.type === "terms" ? "these Terms" : "this Privacy Notice"}.</span>
                  </label>
                )}
              </article>
            ))}
          </div>
          {policiesLoading ? (
            <p className="status-message" role="status">Loading current policies…</p>
          ) : unaccepted.length ? (
            <button className="primary-action policy-submit" type="submit" disabled={!allConfirmed || submitting}>
              {submitting ? "Recording acceptance…" : "Accept and continue"}
            </button>
          ) : (
            <button className="primary-action policy-submit" type="button" onClick={() => navigate(returnTo)}>
              Continue to profile
            </button>
          )}
          <p className="form-error" role="alert">{status}</p>
        </form>
      </section>
    </main>
  );
}

function displayAction(action) {
  return action === "comments" ? "Comments" : `${action.slice(0, 1).toUpperCase()}${action.slice(1)}`;
}
