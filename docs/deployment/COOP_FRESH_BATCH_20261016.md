# Verified fresh COOP financial batch — 16 October 2026

Actions run 38938086234, commit fcfadea, completed successfully:

- Exact registered source kenyanstocks, issuer COOP, fresh Financials batch.
- Five planned views discovered, fetched, archived and extracted; zero failures.
- Existing automatic post-collection Python Engine processing produced five
  financial datasets and 83 chart series in Supabase, not manual transcription.
- Availability receipts confirm one nonempty table per category: Profit/Loss,
  Cash Flow, Assets, Liabilities and Shareholder's Equity.
- Source collection timestamps range 17:14:59–17:15:44 UTC on 16 October.
- Logical transfer counters: 3,677,626 download bytes and 856,353 upload bytes;
  64 MiB run reservation, zero retries. These counters are not an invoice meter.
- Daily repository variable is now 201326592 bytes (192 MiB), explicitly approved
  by the owner as an additional 64 MiB daily. No reservation counter was reset.

Verified in the deployed authenticated app at `/stock/COOP`: Fundamentals →
Financials → Publisher financial tables · KenyanStocks. All five categories
display 2024, 2023, 2022, 2021 columns and collection date 16 October 2026. The
Profit/Loss table displays the source's Total Profit/Loss row as 25.46 B,
23.19 B, 22.04 B, 16.54 B respectively. These values were read from the actual
app DOM after processing, not seeded into application code.

This proves the Financials batch and table delivery, NOT completion of every
other COOP tab, every issuer, unknown PDF accounting validation or full native
production cutover. Generated chart series are available to API/Engine readers;
this verification concerns the financial tables actually rendered in the app.
Canonical verified statements/ratios are not overwritten by publisher rounding.
No historical evidence was deleted and no source collection used Render.
