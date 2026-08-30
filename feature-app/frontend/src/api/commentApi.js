async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body?.error || "Request failed"), {
      status: response.status,
      body,
    });
  }
  return body;
}

const postPath = (postType, postId) => postType === "lost_item_post"
  ? `/api/lost-item-posts/${encodeURIComponent(postId)}`
  : postType === "found_item_report"
    ? `/api/found-item-reports/${encodeURIComponent(postId)}`
    : postType === "found_item"
    ? `/api/found-items/${encodeURIComponent(postId)}`
    : postType === "buffet_post"
      ? `/api/buffets/${encodeURIComponent(postId)}`
  : `/api/listings/${encodeURIComponent(postId)}`;
export const getComments = (postId, postType = "marketplace_listing") => request(`${postPath(postType, postId)}/comments`);
export const createComment = (postId, input, postType = "marketplace_listing") => request(`${postPath(postType, postId)}/comments`, {
  method: "POST",
  body: JSON.stringify(input),
});
export const editComment = (commentId, input) => request(`/api/comments/${encodeURIComponent(commentId)}`, {
  method: "PATCH",
  body: JSON.stringify(input),
});
export const deleteComment = (commentId) => request(`/api/comments/${encodeURIComponent(commentId)}`, {
  method: "DELETE",
});
export const getNotifications = () => request("/api/me/notifications");
export const createContentReport = (input) => request("/api/content-reports", {
  method: "POST",
  body: JSON.stringify(input),
});
