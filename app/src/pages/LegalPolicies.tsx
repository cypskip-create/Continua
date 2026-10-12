import { Link } from "react-router-dom";
import { LEGAL_POLICY_VERSION, SUPPORT_EMAIL } from "@/lib/legalPolicy";
type Section = "terms" | "privacy" | "copyright" | "billing";
const policies: Record<
  Section,
  { title: string; sections: [string, string][] }
> = {
  terms: {
    title: "Terms of service",
    sections: [
      [
        "Service and eligibility",
        "Continua provides NSE-focused research, manually recorded portfolio tracking and community discussions for adults 18 and older. It does not execute trades, hold investment funds or provide a guarantee of returns. Your age declaration is self-attested; do not create an account if you are under 18.",
      ],
      [
        "Research limitations",
        "Prices and filings can be delayed, incomplete or corrected. Ratings, scenarios, probability notebooks and model outputs are research illustrations, not personalized investment instructions or promises. Check original sources and consider independent professional advice. A disclaimer does not remove obligations imposed by applicable law.",
      ],
      [
        "Account and community responsibilities",
        "Protect your credentials. Post only material you own or have permission to use. Do not publish confidential personal data, impersonation, harassment, scams, misleading promotions or market manipulation. Explain material conflicts and sponsorships. Community opinions are their authors’ views, not endorsed facts.",
      ],
      [
        "Content reports and account restrictions",
        "Use a post’s report control or the public copyright contact to identify problematic material. We may restrict or remove content and suspend repeat violations after review. Contact support to contest a mistake. Reports do not automatically establish infringement or wrongdoing.",
      ],
      [
        "Subscriptions and changes",
        "Review the selected plan, total price, access period and billing policy before payment. Renewals are manual; there is no automatic card or M-Pesa debit. Availability depends on source coverage. Material policy changes are dated; updated terms are presented at signup and checkout.",
      ],
      [
        "Your rights and disputes",
        `Contact ${SUPPORT_EMAIL} with a description of an account, billing or content issue. Do not send passwords, secret keys or full payment details. Nothing here waives mandatory consumer/privacy rights or excludes liability that applicable law does not allow us to exclude.`,
      ],
    ],
  },
  privacy: {
    title: "Privacy notice",
    sections: [
      [
        "Data and purposes",
        "We process account/profile details for authentication, portfolios/watchlists for tracking, posts and interactions for community features, and payment references for membership verification. Technical request/security logs help operate and protect the service. Public posts and profile information you choose to share can be visible to other users.",
      ],
      [
        "Optional personalization",
        "Engine interest learning is off by default. If enabled, company visits influence private research shortcuts. You can disable or reset it in Engine Preferences. Visits do not infer wealth, risk tolerance or investment suitability, and do not retrain financial models. Notification preferences are separate from marketing consent.",
      ],
      [
        "Processors and storage",
        "Infrastructure providers include Supabase, Render and Vercel; Paystack handles hosted payment checkout. We do not ask for full card numbers, PINs or CVVs in Settings. Some infrastructure can process data outside Kenya; contact support for provider/transfer information. Applicable transfer safeguards must be assessed by the operator.",
      ],
      [
        "Browser storage and tracking",
        "Essential browser storage supports sessions, saved research and device settings. Research journals may be stored only on your device. Third-party page analytics has been removed and no session-replay integration is configured in this release. Fonts are served with the app, not requested from Google Fonts.",
      ],
      [
        "Access, correction and deletion",
        `Use Settings for profile correction, available data exports and account deletion. Contact ${SUPPORT_EMAIL} for access, objection, correction or deletion requests that those controls do not cover. Exports identify their scope; do not assume a partial download contains all stored data. Certain billing/security records may require lawful retention. Deleting an account is not a request to reverse a completed payment.`,
      ],
      [
        "Children, marketing and complaints",
        "The service is intended for adults. If we learn that a child supplied personal data, contact support so we can investigate and handle it appropriately. No marketing email campaign is configured. Essential account/payment messages are distinct from optional promotion. You may also contact Kenya’s Office of the Data Protection Commissioner about privacy concerns.",
      ],
    ],
  },
  billing: {
    title: "Billing and refund enquiries",
    sections: [
      [
        "Prices and renewal",
        "Premium costs KES 800 for one month or KES 7,980 for one year. Premium Plus costs KES 1,000 for one month or KES 9,960 for one year (KES 830 monthly equivalent). Annual amounts are charged in one payment, not monthly instalments. Renewals are manual; access ends at membership expiry unless you choose another payment.",
      ],
      [
        "Switching tiers and missing coverage",
        "Renewing the same tier extends its expiry. Switching tiers starts a new term without automatic prorated credit. The checkout shows the exact amount before proceeding. A paid plan does not create missing filings, verified price history or guaranteed research outcomes.",
      ],
      [
        "Payment problems and refunds",
        `Do not pay again to troubleshoot a completed transaction. Retry verification or contact ${SUPPORT_EMAIL} with the payment reference. For duplicate, unauthorized, incorrect or undelivered-service charges, explain the issue for review. This page does not promise automatic refunds or override statutory cancellation/refund rights. Refund processing and any membership adjustment require a reviewed request; closing your account does not initiate a refund.`,
      ],
    ],
  },
  copyright: {
    title: "Copyright and content reports",
    sections: [
      [
        "Report content",
        `Email ${SUPPORT_EMAIL} with “Copyright report” in the subject. Identify the work and the exact Continua post/media URLs, your authority to act, contact details and the reason you believe the use is unauthorized. Include a good-faith statement, an accuracy/authority statement and your signature where required by the relevant process. Do not send government IDs or unrelated sensitive data.`,
      ],
      [
        "Review and disputes",
        "We review notices, can restrict access to disputed material and may ask for clarification. Affected authors can contact support with permission/licence evidence or a dispute. Repeated infringements can lead to account restrictions. A notice is not an automatic determination of legal liability.",
      ],
      [
        "Third-party sources and registration",
        "A publicly accessible PDF, image or webpage is not automatically licensed for commercial reuse. Data access and redistribution depend on the source’s permissions. This reporting contact does not by itself establish registration as a U.S. DMCA designated agent or safe-harbor eligibility. Registration and jurisdiction-specific procedures require the operator’s review.",
      ],
    ],
  },
};
export default function LegalPolicies({
  section = "terms",
}: {
  section?: Section;
}) {
  const p = policies[section];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl justify-between px-4 py-5">
        <Link to="/landing" className="font-semibold">
          Continua
        </Link>
        <Link to="/help" className="text-primary">
          Help & contact
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-16">
        <nav
          aria-label="Legal policies"
          className="flex flex-wrap gap-3 text-sm"
        >
          {(Object.keys(policies) as Section[]).map((k) => (
            <Link
              key={k}
              aria-current={k === section ? "page" : undefined}
              className="text-primary"
              to={k === "billing" ? "/billing-policy" : `/${k}`}
            >
              {policies[k].title}
            </Link>
          ))}
        </nav>
        <h1 className="text-3xl font-semibold">{p.title}</h1>
        <p className="text-xs text-muted-foreground">
          Version {LEGAL_POLICY_VERSION} · Continua service · Contact{" "}
          <a className="text-primary" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        {p.sections.map(([title, body]) => (
          <section key={title}>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </section>
        ))}
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Research and portfolio tracking. No trade execution. Capital is at
          risk.
        </p>
      </main>
    </div>
  );
}
