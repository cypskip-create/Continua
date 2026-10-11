import { describe, expect, it } from "vitest";
import { archiveFormConfig, archivePageNumbers, archiveDocuments, archiveCategoryLinks, canonicalArchiveUrl } from "../../../src/adapters/nse/archiveDiscovery.js";
const url = "https://www.nse.co.ke/listed-company-announcements/";
describe("NSE published archive form", () => {
  it("follows home View All and official news categories without crawling unrelated links", () => {
    const html = `<a href="/listed-company-announcements">View All</a><a href="/press-releases/">View All</a>
      <a href="/nse-events/">Events</a><a href="/success-stories/">Success stories</a><a href="/publications/">Publications</a>
      <a href="/press-releases/">Duplicate</a><a href="/about-nse/">About</a><a href="https://evil.invalid/press-releases/">View All</a>
      <a href="https://www.nse.co.ke.evil.invalid/press-releases/">View All</a><a href="/press-releases/#top">Top</a>`;
    expect(archiveCategoryLinks(html, "https://www.nse.co.ke/")).toEqual([
      "https://www.nse.co.ke/listed-company-announcements/", "https://www.nse.co.ke/press-releases/",
      "https://www.nse.co.ke/nse-events/", "https://www.nse.co.ke/success-stories/", "https://www.nse.co.ke/publications/",
    ]);
  });
  it("treats empty fragments and slash variants as one archive without dropping year queries", () => {
    expect(canonicalArchiveUrl(`${url}#`)).toBe(url);
    expect(canonicalArchiveUrl("https://www.nse.co.ke/listed-company-announcements?year=2017#")).toBe(`${url}?year=2017`);
    expect(archiveCategoryLinks(`<a href="${url}#">2015</a><a href="${url.slice(0,-1)}">View All</a>`,url)).toEqual([]);
  });
  it("reads real year buttons and live configuration without guessed identifiers", () => {
    const html = `<script>var wp_ajax = {"ajaxurl":"https://www.nse.co.ke/wp-admin/admin-ajax.php","ajaxnonce":"fresh","nse_id":"15"};</script>
      <button class="yearclick" data-year="2015" data-cid="15">2015</button><button class="yearclick" data-year="2014" data-cid="15">2014</button><button class="yearclick" data-year="All" data-cid="15">All</button>`;
    expect(archiveFormConfig(html)).toMatchObject({ category: "15", security: "fresh", years: ["2015"] });
    expect(archiveFormConfig(html.replace("www.nse.co.ke/wp-admin", "evil.invalid/wp-admin"))).toBeNull();
  });
  it("follows actual numbered pagination, bounded and deduplicated", () => {
    expect(archivePageNumbers('<div class="nse_paginations"><div id="2">Next</div><div id="5">Last</div><div id="2">2</div><div id="99999">Bad</div></div>')).toEqual([2,5]);
  });
  it("keeps year/page provenance while excluding menu and external PDFs", () => {
    const docs = archiveDocuments('<nav><a href="/menu.pdf">Menu</a></nav><div id="ajax-content-wrap"><h3>Car &amp; General 2015</h3><a href="/uploads/report.pdf"></a><a href="https://evil.invalid/no.pdf"></a></div>', url, { archiveYear: 2015, archivePage: 2 });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ title: "Car & General 2015", context: { archiveYear: 2015, archivePage: 2 }, url: "https://www.nse.co.ke/uploads/report.pdf" });
  });
});
