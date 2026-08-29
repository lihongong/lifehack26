async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || "Request failed"), { status: response.status });
  return body;
}

export const getManualBuffetPosts = () => request("/api/moderation/buffets");
export const createManualBuffetPost = (post) => request("/api/moderation/buffets", {
  method: "POST",
  body: JSON.stringify(post),
});
export const deleteManualBuffetPost = (postId, reason) => request(`/api/moderation/buffets/${encodeURIComponent(postId)}`, {
  method: "DELETE",
  body: JSON.stringify({ reason }),
});
