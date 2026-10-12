# Authentication design refresh

The user-supplied curved-header mobile reference informed a responsive
Continua design, rather than copying its name or other social providers.
Mobile uses a dark curved introduction; desktop uses a quiet two-column
layout. The old decorative image is removed from authentication. The
existing Continua mark, Inter font and lavender accent remain.

Research: [W3C form labels](https://www.w3.org/WAI/tutorials/forms/labels/),
[form guidance](https://www.w3.org/WAI/tutorials/forms/) and
[Google sign-in best practices](https://developers.google.com/identity/siwg/best-practices).
Visible associated labels supplement placeholders; password-manager
autocomplete, keyboard focus and reduced-motion support are retained.
The Google mark uses its multicolour design on a neutral button with a
clear action label. Email form comes before Google in both visual and
keyboard order. No new identity SDK or OAuth permissions are introduced.

Google is the only social provider shown. No Facebook or Apple button is
added. Age/Terms acknowledgement remains signup-only. Password strength,
email confirmation, reset flow and configured CAPTCHA forwarding are
unchanged. This is a design refresh, not a claim of certified accessibility
or verified age; the underlying OAuth declaration limitations remain as
documented in the legal/security report.
