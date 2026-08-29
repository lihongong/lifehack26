import { CalendarDays, CircleHelp, ImageOff, MapPin, PackageCheck } from "lucide-react";
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
import { getFoundItemReports, getFoundItems } from "../api/foundItemApi.js";
import CommentThread from "./CommentThread.jsx";
import ReportControl from "./ReportControl.jsx";
import FoundItemWorkflow, { FoundPropertyCard } from "./FoundItemWorkflow.jsx";
import { DateControl, PropertyFilterPanel, SelectControl } from "./PropertyControls.jsx";

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
  const [foundReports, setFoundReports] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [activeAction, setActiveAction] = useState(null);
  const [mine, setMine] = useState([]);
  const [draft, setDraft] = useState(blankDraft);
  const [editingId, setEditingId] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPublic = async () => {
    const [lostData, reportData, itemData] = await Promise.all([
      getLostItemPosts(filters), getFoundItemReports(filters), getFoundItems(filters),
    ]);
    setPosts(lostData.posts); setFoundReports(reportData.reports); setFoundItems(itemData.items);
  };
  const loadMine = async () => participant && setMine((await getMyLostItemPosts()).posts);
  useEffect(() => { loadPublic().catch((caught) => setError(caught.message)); }, [filters]);
  useEffect(() => { if (participant) loadMine().catch((caught) => setError(caught.message)); else setMine([]); }, [participant]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const resetDraft = () => { setDraft(blankDraft()); setEditingId(null); setFiles([]); };

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setStatus("");
    try {
      if (editingId) {
        await replaceLostItemPost(editingId, {
          ...draft,
          retainedPhotoIds: JSON.stringify(draft.retainedPhotoIds),
          revision: mine.find(({ id }) => id === editingId)?.revision,
        }, files);
        setStatus("Lost-Item Post updated and returned to review.");
      } else {
        await createLostItemPost(draft, files);
        setStatus("Lost-Item Post submitted privately for review.");
      }
      resetDraft();
      await Promise.all([loadMine(), loadPublic()]);
    } catch (caught) {
      if (caught.status === 428) navigate(`/policies?action=posting&returnTo=${encodeURIComponent("/lost-and-found")}`);
      else setError(caught.message);
    } finally { setBusy(false); }
  }

  function edit(post) {
    setActiveAction("lost");
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

  const publicEntries = [
    ...posts.map((value) => ({ type: "lost_item_post", value, itemDate: value.lostDate, publicTime: value.publishedAt })),
    ...foundReports.map((value) => ({ type: "found_item_report", value, itemDate: value.foundDate, publicTime: value.approvedAt })),
    ...foundItems.map((value) => ({ type: "found_item", value, itemDate: value.foundDate, publicTime: value.receivedAt })),
  ].sort((left, right) => {
    const key = filters.sort === "lost_date" ? "itemDate" : "publicTime";
    return String(right[key] || "").localeCompare(String(left[key] || "")) || left.value.id.localeCompare(right.value.id);
  });

  return <section className="marketplace lost-and-found" aria-labelledby="lost-found-title">
    <header className="lost-found-intro">
      <p className="eyebrow">COMMUNITY LOST PROPERTY</p>
      <h2 id="lost-found-title">Lost & Found</h2>
      <p>Tell us what happened, or search reports from around campus.</p>
    </header>

    <section className="report-choice" aria-labelledby="report-choice-title">
      <div><p className="eyebrow">START HERE</p><h3 id="report-choice-title">What happened?</h3><p>Choose one option. We will only show the form you need.</p></div>
      <div className="report-choice-grid">
        <button type="button" className={activeAction === "lost" ? "is-active" : ""} aria-pressed={activeAction === "lost"} onClick={() => setActiveAction(activeAction === "lost" ? null : "lost")}>
          <CircleHelp aria-hidden="true" /><strong>I lost something</strong><span>Create a post so others can help.</span>
        </button>
        <button type="button" className={activeAction === "found" ? "is-active found-choice" : "found-choice"} aria-pressed={activeAction === "found"} onClick={() => setActiveAction(activeAction === "found" ? null : "found")}>
          <PackageCheck aria-hidden="true" /><strong>I found something</strong><span>Report it for safe handover.</span>
        </button>
      </div>
      <p className="choice-privacy-note">Descriptions and identifying details remain private until a Moderator creates a safe public version.</p>
    </section>

    {error && <p className="form-error" role="alert">{error}</p>}
    {status && <p className="action-status" role="status">{status}</p>}
    {activeAction === "lost" && (participant ? <LostItemWorkflowForm
      draft={draft} setDraft={setDraft} files={files} setFiles={setFiles} editingId={editingId}
      mine={mine} busy={busy} onSubmit={submit} onReset={resetDraft} onEdit={edit}
      onWithdraw={async (postId) => {
        setError("");
        try {
          await withdrawLostItemPost(postId); setStatus("Lost-Item Post withdrawn from public access.");
          await Promise.all([loadMine(), loadPublic()]);
        } catch (caught) { setError(caught.message); }
      }}
    /> : <aside className="lost-item-sign-in"><h3>Sign in to report what you lost</h3><p>Use your uNivUS session to create a private, Moderator-reviewed post.</p><a href="/univus/">Open through uNivUS</a></aside>)}
    {activeAction === "found" && <FoundItemWorkflow onChanged={loadPublic} />}

    <section className="community-property-feed" aria-labelledby="community-reports-title">
      <div className="property-section-heading"><div><p className="eyebrow">BROWSE</p><h3 id="community-reports-title">Community reports</h3></div><span>{publicEntries.length} visible</span></div>
      <PropertyFilterPanel
        ariaLabel="Lost and Found filters"
        title="Search Lost & Found"
        hint="One search covers both lost and found reports."
        searchLabel="Search Lost-Item Posts and Found Property"
        searchPlaceholder="Search Lost & Found…"
        values={filters}
        onChange={updateFilter}
        categoryLabel="Category"
        zoneLabel="NUS Zone"
        fromLabel="From date"
        toLabel="To date"
        categories={lostItemCategories.map((value) => [value, value])}
        zones={lostItemZones}
        sortOptions={[["recent", "Recently published"], ["lost_date", "Most recent item date"]]}
        today={today()}
      />
      <div className="lost-item-grid combined-property-grid">
        {publicEntries.map((entry) => entry.type === "lost_item_post"
          ? <LostItemCard key={`${entry.type}-${entry.value.id}`} post={entry.value} />
          : <FoundPropertyCard key={`${entry.type}-${entry.value.id}`} value={entry.value} type={entry.type} />)}
        {!publicEntries.length && <p className="status-message">No Lost & Found reports match these filters.</p>}
      </div>
    </section>
  </section>;
}

