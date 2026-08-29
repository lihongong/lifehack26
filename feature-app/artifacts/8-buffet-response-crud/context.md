# Issue 8 context

## Canonical issue identity

GitHub issue 8 is titled `Buffet response CRUD` and asks for a way to create and delete Buffet response posts.
The repository already contains `artifacts/8-nearby-in-app-buffet-alerts` for a different historical issue identity, so this workspace uses `artifacts/8-buffet-response-crud` and leaves the existing artifact untouched.

## Domain interpretation

The issue asks for CRUD of Buffet Posts, not public Comments.
The literal issue wording says `buffet response posts`, and `backend/src/data/demoBuffetPosts.js` identifies the current source as `NUS Buffet Response demo`.
The parallel issue 7 asks for Marketplace Listing CRUD, which establishes the matching interpretation that issue 8 concerns creating and deleting feed records.
`CONTEXT.md` defines a Buffet Post as a time-sensitive post describing food available for collection.

Existing Source Feed Buffet Posts have namespaced stable identifiers, while manual Buffet Posts need equally stable canonical references without claiming Source Feed provenance.
Manual CRUD must not impersonate that provenance or mutate Source Feed records.
The safe vertical feature is a separately persisted manual Buffet Post created and deleted only by a Moderator, with explicit ShareNUS provenance in the public feed.

## Authorization and auditing

The repository gives Moderators broad content authority and requires sensitive actions to be auditable.
Anonymous visitors, ordinary Participants, and the Platform Operator cannot use Moderator routes.
Publication and deletion each require a reason and record `buffet_post_created` or `buffet_post_deleted` in the immutable audit log within the same transaction as the data change.
Deletion is soft so the operational record and deletion reason remain available while the post disappears from public and Moderator-active views.
Publication also creates eligible Buffet Alerts and notifications inside that transaction, preventing a failed response after durable creation.
Deletion terminally resolves any open food-gone review, and stale Helpful Alert feedback fails once the post is no longer public.

## Public behavior

Manual posts use the existing Buffet title, description, reported location, canonical NUS Zone, search, exact-zone filtering, and explicit collection-deadline behavior.
They are labeled as Moderator additions rather than fictional Source Feed fixtures.
Expired and soft-deleted manual posts are absent from the public feed.
Both origins accept public Comments under ADR 0006 and participate in opt-in Nearby Zone alerts, Helpful Alert feedback, food-gone review, and Moderator restore-or-expire behavior.
Existing Source Feed reconciliation remains unchanged.

## Interfaces

- Moderator management read: `GET /api/moderation/buffets`.
- Moderator create: `POST /api/moderation/buffets`.
- Moderator soft delete: `DELETE /api/moderation/buffets/:postId`.
- Public projection: `GET /api/buffets` combines visible Source Feed and manual posts.
- Public Comments: `GET` and `POST /api/buffets/:postReference/comments` resolve both origins through the Buffet visibility seam.
- Moderator UI: `BuffetPostManagement` is composed into the existing Buffet review area.

## Migration compatibility

The new migration is `009_manual_buffet_posts.sql`.
Issue 7 uses `008_manual_marketplace_listings.sql`, so both migrations have distinct names and apply in deterministic lexical order when the branches are combined.
The migration adds a canonical Buffet reference registry while leaving Source Feed records and reconciliation unchanged.
The public reference is opaque and distinct from Source Feed namespaces and storage identifiers.
Database triggers ensure every Source Feed row has a reference and reject a manual child whose registered origin is not manual.
The same opaque reference keys Comments, lifecycle state, and Gem reward deduplication, including when two Source Feeds reuse a feed-local post identifier.
Manual content remains authoritative in its own table, and the alert service uses a compatibility lifecycle record so the pre-existing immutable alert and review schema can serve both origins without destructive migration.
The reserved manual namespace is rejected at the Source Feed ingestion boundary.
The only source overlap with merged issue 7 is the reset transaction in `backend/src/routes/devRoutes.js`, where both features delete their own manual table before Participants.

## Relevant files

- `CONTEXT.md`
- `backend/src/migrations/009_manual_buffet_posts.sql`
- `backend/src/services/manualBuffetService.js`
- `backend/src/routes/manualBuffetRoutes.js`
- `backend/src/routes/buffetRoutes.js`
- `backend/src/routes/devRoutes.js`
- `frontend/src/components/BuffetPostManagement.jsx`
- `frontend/src/components/BuffetReviewPanel.jsx`
- `frontend/src/components/BuffetCard.jsx`
- `test/buffetCrud.test.js`
- `e2e/buffet-crud.spec.js`
