async function jsonRequest(url, options) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw Object.assign(new Error(body.error || "Request failed"), { status: response.status }); }
  return response.status === 204 ? null : response.json();
}
export const getSession = () => jsonRequest("/api/auth/session");
export const updateProfile = (profile) => jsonRequest("/api/me/profile", { method: "PUT", body: JSON.stringify(profile) });
export const getGems = () => jsonRequest("/api/me/gems");
export const getPublicProfile = (publicId) => jsonRequest(`/api/participants/${encodeURIComponent(publicId)}`);
export const logout = () => jsonRequest("/api/auth/logout", { method: "POST" });
