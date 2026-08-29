import { CalendarDays, ImageOff, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  createLostItemPost,
  getLostItemPosts,
  getMyLostItemPosts,
  replaceLostItemPost,
  withdrawLostItemPost,
} from "../api/lostItemApi.js";
import CommentThread from "./CommentThread.jsx";
import ReportControl from "./ReportControl.jsx";
import FoundItemWorkflow from "./FoundItemWorkflow.jsx";

export const lostItemCategories = ["Electronics", "Wallets & Cards", "Keys", "Bags", "Clothing", "Accessories", "Documents", "Other"];
export const lostItemZones = [
  ["utown", "UTown"], ["museum-ucc", "Museum/UCC"], ["cde", "CDE"], ["central", "Central"],
  ["fass", "FASS"], ["business", "Business"], ["computing", "Computing"], ["pgp", "PGP"],
  ["science", "Science"], ["medicine-kent-ridge", "Medicine/Kent Ridge MRT"],
];

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
const blankDraft = () => ({ category: "Electronics", lostDate: today(), nusZoneId: "utown", description: "", privateIdentifyingDetails: "", retainedPhotoIds: [] });

export default function LostAndFoundFeed() {
  const { participant } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ query: "", category: "", zone: "", dateFrom: "", dateTo: "", sort: "recent" });
  const [posts, setPosts] = useState([]);
  const [mine, setMine] = useState([]);
  const [draft, setDraft] = useState(blankDraft);
  const [editingId, setEditingId] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPublic = async () => setPosts((await getLostItemPosts(filters)).posts);
  const loadMine = async () => participant && setMine((await getMyLostItemPosts()).posts);
  useEffect(() => { loadPublic().catch((caught) => setError(caught.message)); }, [filters]);
  useEffect(() => { if (participant) loadMine().catch((caught) => setError(caught.message)); else setMine([]); }, [participant]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const resetDraft = () => { setDraft(blankDraft()); setEditingId(null); setFiles([]); };

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setStatus("");
    try {
      if (editingId) {
        await replaceLostItemPost(editingId, {
          ...draft,
          retainedPhotoIds: JSON.stringify(draft.retainedPhotoIds),
          revision: mine.find(({ id }) => id === editingId)?.revision,
        }, files);
        setStatus("Lost-Item Post updated and returned to Moderator review.");
      } else {
        await createLostItemPost(draft, files);
        setStatus("Lost-Item Post submitted privately for Moderator review.");
      }
      resetDraft();
      await Promise.all([loadMine(), loadPublic()]);
    } catch (caught) {
      if (caught.status === 428) navigate(`/policies?action=posting&returnTo=${encodeURIComponent("/lost-and-found")}`);
      else setError(caught.message);
    } finally { setBusy(false); }
  }

  function edit(post) {
    setEditingId(post.id);
    setDraft({
      category: post.category,
      lostDate: post.lostDate,
      nusZoneId: post.nusZone.id,
      description: post.description,
      privateIdentifyingDetails: post.privateIdentifyingDetails,
      retainedPhotoIds: post.photos.map(({ id }) => id),
    });
    setFiles([]);
    document.getElementById("lost-item-form")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section className="marketplace lost-and-found" aria-labelledby="lost-found-title">
      <div className="section-heading"><h2 id="lost-found-title">Lost & Found</h2><span>{posts.length} published</span></div>
      <div className="filters lost-item-filters" aria-label="Lost-Item Post filters">
        <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Search Lost-Item Posts</span><input type="search" placeholder="Search descriptions, zones…" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} /></label>
        <div className="filter-row">
          <FilterSelect label="Category" value={filters.category} onChange={(value) => updateFilter("category", value)} options={lostItemCategories.map((value) => [value, value])} empty="All categories" />
          <FilterSelect label="NUS Zone" value={filters.zone} onChange={(value) => updateFilter("zone", value)} options={lostItemZones} empty="All zones" />
        </div>
        <div className="filter-row date-filters">
          <label>Lost from<input type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></label>
          <label>Lost to<input type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} /></label>
        </div>
        <FilterSelect label="Order" value={filters.sort} onChange={(value) => updateFilter("sort", value)} options={[["recent", "Recently published"], ["lost_date", "Most recently lost"]]} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p className="action-status" role="status">{status}</p>}
      <div className="lost-item-grid">
        {posts.length ? posts.map((post) => <LostItemCard key={post.id} post={post} />) : <p className="status-message">No published Lost-Item Posts match these filters.</p>}
      </div>
      <FoundItemWorkflow />

      {participant ? <>
        <form id="lost-item-form" className="lost-item-form" onSubmit={submit}>
          <div><p className="eyebrow">PRIVATE SUBMISSION</p><h2>{editingId ? "Replace pending submission" : "Report a lost item"}</h2><p>Only a Moderator-written description and approved photos can become public. Your original account, description, and ownership details stay private.</p></div>
          <FilterSelect label="Category" value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} options={lostItemCategories.map((value) => [value, value])} />
          <label>Lost date<input required type="date" max={today()} value={draft.lostDate} onChange={(event) => setDraft({ ...draft, lostDate: event.target.value })} /></label>
          <FilterSelect label="NUS Zone" value={draft.nusZoneId} onChange={(value) => setDraft({ ...draft, nusZoneId: value })} options={lostItemZones} />
          <label>Original description <small>Private; never published automatically</small><textarea required minLength="10" maxLength="2000" rows="5" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>Private Identifying Details <small>Private evidence for a later ownership check</small><textarea required minLength="3" maxLength="2000" rows="4" value={draft.privateIdentifyingDetails} onChange={(event) => setDraft({ ...draft, privateIdentifyingDetails: event.target.value })} /></label>
          {editingId && mine.find(({ id }) => id === editingId)?.photos.length > 0 && <fieldset className="retained-photos"><legend>Keep existing sanitized photos</legend>{mine.find(({ id }) => id === editingId).photos.map((photo) => <label key={photo.id}><input type="checkbox" checked={draft.retainedPhotoIds.includes(photo.id)} onChange={(event) => setDraft({ ...draft, retainedPhotoIds: event.target.checked ? [...draft.retainedPhotoIds, photo.id] : draft.retainedPhotoIds.filter((id) => id !== photo.id) })} /><img src={photo.url} alt="Private sanitized Lost-Item preview" /></label>)}</fieldset>}
          <label>Photos (optional, up to three)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles([...event.target.files].slice(0, 3))} /><small>JPEG, PNG, or WebP; 5 MB and 12 megapixels maximum each. Metadata is stripped.</small></label>
          <div className="lost-item-form-actions"><button className="primary-action" disabled={busy}>{busy ? "Submitting…" : editingId ? "Replace and resubmit" : "Submit for review"}</button>{editingId && <button className="secondary-action" type="button" onClick={resetDraft}>Cancel edit</button>}</div>
        </form>

        <section className="my-lost-items" aria-labelledby="my-lost-items-title"><h2 id="my-lost-items-title">My Lost-Item Posts</h2>{mine.length ? <ul>{mine.map((post) => <li key={post.id}><div><strong>{post.category} · {post.lostDate}</strong><span className={`status-badge status-${post.status}`}>{post.status.replaceAll("_", " ")}</span></div><p>{post.description}</p>{post.rejectionReason && <p className="rejection-reason">Moderator reason: {post.rejectionReason}</p>}<small>Revision {post.revision} · private ownership details retained securely</small><div className="management-actions">{["pending_review", "rejected"].includes(post.status) && <button className="secondary-action" type="button" onClick={() => edit(post)}>Edit full submission</button>}{post.status !== "withdrawn" && <button className="danger-action" type="button" onClick={async () => { setError(""); try { await withdrawLostItemPost(post.id); setStatus("Lost-Item Post withdrawn from public access."); await Promise.all([loadMine(), loadPublic()]); } catch (caught) { setError(caught.message); } }}>Withdraw</button>}</div></li>)}</ul> : <p>No Lost-Item Posts submitted yet.</p>}</section>
      </> : <aside className="lost-item-sign-in"><h3>Lost something?</h3><p>Open this feature through your uNivUS session to submit a private, Moderator-reviewed Lost-Item Post.</p><a href="/univus/">Open through uNivUS</a></aside>}
    </section>
  );
}

