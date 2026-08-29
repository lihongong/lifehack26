import { ExternalLink, ImageOff } from "lucide-react";
import { useState } from "react";
import { SiTelegram, SiWhatsapp } from "react-icons/si";
import CommentThread from "./CommentThread.jsx";
import ReportControl from "./ReportControl.jsx";
import GemRewardToast, { GemAmount } from "./GemRewardToast.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { collectMarketplaceContactReward, simulateMarketplaceSoldReply } from "../api/listingsApi.js";

function freshness(value) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value)) / 36e5));
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export default function ListingCard({ listing }) {
  const { participant, refresh } = useAuth();
  const [imageFailed, setImageFailed] = useState(false);
  const [reward, setReward] = useState(null);
  const [error, setError] = useState("");
  const [sold, setSold] = useState(false);
  const [busy, setBusy] = useState(false);
  const showImageFallback = !listing.imageUrl || imageFailed;
  const usesWhatsApp = listing.contactUrl?.includes("wa.me");
  const usesTelegram = listing.contactUrl?.includes("t.me");
  const contactLabel = usesWhatsApp ? "WhatsApp" : usesTelegram ? "Telegram" : "Contact";
  const dateFormatter = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });
  const sourceTime = dateFormatter.format(new Date(listing.sourceTime));
  const expiryTime = dateFormatter.format(new Date(listing.expiresAt));

  return (
    <article className="exchange-card listing-card">
      <div className={`listing-image${showImageFallback ? " is-fallback" : ""}`}>
        {showImageFallback ? <><ImageOff aria-hidden="true" size={30} /><span>Image unavailable</span></> : <img src={listing.imageUrl} alt={listing.imageAlt || ""} onError={() => setImageFailed(true)} />}
      </div>
      <div className="listing-content">
        <div className="listing-top"><span className="category">{listing.category}</span><span className="source-author">{listing.origin === "manual" ? "Added by a Community Exchange Moderator" : listing.authorDisplayName ? `By ${listing.authorDisplayName}` : "Seller name withheld"}</span></div>
        <h3>{listing.title}</h3>
        {listing.fictional && <span className="fictional-note">Fictional demo listing</span>}
        <p>{listing.description}</p>
        <strong className="price">${listing.price}</strong>
        <div className="listing-meta">
          <span>Source: {listing.source}</span>
          <time dateTime={listing.sourceTime}>Source time {freshness(listing.sourceTime)} · {sourceTime}</time>
          <time dateTime={listing.expiresAt}>Expires {expiryTime}</time>
        </div>
        <div className="listing-footer">
          {listing.contactUrl ? <>
            <span className="contact-caption">Consented contact</span>
            <a className={`contact-button ${usesWhatsApp ? "whatsapp" : "telegram"}`} href={listing.contactUrl} target="_blank" rel="noopener noreferrer" aria-label={`Message source author on ${contactLabel} about ${listing.title}${participant ? " and earn 1 Gem" : ""}`} title={`${contactLabel} contact`} onClick={() => {
              if (!participant) return;
              setError("");
              collectMarketplaceContactReward(listing.id).then(async (result) => { setReward(result.reward); await refresh(); }).catch((caught) => setError(caught.message));
            }}>
              {usesWhatsApp ? <SiWhatsapp aria-hidden="true" size={19} /> : usesTelegram ? <SiTelegram aria-hidden="true" size={18} /> : <ExternalLink aria-hidden="true" size={18} />}
              <span>{contactLabel}</span>
              {participant && <GemAmount amount={1} />}
            </a>
          </> : <span className="contact-caption">{listing.attributionState === "withheld" ? "Author attribution withheld" : "Seller contact withheld"}</span>}
        </div>
        {listing.contactUrl && !participant && <small className="gem-hint">Sign in before contacting the seller to collect 1 Gem.</small>}
        {listing.demoSoldActionAvailable && <button className="secondary-action demo-sold-action" type="button" disabled={busy || sold} onClick={async () => {
          setBusy(true); setError("");
          try {
            const result = await simulateMarketplaceSoldReply(listing.id);
            setReward(result.sellerReward);
            setSold(true);
            await refresh();
          } catch (caught) { setError(caught.message); } finally { setBusy(false); }
        }}>{sold ? "✓ Sold reply processed" : busy ? "Processing…" : <>Demo: simulate Telegram “sold” reply <GemAmount amount={30} /></>}</button>}
        <GemRewardToast reward={reward} message={sold ? "Buyer and seller rewards processed." : "Marketplace participation reward."} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <ReportControl targetType="marketplace_listing" targetId={listing.id} label="Report Marketplace Listing" />
        <CommentThread listing={listing} />
      </div>
    </article>
  );
}
