export const websiteFeatures = {
 'company-research': {
  label:'Company research', title:'Understand the business behind the share price.',
  lead:'Bring company financials, valuation, ownership and forecasts into one research workflow. Start with the reported facts, then explore your own assumptions.',
  image:'/landing/stock-research.webp',alt:'Financial research with company statements, valuation and annual reports',imageNote:'Illustrative stock research artwork',
  sections:[
   ['Read the company’s financial history','Explore income statements, balance sheets and cash flow across available reporting periods. Compare like-for-like periods and follow the dates attached to reported figures. Missing financials remain unavailable rather than being treated as zero.'],
   ['Put valuation in context','Review valuation measures, dividends, financial strength and Continua’s own value signals. A rating appears only when the underlying information is sufficient. These are research tools, not guarantees about future prices.'],
   ['Explore the questions that matter','Investigate growth, profitability, ownership and dividend sustainability. Use company news alongside the business figures to understand what changed and what needs a closer look.'],
   ['Test assumptions in Forecast and Engine','Explore available estimates and calculated scenarios. Change supported inputs to see how assumptions affect an outcome, and compare scenarios rather than treating one result as a promise. Premium Plus adds the full Engine analysis workspace.'],
  ],
  steps:['Open Markets and choose a company.','Read Fundamentals and compare the available financial periods.','Use Forecast or Engine to investigate a question and save your research.'],
  access:'Free includes Fundamentals for five distinct stocks per month, with revisits to those stocks. Premium adds expanded company and forecast research, including Engine company research and Evidence. Premium Plus adds the full Engine analysis and workspace tools.',
  note:'Coverage varies by company and reporting period. Continua’s ratings and scenarios are proprietary research aids, not investment advice.',
 },
 'markets-charts': {
  label:'Markets & charts',title:'Follow the market. Find your focus.',
  lead:'Move from the Nairobi Securities Exchange overview to individual companies, price history, watchlists and comparisons without losing the wider context.',
  sections:[
   ['Start with market activity','Review available NSE indices, shares traded, equity turnover and ETF activity. Trading dates help you distinguish a reported close from a new session. Market data is displayed as available; it is not a promise of streaming exchange prices.'],
   ['Explore charts in your own way','Switch timeframes and use supported line, area and candlestick views. Drag across a chart to inspect dated observations. Where intraday history or complete candle data is unavailable, the app keeps that limitation visible.'],
   ['Narrow the field','Use stock screening and sector heatmaps to find companies for further investigation. Compare companies side by side, review their financial context and keep the ones that interest you in a watchlist.'],
   ['Connect market moves to your holdings','Follow watchlist movers, company news and your portfolio charts. Portfolio history values today’s holdings at historical closing prices; it does not recreate past trades, cash flows or dividends.'],
  ],
  steps:['Open Markets for the latest available exchange overview.','Choose a company, timeframe or comparison.','Save a watchlist and use the underlying company research to investigate further.'],
  access:'Core watchlists, market views and charts are available on Free. Expanded company research and portfolio analysis depend on your active plan. A subscription does not turn delayed or unavailable source data into live exchange data.',
  note:'Financial-market coverage and freshness vary by source and instrument. Missing observations are not invented to complete a chart.',
 },
 monitoring: {
  label:'Monitoring',title:'Keep the important changes in view.',
  lead:'Set the conditions you care about and bring stock alerts, dividend dates, earnings events and research monitoring into your daily routine.',
  sections:[
   ['Set a clear price condition','Choose a stock and set an alert above or below your target. Review, edit or disable your alerts as your research changes. An alert helps you revisit a decision; it does not place a trade.'],
   ['Add technical conditions where supported','Paid-plan tools include supported RSI thresholds and moving-average crossover alerts. Choose the relevant periods and direction rather than relying on an unexplained signal. Available observations determine whether a condition can be evaluated.'],
   ['Plan around company events','Follow available earnings dates and confirmed dividend information. Use the calendar and your income research together to keep company events connected to your holdings.'],
   ['Keep a research watch with Engine','Use the monitoring and saved-research workspace available with Premium Plus to follow the companies and questions that matter to you. Review changes alongside your original assumptions and research notes.'],
  ],
  steps:['Open a stock’s alert controls or the alert manager.','Choose a supported condition and enter your threshold.','Review notifications and revisit the underlying company research when an alert triggers.'],
  access:'Alert availability and limits depend on your plan. Premium includes advanced alert tools; Premium Plus includes the full Engine monitoring workspace. Check the in-app membership and alert controls for your current allowance.',
  note:'Alerts depend on available data, evaluation schedules and notification delivery. They are not guaranteed immediate execution signals and never place trades.',
 },
} as const;
export type WebsiteFeature = keyof typeof websiteFeatures;
