import { useCallback, useEffect, useState } from "react";
import {
  createManualBuffetPost,
  deleteManualBuffetPost,
  getManualBuffetPosts,
} from "../api/buffetModerationApi.js";

const emptyPost = {
  title: "",
  description: "",
  reportedLocation: "",
  zoneId: "",
  collectionDeadline: "",
  reason: "",
};

const time = (value) => new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
}).format(new Date(value));

const singaporeDeadline = (wallClock) => new Date(`${wallClock}:00+08:00`).toISOString();

export default function BuffetPostManagement() {
  const [posts, setPosts] = useState([]);
  const [zones, setZones] = useState([]);
  const [post, setPost] = useState(emptyPost);
  const [deletionReasons, setDeletionReasons] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(() => getManualBuffetPosts().then((data) => {
    setPosts(data.posts);
    setZones(data.zones);
  }), []);
  useEffect(() => { refresh().catch((caught) => setError(caught.message)); }, [refresh]);

  const publish = async (event) => {
    event.preventDefault(); setPending(true); setError(""); setStatus("");
    try {
      const { post: created } = await createManualBuffetPost({
        ...post,
        zoneId: post.zoneId || null,
        collectionDeadline: singaporeDeadline(post.collectionDeadline),
      });
      setPost(emptyPost);
      setStatus(`${created.title} published.`);
      await refresh();
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  };

  const remove = async (managedPost) => {
    setPending(true); setError(""); setStatus("");
    try {
      await deleteManualBuffetPost(managedPost.id, deletionReasons[managedPost.id]);
      setStatus(`${managedPost.title} deleted.`);
      setDeletionReasons((current) => ({ ...current, [managedPost.id]: "" }));
      await refresh();
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  };

  return (
    <section aria-labelledby="manual-buffet-title">
      <form className="privileged-form manual-buffet-form" onSubmit={publish}>
        <div><p className="eyebrow">MANUAL BUFFET POST</p><h2 id="manual-buffet-title">Publish a Buffet Post</h2></div>
        <p>Create a time-limited ShareNUS Buffet Post without changing Source Feed provenance.</p>
        <label>Buffet Post title<input required minLength="3" maxLength="160" value={post.title} onChange={(event) => setPost({ ...post, title: event.target.value })} /></label>
        <label>Buffet Post description<textarea required minLength="10" maxLength="2000" rows="4" value={post.description} onChange={(event) => setPost({ ...post, description: event.target.value })} /></label>
        <label>Reported location<input required minLength="3" maxLength="300" value={post.reportedLocation} onChange={(event) => setPost({ ...post, reportedLocation: event.target.value })} /></label>
        <label>Buffet Post NUS Zone<select value={post.zoneId} onChange={(event) => setPost({ ...post, zoneId: event.target.value })}><option value="">Location unclear</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <label>Collection deadline (Singapore time)<input required type="datetime-local" value={post.collectionDeadline} onChange={(event) => setPost({ ...post, collectionDeadline: event.target.value })} /></label>
        <label>Reason for publishing Buffet Post<input required minLength="3" maxLength="500" value={post.reason} onChange={(event) => setPost({ ...post, reason: event.target.value })} /></label>
        <button className="primary-action" disabled={pending}>Publish Buffet Post</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p className="action-status" role="status">{status}</p>}
      <h2>Manual Buffet Posts</h2>
      {posts.length ? <ul className="moderation-list manual-buffet-list">{posts.map((managedPost) => (
        <li key={managedPost.id}>
          <div><strong>{managedPost.title}</strong><span>{managedPost.reportedLocation} · {managedPost.expired ? "Expired" : `Collect by ${time(managedPost.collectionDeadline)}`}</span></div>
          <label>Buffet deletion reason<input required minLength="3" maxLength="500" value={deletionReasons[managedPost.id] || ""} onChange={(event) => setDeletionReasons((current) => ({ ...current, [managedPost.id]: event.target.value }))} /></label>
          <button className="danger-action" type="button" disabled={pending} onClick={() => remove(managedPost)}>Delete manual Buffet Post</button>
        </li>
      ))}</ul> : <p>No manual Buffet Posts.</p>}
    </section>
  );
}
