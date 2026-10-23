export const premiumMonitoringKinds=['price_below','price_above','debt_above','revenue_growth_below','earnings_growth_below','dividend_payout_above','daily_gain_above','daily_loss_below','volume_above'];
export const canMonitor=(plan,kind)=>plan==='premium_plus'||plan==='premium'&&premiumMonitoringKinds.includes(kind);
export const monitoringRuleLimit=plan=>plan==='premium_plus'?50:20;
