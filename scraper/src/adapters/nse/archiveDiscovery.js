import * as cheerio from "cheerio";
export function isOfficialNseUrl(raw) {
    try {
        const u = new URL(raw);
        return u.protocol === "https:" && ["nse.co.ke", "www.nse.co.ke"].includes(u.hostname) && !u.username && !u.password;
    }
    catch {
        return false;
    }
}
export function canonicalArchiveUrl(raw) {
    const url = new URL(raw);
    url.hash = "";
    if (!url.pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(url.pathname))
        url.pathname += "/";
    return url.href;
}
/** Follow the publisher's category/View All links, not an unrestricted site crawl. */
export function archiveCategoryLinks(html, pageUrl) {
    const $ = cheerio.load(html);
    const links = new Set();
    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (!href)
            return;
        let candidate;
        try {
            candidate = new URL(href, pageUrl);
        }
        catch {
            return;
        }
        if (!isOfficialNseUrl(candidate.href) || candidate.hash)
            return;
        if (!/^\/(listed-company-announcements|corporate-actions|press-releases|nse-events|success-stories|publications)(\/|$)/.test(candidate.pathname))
            return;
        const canonical = canonicalArchiveUrl(candidate.href);
        if (canonical !== canonicalArchiveUrl(pageUrl))
            links.add(canonical);
    });
    return [...links];
}
/** Reads the live publisher configuration; never guesses category IDs or nonce values.
 * Verified against NSE nse-downloads/assets/js/nse_list.js on 2026-10-10. */
export function archiveFormConfig(html, fromYear = 2015) {
    const $ = cheerio.load(html);
    let config;
    $("script:not([src])").each((_, element) => {
        const match = $(element).text().match(/var\s+wp_ajax\s*=\s*(\{[^;]+\})\s*;/);
        if (!match)
            return;
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.nse_id)
                config = parsed;
        }
        catch { /* Not a JSON configuration. */ }
    });
    if (!config || typeof config.ajaxurl !== "string" || !isOfficialNseUrl(config.ajaxurl) || typeof config.ajaxnonce !== "string")
        return null;
    const years = new Set();
    $("button.yearclick[data-year][data-cid]").each((_, el) => {
        const year = $(el).attr("data-year");
        if (/^20\d{2}$/.test(year) && Number(year) >= fromYear && Number(year) <= new Date().getUTCFullYear()
            && $(el).attr("data-cid") === String(config.nse_id))
            years.add(year);
    });
    return { endpoint: config.ajaxurl, security: config.ajaxnonce, category: String(config.nse_id),
        limit: String(config.limit ?? ""), expiry: String(config.expiry ?? ""), years: [...years].sort() };
}
export function archivePageNumbers(html) {
    const $ = cheerio.load(html);
    const pages = new Set();
    $(".nse_paginations div[id]").each((_, el) => {
        const id = $(el).attr("id");
        if (/^\d+$/.test(id) && Number(id) >= 1 && Number(id) <= 500)
            pages.add(Number(id));
    });
    return [...pages].sort((a, b) => a - b);
}
export function archiveDocuments(html, pageUrl, context = {}) {
    const $ = cheerio.load(html);
    // Avoid navigation/footer PDFs masquerading as company announcements.
    const elements = $("#ajax-content-wrap").length ? $("#ajax-content-wrap").find("h1,h2,h3,h4,a[href]") : $("h1,h2,h3,h4,a[href]");
    const documents = new Map();
    let heading = null;
    elements.each((_, el) => {
        const tag = el.tagName;
        if (tag && /^h[1-4]$/.test(tag)) {
            heading = $(el).text().trim() || heading;
            return;
        }
        const href = $(el).attr("href");
        if (!href || !/\.pdf(?:[?#]|$)/i.test(href))
            return;
        let url;
        try {
            url = new URL(href, pageUrl).href;
        }
        catch {
            return;
        }
        if (!isOfficialNseUrl(url))
            return;
        documents.set(url, { url, title: heading, discoveredFrom: pageUrl,
            context: { ...context, titleHeuristic: "nearest_preceding_heading", documentRole: "publisher_document" } });
    });
    return [...documents.values()];
}
