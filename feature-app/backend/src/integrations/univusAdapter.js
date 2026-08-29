const mockIdentity = Object.freeze({ subject: "mock-univus-bryan-001", email: "bryan@example.nus.edu.sg" });

export function createUnivusAdapter(environment) {
  return {
    resolveIdentity() {
      if (environment === "production") throw Object.assign(new Error("A production uNivUS identity adapter is not configured."), { status: 503 });
      return mockIdentity;
    },
  };
}
