export const STOCK_TABS = ['Summary', 'Financials', 'Statistics', 'News', 'Corporate Actions', 'Historical Data', 'Holders', 'Files'];
export const FINANCIAL_CATEGORIES = ['Profit/Loss', 'Cash Flow', 'Assets', 'Liabilities', "Shareholder's Equity"];
/** Job identity includes category; each view is independently resumable. */
export function stockTabDocuments(stockUrl, tabs = STOCK_TABS, categories = FINANCIAL_CATEGORIES) {
    let base;
    try {
        base = new URL(stockUrl);
    }
    catch {
        return [];
    }
    base.search = '';
    base.hash = '';
    if (base.origin !== 'https://kenyanstocks.com' || !/^\/stock\/nse\/[A-Z0-9-]+$/.test(base.pathname))
        return [];
    const ticker = base.pathname.split('/').at(-1);
    const financialCategories = [...new Set(categories)].filter(category => /^[A-Za-z /'&-]{1,60}$/.test(category));
    return [...new Set(tabs)].filter(tab => /^[A-Za-z /'&-]{1,60}$/.test(tab)).flatMap(tab => (tab === 'Financials' ? financialCategories : [null]).map(category => {
        const url = new URL(base);
        url.searchParams.set('tab', tab);
        if (category)
            url.searchParams.set('category', category.toLowerCase());
        return { url: url.href, title: `${ticker} · ${tab}${category ? ' · ' + category : ''}`, discoveredFrom: base.href, context: { ticker, tab, category, historyStart: tab === 'Historical Data' ? '2015-01-01' : null } };
    }));
}
