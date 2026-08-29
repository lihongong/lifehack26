async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || "Request failed"), { status: response.status, body });
  return body;
}

const queryString = (filters) => {
  const value = new URLSearchParams(Object.entries(filters || {}).filter(([, item]) => item));
  return value.size ? `?${value}` : "";
};

function multipart(values, files = []) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null) data.append(key, String(value));
  for (const file of files) data.append("photos", file);
  return data;
}

export const getFoundItemReports = (filters = {}) => request(`/api/found-item-reports${queryString(filters)}`);
export const getFoundItems = (filters = {}) => request(`/api/found-items${queryString(filters)}`);
export const getMyFoundItemReports = () => request("/api/me/found-item-reports");
export const createFoundItemReport = (values, files) => request("/api/found-item-reports", { method: "POST", body: multipart(values, files) });
export const replaceFoundItemReport = (id, values, files) => request(`/api/me/found-item-reports/${encodeURIComponent(id)}`, { method: "PUT", body: multipart(values, files) });
export const withdrawFoundItemReport = (id) => request(`/api/me/found-item-reports/${encodeURIComponent(id)}/withdraw`, { method: "POST" });
