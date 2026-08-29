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

export const getComments = (listingId) => request(`/api/listings/${encodeURIComponent(listingId)}/comments`);
export const createComment = (listingId, input) => request(`/api/listings/${encodeURIComponent(listingId)}/comments`, {
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
