import { MessageCircle, Pencil, Reply, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { createComment, deleteComment, editComment, getComments } from "../api/commentApi.js";
import ReportControl from "./ReportControl.jsx";

export default function CommentThread({ listing }) {
  const { participant } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const refresh = async () => {
    const data = await getComments(listing.id);
    setComments(data.comments);
  };

  const open = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setError("");
    try {
      await refresh();
      setExpanded(true);
    } catch (caught) {
      setError(caught.message);
    }
  };

  const submitCommentMutation = async (operation, afterSuccess) => {
    setBusy(true);
    setError("");
    setConfirmation(null);
    try {
      await operation(false);
      afterSuccess?.();
      await refresh();
    } catch (caught) {
      if (caught.status === 428) {
        navigate(`/policies?action=comments&returnTo=${encodeURIComponent("/")}`);
      } else if (caught.body?.code === "CONTACT_DETAILS_CONFIRMATION_REQUIRED") {
        setConfirmation({ operation, afterSuccess, types: caught.body.detectedContactTypes });
      } else {
        setError(caught.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmSharing = async () => {
    const pending = confirmation;
    setBusy(true);
    setError("");
    try {
      await pending.operation(true);
      pending.afterSuccess?.();
      setConfirmation(null);
      await refresh();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  const interaction = {
    participant,
    busy,
    replyingTo,
    setReplyingTo,
    replyBody,
    setReplyBody,
    editing,
    setEditing,
    editBody,
    setEditBody,
    submitCommentMutation,
  };

  return (
    <section className="comment-thread" aria-label={`Comments for ${listing.title}`}>
      <button className="comment-toggle" type="button" aria-expanded={expanded} onClick={open}>
        <MessageCircle size={17} aria-hidden="true" />
        {expanded ? "Hide Comments" : "Show Comments"}
      </button>
      {error && <p className="comment-error" role="alert">{error}</p>}
      {expanded && (
        <div className="comment-panel">
          <h4>Comments</h4>
          {comments.length ? (
            <ol className="comment-list">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  listingId={listing.id}
                  interaction={interaction}
                />
              ))}
            </ol>
          ) : <p className="comment-empty">No Comments yet. Start the discussion.</p>}
          {participant ? (
            <form className="comment-form" onSubmit={(event) => {
              event.preventDefault();
              submitCommentMutation(
                (confirmed) => createComment(listing.id, { body, confirmContactDetails: confirmed }),
                () => setBody(""),
              );
            }}>
              <label htmlFor={`new-comment-${listing.id}`}>Add a Comment</label>
              <textarea id={`new-comment-${listing.id}`} required maxLength="1000" value={body} onChange={(event) => setBody(event.target.value)} />
              <button className="comment-primary" type="submit" disabled={busy || !body.trim()}>Post Comment</button>
            </form>
          ) : (
            <p className="comment-sign-in"><a href="/univus/">Open through uNivUS</a> to add a Comment.</p>
          )}
          {confirmation && (
            <div className="contact-warning" role="alert">
              <strong>Check before sharing contact details</strong>
              <p>Your Comment appears to contain {confirmation.types.join(" and ")}. It will be public.</p>
              <div>
                <button type="button" className="comment-primary" disabled={busy} onClick={confirmSharing}>Share publicly</button>
                <button type="button" className="comment-secondary" onClick={() => setConfirmation(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CommentItem({ comment, listingId, interaction }) {
  const {
    participant,
    busy,
    replyingTo,
    setReplyingTo,
    replyBody,
    setReplyBody,
    editing,
    setEditing,
    editBody,
    setEditBody,
    submitCommentMutation,
  } = interaction;
  const isAuthor = participant?.publicId === comment.author.publicId;
  return (
    <li className={`comment-item${comment.deleted ? " is-removed" : ""}`}>
      <div className="comment-heading">
        <Link to={`/participants/${comment.author.publicId}`}>{comment.author.displayName}</Link>
        {comment.edited && !comment.deleted && <span>Edited</span>}
      </div>
      <p>{comment.deleted ? "Comment removed by author." : comment.hidden ? "Comment hidden by a Moderator." : comment.body}</p>
      {!comment.deleted && !comment.hidden && (
        <div className="comment-actions">
          {participant && !comment.parentCommentId && (
            <button type="button" onClick={() => { setReplyingTo(comment.id); setReplyBody(""); }}>
              <Reply size={14} aria-hidden="true" /> Reply to {comment.author.displayName}
            </button>
          )}
          {isAuthor && (
            <>
              <button type="button" aria-label="Edit Comment" onClick={() => { setEditing(comment.id); setEditBody(comment.body); }}><Pencil size={14} aria-hidden="true" /> Edit</button>
              <button type="button" aria-label="Delete Comment" onClick={() => submitCommentMutation(() => deleteComment(comment.id))}><Trash2 size={14} aria-hidden="true" /> Delete</button>
            </>
          )}
        </div>
      )}
      {!comment.deleted && !comment.hidden && (
        <ReportControl targetType="comment" targetId={comment.id} label={`Report Comment by ${comment.author.displayName}`} />
      )}
      {editing === comment.id && (
        <form className="comment-form compact" onSubmit={(event) => {
          event.preventDefault();
          submitCommentMutation(
            (confirmed) => editComment(comment.id, { body: editBody, confirmContactDetails: confirmed }),
            () => setEditing(null),
          );
        }}>
          <label htmlFor={`edit-comment-${comment.id}`}>Edit Comment</label>
          <textarea id={`edit-comment-${comment.id}`} required maxLength="1000" value={editBody} onChange={(event) => setEditBody(event.target.value)} />
          <button className="comment-primary" type="submit" disabled={busy || !editBody.trim()}>Save Comment</button>
        </form>
      )}
      {replyingTo === comment.id && (
        <form className="comment-form compact" onSubmit={(event) => {
          event.preventDefault();
          submitCommentMutation(
            (confirmed) => createComment(listingId, { body: replyBody, parentCommentId: comment.id, confirmContactDetails: confirmed }),
            () => setReplyingTo(null),
          );
        }}>
          <label htmlFor={`reply-comment-${comment.id}`}>Reply to {comment.author.displayName}</label>
          <textarea id={`reply-comment-${comment.id}`} required maxLength="1000" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} />
          <button className="comment-primary" type="submit" disabled={busy || !replyBody.trim()}>Post Reply</button>
        </form>
      )}
      {comment.replies?.length > 0 && (
        <ol className="reply-list">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} listingId={listingId} interaction={interaction} />
          ))}
        </ol>
      )}
    </li>
  );
}
