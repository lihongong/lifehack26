# Issue 8 UI proof

## Claim

A Moderator can publish and delete a manual Buffet Post through the visible moderation UI, and the post appears and disappears on the public Buffet feed without horizontal overflow at mobile or desktop widths.

## Baseline diagnostic

The issue branch was rebased onto ShareNUS revision `35ad470` before final implementation.
The route `/moderation/marketplace` was exercised after enrolling the fixed demo Moderator and freezing the clock at `2026-08-30T04:00:00Z`.
The new Playwright journey failed in both responsive projects because `.manual-buffet-form` did not exist.
The failure was confirmed before the manual Buffet source implementation.

No matched baseline screenshot was retained before the source edit, so this record is an after-only diagnostic rather than a before-and-after screenshot pair.

## Changed-state proof

- Moderator route: `/moderation/marketplace`.
- Public route: `/buffets`.
- Seed state: five active fictional Source Feed Buffet Posts at `2026-08-30T04:00:00Z`.
- Browser projects: Pixel 7 and Desktop Chrome, with the Moderator context forced to `America/Los_Angeles`.
- Interaction: publish `Late seminar bentos`, observe its public card and ShareNUS Moderator provenance, then delete it with a reason and reload the public feed.
- Distinguishing assertions: the form is visible without horizontal overflow, the public heading, UTC+08:00 deadline, Comment control, and `Added by a ShareNUS Moderator` label appear, and the heading count returns to zero after deletion.

The focused Playwright journey passes in both responsive projects.
Generated screenshots and Playwright traces remain untracked.
