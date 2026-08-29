import { Gem } from "lucide-react";

export function GemAmount({ amount }) {
  return <><span className="gem-amount" aria-hidden="true"><span>+{amount}</span><Gem size={15} strokeWidth={2.5} /></span><span className="sr-only">Earn {amount} Gems</span></>;
}

export default function GemRewardToast({ reward, message }) {
  if (!reward) return null;
  return <div className={`gem-reward-toast${reward.awarded ? " is-awarded" : ""}`} role="status" aria-live="polite">
    <Gem className="gem-reward-icon" aria-hidden="true" size={25} strokeWidth={2.25} />
    <strong>{reward.awarded ? `+${reward.amount} Gems` : reward.status === "daily_limit_reached" ? "Daily Gem limit reached" : "Gems already collected"}</strong>
    {message && <small>{message}</small>}
  </div>;
}
