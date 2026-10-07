/**
 * Extracts approximate body text from an article page. This is a basic
 * heuristic — strip obviously non-content tags (script, style, nav,
 * header, footer, aside, forms) and take what's left — NOT a true
 * boilerplate-removal algorithm (Mozilla's Readability, for comparison,
 * scores DOM nodes by text density and link ratio). Good enough to
 * capture "there is real article content here" and roughly how much,
 * not good enough to guarantee clean prose free of nav-adjacent cruft.
 * Flagged honestly via a capped confidence rather than pretending this
 * is equivalent to a proper content-extraction library.
 */
import * as cheerio from "cheerio";

export function extractArticleBodyText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, form, iframe, noscript, svg, canvas").remove();

  const selectors = [
    "[itemprop='articleBody']", ".entry-content", ".post-content", ".article-content",
    ".story-body", ".article-body", "main article", "article", "main", "body",
  ];
  const root = selectors.map((selector) => $(selector).first()).find((node) => node.length > 0) ?? $("body");

  root.find([
    ".related", ".recommended", ".also-read", ".read-more", ".tags", ".tag-list",
    ".categories", ".breadcrumbs", ".share", ".social", ".newsletter", ".advert",
    ".advertisement", ".ticker", ".market-watch", "[role='navigation']",
    "[class*='related-']", "[class*='recommended-']", "[class*='ticker-']",
    "[id*='related-']", "[id*='ticker-']", ".jp-relatedposts", ".yarpp-related",
  ].join(",")).remove();

  // Paragraphs are substantially less likely than a container's complete
  // textContent to include menus, ticker rails and category clouds. Keep
  // headings only as a fallback because the RSS title is stored separately.
  const paragraphs = root.find("p").toArray()
    .filter(node => $(node).closest("li, [role='complementary']").length === 0)
    .map((node) => $(node).text().replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 20 && !/^(also read|read also|related|subscribe|follow us)\b/i.test(line))
    .filter(line => (line.match(/(?:\bKES\s*[\d,.]+|[+-]\d+(?:\.\d+)?%)/gi)?.length ?? 0) < 2);
  if (paragraphs.length > 0) {
    const heading = root.find("h1").first().text().replace(/\s+/g, " ").trim();
    return [heading, ...paragraphs].filter(Boolean).join("\n").trim();
  }

  return root
    .text()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}
