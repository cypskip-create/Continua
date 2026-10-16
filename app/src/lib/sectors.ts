/** Match display/official sector spellings without guessing issuer membership. */
export function sectorKey(name: string) {
  const key = name.normalize('NFKC').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const aliases: Record<string,string> = {
    agricultural: 'agriculture', energyandpetroleum: 'energy',
    manufacturingandallied: 'manufacturing', constructionandallied: 'construction',
    investmentservices: 'financialservices', realestateinvestmenttrusts: 'realestate',
    reits: 'realestate', exchangetradedfunds: 'commodities', automobilesandaccessories: 'industrials',
  };
  return aliases[key] ?? key;
}
export function sectorMembers<T extends {symbol:string;sector:string}>(directory:T[], name:string) {
  const key=sectorKey(name);
  return directory.filter(stock=>sectorKey(stock.sector)===key);
}
