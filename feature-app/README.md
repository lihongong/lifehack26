# NUS Community Exchange

React/Vite frontend and Node/Express/SQLite backend for the NUS Community Exchange tracer bullets.

```bash
npm run install:all
npm run dev
```

For the complete authenticated handoff, build and start the Node server, then open the served mock uNivUS page:

```bash
npm run build
npm start
```

- Mock uNivUS entry: `http://127.0.0.1:3000/univus/`
- Feature app: `http://127.0.0.1:3000/`

Participant data is stored in `backend/data/community-exchange.sqlite` and is ignored by Git.

## Protected community actions

Marketplace, Buffets, Lost & Found, active policy documents, and public profiles remain publicly readable. Posting, Comments, claims, alerts, and Redemptions require an authenticated Participant who has accepted the policy versions currently required for that action.

The private profile includes demonstration controls for exercising each policy gate and an immutable acceptance history. Policy versions and action mappings are seeded by SQLite migrations; production does not expose policy activation controls.

Key policy endpoints:

- `GET /api/policies/active`
- `GET /api/me/policy-status?action=comments`
- `GET /api/me/policy-acceptances`
- `POST /api/me/policy-acceptances`
- `POST /api/protected-actions/:action`

Run verification with `npm test`, `npm run build`, and `npm run test:e2e`. The end-to-end command builds the current frontend before starting Playwright.
