# Community and portfolio reliability

## Findings and changes

- The report dialog lived inside a dropdown that deliberately prevented dismissal. Reports now use a route-independent host; menu selection dismisses normally before the host presents the form. Submission still uses the protected, rate-limited report RPC; no test reports were submitted.
- Followers/following now explicitly use the app's fullscreen dialog mode, clean underline navigation and accessible profile buttons. Follow failures surface instead of claiming success.
- Profile search uses the public directory, not post authors, supports one-character names, sanitizes PostgREST filter grammar and exposes errors. The full NSE instrument universe augments ticker/company search. Public TradersHub setup remains required: non-posters are discoverable, private non-onboarded accounts are not exposed.
- Signed-in blocked profiles show an unblock gate. Search does not remove the public profile's directory entry. Existing restrictive database policies still protect posts and interactions.
- Holding-entry sheets listen to VisualViewport resize/scroll and center within the visible viewport when a keyboard reduces height; they return to bottom-sheet placement after dismissal. Real iOS keyboard behavior requires device confirmation; desktop resizing is not proof of keyboard handling.
- Portfolio share cards use a flat theme surface and display shares × current price for each holding. Hide-amounts hides these values; hide-gains is independent.
- The portfolio overview succeeded in a live signed-in read and in direct database diagnostics (12/12 priced for the main portfolio). A permanent server failure was not reproduced. Per-holding database calls were replaced with one batch, the free overview allows 90s for cold start, periodically refreshes while active, and exposes retry without discarding a previous dated response. Free hosting sleep remains; no paid upgrade or keepalive was added.
- A recorded holding's entry time is not a trade/cash-flow date. Removed the falsely labeled annualized IRR approximation and show unrealized return instead. Missing chart history no longer displays the entire current balance as a period gain.

## Research tools added

Discussion Pulse counts ticker mentions/contributors in visible loaded posts from the preceding 7 days, with explicit sampling limitations. Watchlist discussion shortcuts, a source/period/interpretation/question composer template and a real saved-posts shortcut complement existing polls, reactions and ticker threads. No trading, leaderboard, rewards, synthetic volume or price prediction was added.

## Primary references

- [X search](https://help.x.com/en/using-x/x-search): account, post and topic search informed separate people/company/topic results.
- [X blocking](https://help.x.com/en/using-x/blocking-and-unblocking-accounts): profile-level block management informed the unblock gate. Continua follows the user's requested hide-until-unblock behavior, not every detail of X's current public visibility policy.
- [X lists](https://help.x.com/en/using-x/x-lists): curated reading informed watchlist discussion shortcuts rather than copying a proprietary UI.

No schema migration is required for these changes. Existing report and block RPCs remain in use.

## Live verification follow-up

The deployed overview temporarily failed on a fresh reload, then recovered automatically and returned 12/12 holdings. Render logs showed concurrent slow database reads (including a 6s holdings query), 500 responses for news/quotes, and an 8s successful overview. Unopened tabs previously started all per-company feeds at once. Tab-specific feeds now load on demand, and benchmark work waits for Analysis, reducing startup contention; this is not a promise that free hosting cannot stall. The report menu was verified dismissed with the report form open; no report was submitted. The followers overlay filled the entire desktop viewport with handles and clean tabs. iOS keyboard behavior still needs device testing.
