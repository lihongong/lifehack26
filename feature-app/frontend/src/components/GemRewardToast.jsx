export default function GemRewardToast({ reward, message }) {
  if (!reward) return null;
  return <div className={`gem-reward-toast${reward.awarded ? " is-awarded" : ""}`} role="status" aria-live="polite">
    <span aria-hidden="true">💎</span>
    <strong>{reward.awarded ? `+${reward.amount} Gems` : reward.status === "daily_limit_reached" ? "Daily Gem limit reached" : "Gems already collected"}</strong>
    {message && <small>{message}</small>}
  </div>;
}
