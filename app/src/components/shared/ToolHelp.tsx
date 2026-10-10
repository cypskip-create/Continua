import { InfoTip } from '@/components/portfolio/InfoTip';
const explanations: Record<string,string> = {
  'Continua Value Signal': 'The stars compare the current price with our model values. More stars mean a larger gap below those values, not a promise that the price will rise. Check the inputs and missing data before using it.',
  'Basic price forecast': 'This chart shows an example of how the price could move toward the model value. It is a calculation based on assumptions, not an analyst target or a prediction.',
  'Inside the star rating': 'See which models produced the rating and how their assumptions affect it. If the models disagree or inputs are missing, treat the rating with more caution.',
  'Growth × margin scenario lab': 'Try different sales growth and profit margins to see possible results. You choose the assumptions; the tool does not assign a chance of them happening.',
  'Growth quality': 'Compare growth across reported years. This helps you see whether growth is steady, slowing, or driven by a single year. Missing years can limit the comparison.',
  'Risk snowflake': 'A quick picture of the risks we can measure, such as debt and price volatility. A missing section means we do not have enough evidence—not that the risk is zero.',
  'Volatility and drawdown': 'Volatility measures how much prices move. Drawdown shows how far the price fell from a previous peak. Both describe the past; neither predicts the next fall.',
  'Scenario forecast': 'Change the growth assumptions to explore possible future figures. These are examples, not forecasts from company management or analysts.',
  'Return on capital': 'See how much profit the company generates from its assets or invested capital. Compare the same measure across similar companies and years.',
  'Valuation sensitivity': 'Change the earnings or valuation multiple to see how the estimated value changes. Small changes in assumptions can produce very different answers.',
  'Evidence': 'Check where the information came from, when it was published, and what is still missing before drawing a conclusion.',
  'Technicals': 'Look at past price and trading-volume patterns. These signals can help frame a question, but they do not guarantee what the price will do next.',
  'Forecast': 'Explore the estimates and assumptions behind possible future results. We keep reported facts separate from scenarios and show when estimates are unavailable.',
  'Briefing': 'Start here for a short company summary based on the available filings and quotes. Follow the supporting evidence before making a decision.',
  'Earnings & Reports': 'Compare what the company reported across periods and check how profit turns into cash. Future estimates live in Forecast.',
  'Ownership': 'See the shareholders named in dated disclosures. A snapshot does not show who is buying or selling today.',
  'Peers': 'Compare companies using the same financial measure and reporting year. Differences in business models can still make a comparison imperfect.',
  'Portfolio': 'See how your holdings fit together, including concentration and measured risk. Results depend on the holdings and price history available.',
  'Monitoring': 'Set conditions you want to watch and review the last check. An alert asks you to look closer; it is not an instruction to trade.',
  'Journal': 'Write down your reasoning and the evidence that could change your mind. Use the review date to check whether your original view still holds.',
  'Ask Engine': 'Ask a specific research question and check the sources in the answer. Answers may be incomplete or wrong, so verify important facts.',
  'Scenario lab': 'Test your own assumptions about growth and margins. The results show what those assumptions imply, not how likely they are.',
};
export function ToolHelp({tool,description}:{tool:string;description?:string}) {
  const text=description??explanations[tool];
  if(!text)return null;
  return <InfoTip label={`About ${tool}`}>{text}</InfoTip>;
}
