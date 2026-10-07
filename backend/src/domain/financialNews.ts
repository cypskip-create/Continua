/** Financial subject matter is required; publisher labels and ticker tags alone
 * are not evidence. Match substantive headlines/leads, not menus or related links. */
const FINANCIAL = /\b(stocks?|stock market|share price|shareholders?|shares? (?:rise|fall|gain|drop|rally|surge)|securities|nse|nairobi securities exchange|bonds?|treasur(?:y|ies)|banking|loans?|credit market|insurance|invest(?:ment|ors?|ing)|financ(?:e|ial)|econom(?:y|ic)|inflation|interest rates?|monetary|currenc(?:y|ies)|shilling|forex|exchange rates?|gdp|budget|tax(?:es|ation)?|debt|real estate|mortgage|rent(?:al)?|housing market|commodit(?:y|ies)|oil prices?|fuel|petrol|diesel|energy tariffs?|earnings|profits?|revenues?|dividends?|ipo|mergers?|acquisition|mobile money|pensions?|sacco|capital market|exports?|imports?|trade (?:deal|deficit|surplus|policy|war)|economic growth)\b/i;
const OFF_TOPIC = /\b(killed|injured|banditry|cattle rustling|murder|passenger dies|road accident|car crash|bus crash|pilgrims?|robbery|football|sports?|celebrity|entertainment|church service|obituary|birthday|wedding|livestock killed)\b/i;
const BUSINESS_ACTIVITY = /\b(launch(?:es|ed)?|expands?|expansion|services?|network|operations?|customers?|regulator|licen[sc]e|contract|business|strategy|capacity|production|distribution|supply|demand|construction|property|properties|employment|jobs|wages|manufactur(?:ing|er)|tourism|retail|telecom)\b/i;
export function isFinancialNews(headline: string, excerpt = "", hasLinkedSecurity = false): boolean {
  const title = headline.replace(/<[^>]*>/g, " ");
  const lead = excerpt.replace(/<[^>]*>/g, " ").split(/related (?:stories|articles)|also read|read also|recommended|subscribe|cookie/i)[0]!.slice(0, 400);
  // General crime/sports incidents must not enter just because a bank, airline,
  // or a business publisher is named. Explicit financial consequences can qualify.
  if (OFF_TOPIC.test(title)) return FINANCIAL.test(title);
  if (FINANCIAL.test(title)) return true;
  if (OFF_TOPIC.test(lead)) return false;
  return FINANCIAL.test(lead) || (hasLinkedSecurity && BUSINESS_ACTIVITY.test(title + " " + lead));
}
