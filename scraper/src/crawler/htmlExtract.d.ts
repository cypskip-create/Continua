export interface DiscoveredLink {
    url: string;
    kind: "a" | "iframe" | "embed" | "object" | "canonical" | "alternate";
}
export interface PageMetadata {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    openGraph: Record<string, string>;
    jsonLd: unknown[];
    publishedAt: string | null;
    modifiedAt: string | null;
    author: string | null;
}
export interface HtmlExtraction {
    links: DiscoveredLink[];
    metadata: PageMetadata;
}
export declare function extractFromHtml(html: string, pageUrl: string): HtmlExtraction;
