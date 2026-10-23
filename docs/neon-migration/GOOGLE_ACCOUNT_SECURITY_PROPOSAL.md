# Google-only account security — proposed compatibility rule

Status: the user explicitly approved the exact guarded SDK setting and identity handlers. The candidate implementation and private OAuth freshness column are applied on isolated staging only. Production remains unchanged.

Automatic review initially rejected both a broader change and the narrower implementation. After the user explicitly approved `twoFactor({allowPasswordless: true})` and the guarded MFA/email handlers, the implementation was accepted and applied. The installed SDK boundary tests passed three checks: credential passwords remain required when the option is true; it only omits passwords for accounts without a credential password; the default false setting always requires a password.

The implementation leaves `verifyAccess.js` and its default recent-password checks unchanged. A separate private helper runs only for MFA enrollment/removal and email-change operations, plus the MFA-specific provider hooks. The SDK option is `twoFactor({allowPasswordless: true})`; the extra hooks reject passwordless operations unless the live account has no credential password, has a verified Google link, has server-recorded OAuth proof no older than five minutes, and has completed any enabled MFA.

The legacy edge `stepUpAllowed` accepts a provider-verified Google/OAuth authentication timestamp from the last ten minutes, together with enabled MFA. `AccountSecurity.tsx` tells Google-only users to sign in with Google again. The candidate narrows that Google-only proof window to five minutes. Frontend integration and a real Google browser sign-in passed on isolated staging, preserving the original owner UUID/profile and credential password.

Automatic approval review rejected an initial change enabling Better Auth's passwordless MFA option and treating recent OAuth as general freshness. The replacement proposal limits OAuth step-up to the existing account-security operations:

1. Keep recent-password verification as the general verifier's unchanged default. Use a separate helper for MFA enrollment/removal and email-change endpoints only.
2. Record `oauth_verified_at` privately, only after Better Auth verifies Google's callback signature, issuer, client audience, state/PKCE and verified email. Bind it to the actual database session and stable user ID. Never import old OAuth freshness or accept a browser-supplied timestamp.
3. If MFA is enabled, delete the callback's initial session and use the upstream pending challenge. Carry the original OAuth time in private, expiring challenge state; TOTP completion never refreshes it. Private access still requires live MFA proof.
4. Require OAuth proof from the last five minutes for Google-only security operations. Reject expired, future, revoked, wrong-user or wrong-session proof.
5. Before any passwordless MFA enrollment/removal, independently verify the current live session, the Google-linked account, absence of a credential password, and that bounded private OAuth proof. If MFA is already enabled, require its live proof too. Password accounts still need their password; Better Auth's `shouldRequirePassword` checks whether a credential password exists.
6. Keep OAuth token encryption, verified-local-and-Google same-email linking, unchanged user IDs, no forced trusted providers, confirmation of both addresses for email changes, and account-level MFA lockout.
7. Test password and Google-only cases, cross-user/session substitution, stale proof, revoked sessions, TOTP/JWT freshness substitution, pending challenge cancellation, and recovery revocation on isolated staging before any deployment.

Alternative: retain password-required security operations. Google-only users must establish a password through their verified email recovery before managing MFA or requesting an email change. Google sign-in itself remains available.

Staging fixture evidence: verified same-email linking preserves the original UUID and encrypts provider tokens; implicit signup and unverified Google email are rejected; explicit signup preserves legal metadata; Google MFA initially has no authenticated session; stale OAuth proof is not refreshed by TOTP or JWT issuance; fresh Google proof plus enabled MFA permits Google-only authenticator removal. The callback fixtures use synthetic Google tokens/JWKS. A separate real browser staging login subsequently passed account-continuity checks; its protected receipt is distinct from these fixtures. No production deployment or email activation is part of this implementation.

References:
- Existing `infra/cloudflare/session.mjs`: `stepUpAllowed`.
- Existing `app/src/components/security/AccountSecurity.tsx`: Google-only account guidance.
- Installed Better Auth 1.7.12 `dist/utils/password.mjs`: `shouldRequirePassword`.
- https://better-auth.com/docs/plugins/2fa
- https://better-auth.com/docs/concepts/plugins
