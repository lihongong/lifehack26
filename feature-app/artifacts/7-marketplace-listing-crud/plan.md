# Plan

## 1. Reproduce the missing journey

Add a Playwright test that signs in as an enrolled Moderator, attempts to create a manual Marketplace Listing from the moderation screen, verifies it publicly, deletes it with a reason, and verifies it disappears.
Run the focused test first and retain the failure as evidence that the user-visible workflow is missing.

## 2. Add a durable manual-listing boundary

Add a migration for manual Marketplace Listings with controlled category, whole-dollar price, public description, optional HTTPS image metadata, creator, timestamps, and soft-deletion metadata.
Keep these records independent from Source Feed tables and combine them with imported listings only in the public query service.

## 3. Implement audited Moderator endpoints test-first

Add HTTP tests showing anonymous Participants and the Platform Operator cannot use the endpoints, invalid content is rejected, and a Moderator can create and delete a manual listing.
Record `marketplace_listing_created` and `marketplace_listing_deleted` audit events in the same transaction as each lifecycle change.
Reject deletion of Source Feed listings through the manual delete endpoint so provenance remains governed by Source Feed lifecycle operations.

## 4. Add the Moderator UI

Add a focused manual Marketplace Listing form to the moderation page and a delete control only for manual listings.
Refresh the moderation list after each successful action and communicate success or validation errors accessibly.
Use the existing responsive privileged-form and action styles, then inspect desktop and mobile layouts.

## 5. Verify and review

Run focused backend tests, the focused Playwright test on port 3207, the frontend build, the full backend suite, and the full E2E suite.
Run the repository code-review workflow, address findings, commit intended files, and report overlap risk with issue 8.
