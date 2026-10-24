import { RollingNumber } from "@/components/shared/RollingNumber";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, ArrowUpRight, BookOpen, Code2, ShieldCheck } from "lucide-react";
import { ContinuaMark } from "@/components/shared/ContinuaMark";
import "./landing.css";
import "./websiteResources.css";

type Section = "docs" | "developers" | "about" | "help" | "trust";
const navigation: [Section, string][] = [["docs", "Documentation"], ["developers", "Developers"], ["about", "About Continua"], ["help", "Help"], ["trust", "Data & trust"]];
const titles: Record<Section, [string, string]> = {
  docs: ["A clearer way to use Continua.", "Practical guides to the app, its research tools and the numbers behind them."],
  developers: ["Build on evidence.", "A technical preview of Continua’s existing read API. External access is arranged individually, not included with an app subscription."],
  about: ["Built for a clearer perspective.", "Continua connects NSE company research, personal portfolio records and thoughtful market conversations."],
  help: ["Let’s make it simpler.", "Answers to common questions, with a clear next step when something isn’t working."],
  trust: ["Know what you’re looking at.", "Understand where the data comes from, what the Engine calculates and what remains uncertain."],
};
const guides = [
  ["start", "Start with the company", "Open Markets, choose an NSE ticker and visit Fundamentals. Financials shows reported statements; Forecast brings together value signals, growth, risk and calculated scenarios. A missing period means there is no validated data available—not zero revenue."],
  ["portfolio", "Build your portfolio record", "Add transactions you completed with your broker, including the date, quantity and cost. Continua tracks that record; it does not buy shares or hold your money. Check your inputs before interpreting returns or concentration."],
  ["engine", "Use the Engine", "Begin with Briefing, then inspect the statements, valuation and evidence behind it. Compare reported periods before trying a scenario. Assumptions are editable research inputs, not promises about future prices. Premium includes company research and evidence; Premium Plus adds the full analysis and workspace toolset."],
  ["charts", "Read a historical chart", "Look at the period, currency and source date. Annual and quarterly figures are not interchangeable. Missing years remain gaps; the Engine does not manufacture values to fill them. A restated comparative may replace an older figure after validation."],
  ["ratings", "Understand the Value Signal", "Continua’s proprietary star signal compares model fair values with the market price. Model agreement and usable inputs affect confidence. It is not a Morningstar rating or a buy/sell recommendation. Open Detailed Research for assumptions, sensitivity and coverage."],
  ["plans", "Choose your plan", "Free includes core tracking, watchlists and TradersHub, plus Fundamentals for five distinct stocks each month. Premium includes unlimited Fundamentals, all expanded Forecast details and company Engine research. Premium Plus includes the full Engine. Check the plan comparison for current prices and billing choices."],
  ["community", "Share a useful perspective", "Use TradersHub for company questions, evidence and investment theses. Check dates and distinguish your opinion from reported facts. Never share account credentials or someone else’s private portfolio; report spam or abusive content using the post menu."],
] as const;
const endpoints = [
  ["/quotes/SCOM", "Latest available quote"], ["/companies/SCOM", "Company profile"],
  ["/historical/SCOM?interval=1d", "Available OHLCV history"],
  ["/financials/SCOM/history?periodType=annual&limit=5", "Reported financial periods"],
  ["/announcements/SCOM?limit=20", "Company filings and announcements"],
  ["/dividends/SCOM", "Reported dividend actions"],
] as const;
export default function WebsiteResources({ section }: { section: Section }) {
  const [title, description] = titles[section];
  return <div className="continua-site website-resources">
    <Helmet><title>{navigation.find(([key]) => key === section)?.[1]} — Continua</title><meta name="description" content={description} /></Helmet>
    <a href="#resource-main" className="site-skip">Skip to content</a>
    <header className="site-header"><Link to="/landing" className="site-brand" aria-label="Continua website"><ContinuaMark size={40} appearance="light" /><span>Continua</span></Link><Link to="/auth" className="site-resource-app-link">Open the app <ArrowUpRight size={16} /></Link></header>
    <nav className="wr-nav site-wrap" aria-label="Resources">{navigation.map(([key, label]) => <Link key={key} to={`/${key}`} aria-current={key === section ? "page" : undefined}>{label}</Link>)}</nav>
    <main id="resource-main" className="site-wrap wr-main">
      <div className="wr-heading"><p className="site-kicker">CONTINUA RESOURCES</p><h1>{title}</h1><p>{description}</p></div>
      {section === "docs" && <><nav className="wr-topics" aria-label="Guide topics">{guides.map(([id, heading]) => <a href={`#${id}`} key={id}>{heading}</a>)}</nav><div className="wr-grid">{guides.map(([id, heading, text]) => <section id={id} key={id} className="wr-card"><BookOpen size={22} /><h2>{heading}</h2><p>{text}</p>{id === "plans" && <Link to="/landing#plans">Compare plans <ArrowRight size={16} /></Link>}</section>)}</div></>}
      {section === "developers" && <>
        <section className="wr-notice"><Code2 size={24} /><div><h2>Integration preview, not an open key signup</h2><p>The backend already supports authenticated reads. Before an external integration goes live, access, quotas and source redistribution rights must be agreed. Premium and Premium Plus are app plans—not API licences. There are no trade execution or payout endpoints in this preview.</p></div></section>
        <section className="wr-card"><h2>Quick start</h2><p>Use the base URL and scoped key supplied during onboarding. Keep the key on your server, never in a browser bundle, mobile app or public repository.</p><pre><code>{'curl "$CONTINUA_API_BASE_URL/quotes/SCOM" \\\n  -H "X-API-Key: $CONTINUA_API_KEY"'}</code></pre><p>Successful reads return a JSON <code>data</code> field. Handle 400 (invalid request), 401 (invalid key), 403 (access denied), 404 (no matching record), 429 (rate limit) and temporary 5xx failures. Use bounded retries with backoff; respect Retry-After when supplied. Coverage varies by company and period.</p></section>
        <section className="wr-card"><h2>Implemented read endpoints</h2><p>Paths below are relative to <code>/api/v1</code>. History uses reported data, not simulated candles or invented financial years.</p><div className="wr-endpoints">{endpoints.map(([path, label]) => <div key={path}><code>GET {path}</code><span>{label}</span></div>)}</div><a href="/developers/openapi.json" download>Download OpenAPI preview <ArrowRight size={16} /></a></section>
        <div className="wr-grid"><section className="wr-card"><h2>Personal research stays private</h2><p>Engine workspace routes require user authentication and the appropriate plan. A market-read API key does not grant access to anyone’s holdings, journal, monitoring or subscription. Never substitute a shared API key for a user’s session.</p></section><section className="wr-card"><h2>Before you ship</h2><p>Agree the permitted uses of the data, protect credentials, cache dated responses, show missing coverage honestly and test revoked-key and rate-limit handling. SDKs, self-service API billing and a public sandbox are not available yet.</p><a href="mailto:cypskip@gmail.com?subject=Continua%20API%20integration">Discuss an integration <ArrowUpRight size={16} /></a></section></div>
      </>}
      {section === "about" && <><div className="wr-grid"><section className="wr-card"><h2>Our focus</h2><p>Kenyan investors deserve research that connects the company, its financial history and their own portfolio. Continua brings those views together around Nairobi Securities Exchange instruments.</p></section><section className="wr-card"><h2>What Continua is—and isn’t</h2><p>A research, portfolio-tracking and community product. Not a broker, custodian, exchange or a promise of investment returns. Transactions are recorded manually after execution elsewhere.</p></section><section className="wr-card"><h2>The Engine’s job</h2><p>Turn validated source records into dated histories, ratios, research signals and portfolio context. Keep evidence separate from assumptions and leave unavailable data unavailable.</p></section><section className="wr-card"><h2>Help shape the product</h2><p>Report an issue, suggest a useful research workflow or ask about a collaboration. Include the ticker and period when reporting a data problem.</p><a href="mailto:cypskip@gmail.com?subject=Continua%20feedback">Contact Continua <ArrowUpRight size={16} /></a></section></div><Link className="lp-action" to="/docs">Explore the guides <ArrowRight size={18} /></Link></>}
      {section === "trust" && <div className="wr-grid">{[
        ["Reported, calculated, estimated", "Reported figures come from source records. Ratios and scenarios are calculated from those inputs. Estimates are a separate category and remain unavailable when there is no usable source. The Engine’s outputs should not be mistaken for issuer guidance."],
        ["Dates matter", "A quote’s source timestamp and a statement’s reporting period describe different things. Weekend or closed-market prices can be unchanged. Check freshness and coverage rather than treating every visible number as a live feed."],
        ["Validation before publication", "Discovery of a document is not proof that every figure inside it is usable. Extracted figures must pass issuer, period, unit and financial checks. Unsupported layouts and conflicting figures require review; archived documents can therefore exist before their charts are available."],
        ["Your account and payments", "Protect your account credentials and use the privacy controls in Settings. Subscription checkout is processed through Paystack; never send card details or secret keys in a support message. Review Settings → Terms & privacy and Your data for account policies and controls."],
        ["Coverage and limits", "Historical coverage is still expanding. A missing bar is not zero, a model value is not a guaranteed price, and a community post is not verified financial advice. No financial tool eliminates investment risk."],
        ["Correct a record", "Send the ticker, reporting period and original source when a figure looks wrong. For a technical failure, include the page address and an error screenshot without private account or payment details."],
      ].map(([heading, text]) => <section className="wr-card" key={heading}><ShieldCheck size={22} /><h2>{heading}</h2><p>{text}</p></section>)}</div>}
      {section === "help" && <><div className="wr-help">{[
        ["Paid, but a tool is still locked?", "Confirm you’re signed into the account used for checkout. Reopen the app once to refresh the plan. Don’t pay again to troubleshoot an existing payment. If access remains wrong, send the payment reference and account email to support—never your card number."],
        ["A chart has missing years", "Those periods may not yet have validated source records. Switching annual and quarterly views changes the period type; it doesn’t fill gaps. Send the issuer’s original report if you have a missing period."],
        ["A research page won’t load", "Check your connection, then use the page’s retry control. Cached records may remain visible while new data loads. If the issue repeats, share the ticker, page address and time with support."],
        ["Manage your account", "Open Settings for security, notifications, portfolio visibility, personalization, data export and account deletion. Use the subscription controls to review your plan and billing state."],
        ["New to financial research?", "Start with the company’s reported revenue, cash flow and debt before interpreting valuation or forecasts. Use the in-app Learn section and tool explanations; a scenario is an assumption to test, not a prediction to trust blindly."],
      ].map(([heading, text]) => <details key={heading}><summary>{heading}</summary><p>{text}</p></details>)}</div><section className="wr-notice"><div><h2>Still need a hand?</h2><p>Email a clear description, ticker and screenshot. Don’t include passwords, API keys or card details.</p><a href="mailto:cypskip@gmail.com?subject=Continua%20support">Email support <ArrowUpRight size={16} /></a></div></section></>}
    </main><footer className="site-footer site-wrap"><div className="wr-footer">{navigation.map(([key, label]) => <Link key={key} to={`/${key}`}>{label}</Link>)}<Link to="/landing#plans">Plans</Link></div><div className="site-resource-footer-bottom"><span>© <RollingNumber value={new Date().getFullYear()} /> Continua</span><span>Research is not investment advice. Capital is at risk.</span></div></footer>
    <nav aria-label="Legal policies" className="site-wrap flex flex-wrap gap-4 pb-6 text-xs"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/billing-policy">Billing policy</Link><Link to="/copyright">Copyright reports</Link></nav>
  </div>;
}
