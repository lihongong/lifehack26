const mockIdentities = Object.freeze({
  operator: Object.freeze({ subject: "mock-univus-bryan-001", email: "bryan@example.nus.edu.sg" }),
  moderator: Object.freeze({ subject: "mock-univus-moderator-001", email: "moderator@example.nus.edu.sg" }),
  participant: Object.freeze({ subject: "mock-univus-participant-001", email: "participant@example.nus.edu.sg" }),
});

export function createUnivusAdapter(environment) {
  return {
    resolveIdentity(request) {
      if (environment === "production") throw Object.assign(new Error("A production uNivUS identity adapter is not configured."), { status: 503 });
      return mockIdentities[request.headers["x-demo-identity"]] || mockIdentities.operator;
    },
  };
}