function LostItemWorkflowForm({ draft, setDraft, setFiles, editingId, mine, busy, onSubmit, onReset, onEdit, onWithdraw }) {
  return <section className="participant-property-workflow" aria-labelledby="lost-item-form-title">
    <form id="lost-item-form" className="lost-item-form" onSubmit={onSubmit}>
      <div><p className="eyebrow">YOU LOST AN ITEM</p><h2 id="lost-item-form-title">{editingId ? "Update lost-item post" : "Tell us what you lost"}</h2><p>Share where and when you lost it. Your ownership details stay private.</p></div>
      <SelectControl label="Category" value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} options={lostItemCategories.map((value) => [value, value])} />
      <DateControl required label="Lost date" max={today()} value={draft.lostDate} onChange={(value) => setDraft({ ...draft, lostDate: value })} />
      <SelectControl label="NUS Zone" value={draft.nusZoneId} onChange={(value) => setDraft({ ...draft, nusZoneId: value })} options={lostItemZones} />
      <label>What did you lose? <small>Private until a Moderator writes a safe public description</small><textarea required minLength="10" maxLength="2000" rows="5" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Private identifying details <small>Marks, contents, serial details, or anything useful for checking ownership</small><textarea required minLength="3" maxLength="2000" rows="4" value={draft.privateIdentifyingDetails} onChange={(event) => setDraft({ ...draft, privateIdentifyingDetails: event.target.value })} /></label>
      {editingId && mine.find(({ id }) => id === editingId)?.photos.length > 0 && <fieldset className="retained-photos"><legend>Keep existing photos</legend>{mine.find(({ id }) => id === editingId).photos.map((photo) => <label key={photo.id}><input type="checkbox" checked={draft.retainedPhotoIds.includes(photo.id)} onChange={(event) => setDraft({ ...draft, retainedPhotoIds: event.target.checked ? [...draft.retainedPhotoIds, photo.id] : draft.retainedPhotoIds.filter((id) => id !== photo.id) })} /><img src={photo.url} alt="Private sanitized Lost-Item preview" /></label>)}</fieldset>}
      <label>Photos <small>Optional, up to three. Metadata is stripped before encrypted storage.</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles([...event.target.files].slice(0, 3))} /></label>
      <div className="lost-item-form-actions"><button className="primary-action" disabled={busy}>{busy ? "Submitting…" : editingId ? "Update and resubmit" : "Submit lost-item post"}</button>{editingId && <button className="secondary-action" type="button" onClick={onReset}>Cancel edit</button>}</div>
    </form>
    <section className="my-lost-items" aria-labelledby="my-lost-items-title"><h2 id="my-lost-items-title">My lost-item posts</h2>{mine.length ? <ul>{mine.map((post) => <li key={post.id}><div><strong>{post.category} · {post.lostDate}</strong><span className={`status-badge status-${post.status}`}>{post.status.replaceAll("_", " ")}</span></div><p>{post.description}</p>{post.rejectionReason && <p className="rejection-reason">Moderator reason: {post.rejectionReason}</p>}<small>Revision {post.revision} · ownership details retained privately</small><div className="management-actions">{["pending_review", "rejected"].includes(post.status) && <button className="secondary-action" type="button" onClick={() => onEdit(post)}>Edit post</button>}{post.status !== "withdrawn" && <button className="danger-action" type="button" onClick={() => onWithdraw(post.id)}>Withdraw</button>}</div></li>)}</ul> : <p>No lost-item posts yet.</p>}</section>
  </section>;
}

function LostItemCard({ post }) {
  return <article className="listing-card lost-item-card">
    <div className="lost-item-gallery">{post.photos.length ? post.photos.map((photo) => <img key={photo.id} src={photo.url} width={photo.width} height={photo.height} alt={photo.alt} />) : <div className="listing-image is-fallback"><ImageOff aria-hidden="true" size={30} /><span>No public photo</span></div>}</div>
    <div className="listing-content"><div className="listing-top"><span className="category">{post.category}</span><span className="status-badge lost-status">Lost</span></div>{post.fictional && <span className="fictional-note">Fictional demo post</span>}<div className="lost-item-facts"><span><CalendarDays size={15} aria-hidden="true" />Lost {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(`${post.lostDate}T12:00:00+08:00`))}</span><span><MapPin size={15} aria-hidden="true" />{post.nusZone.name}</span></div><p>{post.description}</p><small className="publication-time">Published {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(post.publishedAt))}</small><ReportControl targetType="lost_item_post" targetId={post.id} label="Report Lost-Item Post" /><CommentThread post={post} postType="lost_item_post" /></div>
  </article>;
}
