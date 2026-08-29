async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || "Request failed"), { status: response.status, body });
  return body;
}

function queryString(filters) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return query.size ? `?${query}` : "";
}

function multipart(values, files = []) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) data.append(key, String(value));
  }
  for (const file of files) data.append("photos", file);
  return data;
}

export const getLostItemPosts = (filters = {}) => request(`/api/lost-item-posts${queryString(filters)}`);
export const getMyLostItemPosts = () => request("/api/me/lost-item-posts");
export const createLostItemPost = (values, files) => request("/api/lost-item-posts", {
  method: "POST",
  body: multipart(values, files),
});
export const replaceLostItemPost = (postId, values, files) => request(`/api/me/lost-item-posts/${encodeURIComponent(postId)}`, {
  method: "PUT",
  body: multipart(values, files),
});
export const withdrawLostItemPost = (postId) => request(`/api/me/lost-item-posts/${encodeURIComponent(postId)}/withdraw`, { method: "POST" });
