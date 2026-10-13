/**
 * Generic HTML extraction (§33): links worth following, plus whatever
 * metadata a page exposes about itself (title, OpenGraph, JSON-LD, ...).
 * This has NO source-specific knowledge — NSE-specific rules belong in
 * an adapter (Phase 2), not here.
 */
import * as cheerio from "cheerio";
import { resolveUrl } from "./urlNormalize.js";
function pushLink(links, baseUrl, href, kind) {
    if (!href)
        return;
    const resolved = resolveUrl(baseUrl, href);
    if (resolved)
        links.push({ url: resolved, kind });
}
export function extractFromHtml(html, pageUrl) {
    const $ = cheerio.load(html);
    const links = [];
    $("a[href]").each((_, el) => pushLink(links, pageUrl, $(el).attr("href"), "a"));
    $("iframe[src]").each((_, el) => pushLink(links, pageUrl, $(el).attr("src"), "iframe"));
    $("embed[src]").each((_, el) => pushLink(links, pageUrl, $(el).attr("src"), "embed"));
    $("object[data]").each((_, el) => pushLink(links, pageUrl, $(el).attr("data"), "object"));
    $('link[rel="canonical"][href]').each((_, el) => pushLink(links, pageUrl, $(el).attr("href"), "canonical"));
    $('link[rel="alternate"][href]').each((_, el) => pushLink(links, pageUrl, $(el).attr("href"), "alternate"));
    const openGraph = {};
    $('meta[property^="og:"]').each((_, el) => {
        const prop = $(el).attr("property");
        const content = $(el).attr("content");
        if (prop && content)
            openGraph[prop] = content;
    });
    const jsonLd = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).contents().text();
        try {
            jsonLd.push(JSON.parse(raw));
        }
        catch {
            // Malformed JSON-LD is common in the wild — skip rather than fail the whole extraction.
        }
    });
    const canonicalHref = $('link[rel="canonical"]').attr("href");
    const metadata = {
        title: $("title").first().text().trim() || openGraph["og:title"] || null,
        description: $('meta[name="description"]').attr("content") ?? openGraph["og:description"] ?? null,
        canonicalUrl: canonicalHref ? resolveUrl(pageUrl, canonicalHref) : null,
        openGraph,
        jsonLd,
        publishedAt: $('meta[property="article:published_time"]').attr("content") ??
            $('meta[name="date"]').attr("content") ??
            null,
        modifiedAt: $('meta[property="article:modified_time"]').attr("content") ?? null,
        author: $('meta[name="author"]').attr("content") ?? null,
    };
    return { links, metadata };
}
