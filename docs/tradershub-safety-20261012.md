# TradersHub reactions and safety

## Delivered

- Original, scalable Continua vector reactions for all 28 selectable reactions,
  plus the three legacy saved IDs. No platform emoji are rendered by the
  community reaction control or chips. Existing reactions/counts are retained.
- A shared post/account safety menu on feed cards, legacy cards, profiles,
  post detail and other people's replies. Expanded reaction tiles have names;
  controls retain screen-reader labels.
- Reason/context dialogs persist post and account reports before confirming
  success. Reports stay private to their reporter and server operators. Retrying
  a report preserves the first submission, without duplicates; the RPC caps
  new reports at 30 per account per rolling day. Reporting does not itself
  remove content or decide whether a violation occurred.
- Atomic, idempotent mute/block/unmute/unblock operations. A new block removes
  follows in both directions. Unblocking does not automatically refollow.
- Restrictive database policies enforce signed-in post/reply visibility and
  prevent blocked follows, replies, likes, reposts, bookmarks and reactions.
  The security-definer poll function explicitly checks blocking too.
- Muting remains a personal feed/notification preference, not an access ban.
  Safety changes refresh feed, follows and notifications. Preference fetch
  errors aren't interpreted as having no exclusions. Older feed requests
  cannot overwrite a newer safety refresh; empty feeds no longer retain an
  old module cache. Settings reversals only update UI after successful saves.
- No premature report/hide success messages; comment reaction failures roll
  back optimistic UI; failed follow/delete operations disclose failure.

## Operator review

In the owner-only Supabase Table Editor, review `post_reports` and
`account_reports`, filter `status = pending`, inspect the referenced post or
account and the reason/context, then set `reviewed` or `dismissed` after an
actual review. These queues are not published to community members. No
automatic takedown, suspension, reviewer staffing or email delivery is claimed.
No real user was reported, muted, blocked or deleted during verification.

## Boundaries

Posts/profile images remain public content. Blocking is enforced for signed-in
community activity, not a promise that public content becomes secret when the
other person signs out. Existing shared-room membership/access has not been
redesigned into private messaging, and a member's old contributions are not
purged. An exhaustive audit of every social-platform feature is not claimed.
Anonymous browsing, licensing/content rights and human moderation obligations
remain separate concerns.

## Validation

Migration `20261012030000_community_safety.sql` adds report storage, RPCs,
block restrictions and notification filtering. The application script
`backend/scripts/applyCommunitySafety.ts` tests duplicate reports, report
privacy, bilateral blocking, follow cleanup, rejected blocked reactions/
comments/follows, unblocking and mute reversal using synthetic auth accounts
inside a savepoint. All fixtures are rolled back, even when the migration
itself is applied. No payment or real account entitlement is changed.

The migration was applied after two successful rollback-only verification
runs. Frontend tests: 84 passed. Frontend/backend type checks and the
frontend production build passed.
