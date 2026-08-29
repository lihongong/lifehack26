async function policyRequest(url, options = {}) {
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

export const getActivePolicies = () => policyRequest("/api/policies/active");
export const getPolicyStatus = (action) => policyRequest(`/api/me/policy-status?action=${encodeURIComponent(action)}`);
export const getPolicyAcceptances = () => policyRequest("/api/me/policy-acceptances");
export const acceptPolicies = (versionIds) => policyRequest("/api/me/policy-acceptances", {
  method: "POST",
  body: JSON.stringify({ versionIds }),
});
export const performProtectedAction = (action) => policyRequest(`/api/protected-actions/${encodeURIComponent(action)}`, {
  method: "POST",
});
