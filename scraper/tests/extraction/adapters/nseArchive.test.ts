import { describe, expect, it } from "vitest";
import { archiveFormConfig, archivePageNumbers, archiveDocuments } from "../../../src/adapters/nse/archiveDiscovery.js";
const url = "https://www.nse.co.ke/listed-company-announcements/";
describe("NSE published archive form", () => {
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
