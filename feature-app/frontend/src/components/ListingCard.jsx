import { ImageOff } from "lucide-react";
import { useState } from "react";
import { SiTelegram, SiWhatsapp } from "react-icons/si";
import CommentThread from "./CommentThread.jsx";

function freshness(value) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value)) / 36e5));
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export default function ListingCard({ listing }) {
  const [imageFailed, setImageFailed] = useState(false);
  const message = encodeURIComponent(`Hi! I am interested in the fictional demo listing: ${listing.title}.`);
  const whatsappUrl = `https://wa.me/${listing.contacts.whatsapp}?text=${message}`;
  const telegramUrl = `https://t.me/${listing.contacts.telegram}`;
  const usesWhatsApp = listing.preferredContact === "whatsapp";
  const contactUrl = usesWhatsApp ? whatsappUrl : telegramUrl;
  const contactLabel = usesWhatsApp ? "WhatsApp" : "Telegram";
  const sourceTime = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(listing.updatedAt));

  return (
    <article className="listing-card">
      <div className={`listing-image${imageFailed ? " is-fallback" : ""}`}>
        {imageFailed ? <><ImageOff aria-hidden="true" size={30} /><span>Image unavailable</span></> : <img src={listing.imageUrl} alt={listing.imageAlt} onError={() => setImageFailed(true)} />}
      </div>
      <div className="listing-content">
        <div className="listing-top"><span className="category">{listing.category}</span></div>
        <h3>{listing.title}</h3>
        <span className="fictional-note">Fictional demo listing</span>
        <p>{listing.description}</p>
        <strong className="price">${listing.price}</strong>
        <div className="listing-meta"><span>Source: {listing.source}</span><time dateTime={listing.updatedAt}>Updated {freshness(listing.updatedAt)} · {sourceTime}</time></div>
        <div className="listing-footer">
          <span className="contact-caption">Preferred contact</span>
          <a className={`contact-button ${listing.preferredContact}`} href={contactUrl} target="_blank" rel="noopener noreferrer" aria-label={`Message seller on ${contactLabel} about ${listing.title}`} title={`Demo ${contactLabel} contact`}>
            {usesWhatsApp ? <SiWhatsapp aria-hidden="true" size={19} /> : <SiTelegram aria-hidden="true" size={18} />}
            <span>{contactLabel}</span>
          </a>
        </div>
        <CommentThread listing={listing} />
      </div>
    </article>
  );
}