function FilterSelect({ label, value, onChange, options, empty }) {
  return <label className="select-control"><span className="select-label">{label}</span><span className="select-shell"><select value={value} onChange={(event) => onChange(event.target.value)}>{empty && <option value="">{empty}</option>}{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></span></label>;
}

function LostItemCard({ post }) {
  return <article className="listing-card lost-item-card">
    <div className="lost-item-gallery">{post.photos.length ? post.photos.map((photo) => <img key={photo.id} src={photo.url} width={photo.width} height={photo.height} alt={photo.alt} />) : <div className="listing-image is-fallback"><ImageOff aria-hidden="true" size={30} /><span>No public photo</span></div>}</div>
    <div className="listing-content"><div className="listing-top"><span className="category">{post.category}</span>{post.fictional && <span className="fictional-note">Fictional demo post</span>}</div><div className="lost-item-facts"><span><CalendarDays size={15} aria-hidden="true" />Lost {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(`${post.lostDate}T12:00:00+08:00`))}</span><span><MapPin size={15} aria-hidden="true" />{post.nusZone.name}</span></div><p>{post.description}</p><small className="publication-time">Published {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(post.publishedAt))}</small><ReportControl targetType="lost_item_post" targetId={post.id} label="Report Lost-Item Post" /><CommentThread post={post} postType="lost_item_post" /></div>
  </article>;
}
