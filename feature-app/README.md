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
Set `PLATFORM_OPERATOR_SUBJECT` to the stable uNivUS subject allowed to bootstrap the first Platform Operator.
Without that deployment setting, all authenticated people remain Participants.
Set `SOURCE_ID_HASH_SECRET` in production before processing any Source Feed author identifier.

## Protected community actions

Marketplace, Buffets, Lost & Found, active policy documents, and public profiles remain publicly readable. Posting, Comments, claims, alerts, and Redemptions require an authenticated Participant who has accepted the policy versions currently required for that action.

The private profile includes demonstration controls for exercising each policy gate and an immutable acceptance history. Policy versions and action mappings are seeded by SQLite migrations; production does not expose policy activation controls.

Key policy endpoints:

- `GET /api/policies/active`
- `GET /api/me/policy-status?action=comments`
- `GET /api/me/policy-acceptances`
- `POST /api/me/policy-acceptances`
- `POST /api/protected-actions/:action`

## Privileged operations

The Platform Operator can enroll and remove Moderators at `/operator`, where the complete immutable audit trail is also visible.
Moderators hide or restore Marketplace Listings with a required reason at `/moderation/marketplace`.

Key privileged endpoints:

- `GET /api/operator/moderators`
- `POST /api/operator/moderators`
- `DELETE /api/operator/moderators/:participantId`
- `GET /api/operator/audit`
- `GET /api/moderation/marketplace`
- `PATCH /api/moderation/marketplace/:listingId`

## Source Feed fixtures and gates

Marketplace demonstration data is replayed through an allowlisted Telegram-style fixture without a live chat, token, or network request.
Replay the deterministic baseline or another bundled scenario with:

```bash
npm run replay:source-fixtures
npm run replay:source-fixtures -- consent-lifecycle
```

Production starts with an empty Source Feed whose written-permission, privacy-review, and explicit live-enable gates are all disabled.
The live adapter factory cannot be called until all three per-feed gates pass.
The current increment intentionally provides no real Telegram connector.

Platform Operator endpoints:

- `GET /api/operator/source-feeds`
- `PATCH /api/operator/source-feeds/:feedId/gates`

Moderator endpoints:

- `GET /api/moderation/source-discrepancies?status=open`
- `POST /api/moderation/source-discrepancies/:discrepancyId/resolution`
- `GET /api/moderation/source-feeds/:feedId/author-consents`
- `POST /api/moderation/source-feeds/:feedId/author-consents`
- `DELETE /api/moderation/source-feeds/:feedId/author-consents/:consentId`

Fixture replay is exposed through `/api/dev/source-feeds/replay` only outside production and accepts allowlisted fixture names rather than paths or arbitrary payloads.
Public Marketplace responses omit private evidence, hashed identifiers, original Source Feed URLs, and unconsented attribution.

Run verification with `npm test`, `npm run build`, and `npm run test:e2e`. The end-to-end command builds the current frontend before starting Playwright.
