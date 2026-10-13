/**
 * Seeds (or updates) a source definition so there's something for
 * crawlSource()/the scheduler to work with. Sources are meant to
 * eventually be declared as code (one config module per adapter — §41);
 * this script remains the manual stand-in for that.
 *
 * Usage:
 *   npx tsx scripts/seedSource.ts \
 *     --id nse-generic-test \
 *     --name "NSE (generic crawl test)" \
 *     --adapter generic \
 *     --seed https://www.nse.co.ke/ \
 *     --domain nse.co.ke \
 *     [--schedule "0 6 * * *"] \
 *     [--rps 1]
 *
 * For an RSS source:
 *   npx tsx scripts/seedSource.ts --id my-feed --name "My Feed" \
 *     --adapter rss --feed-url https://example.com/feed.xml [--schedule <cron>] [--rps <number>]
 */
import { upsertSource } from "../src/storage/sourcesRepository.js";
import { pool } from "../src/storage/db.js";
function arg(name) {
    const idx = process.argv.indexOf(`--${name}`);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
}
async function main() {
    const id = arg("id");
    const name = arg("name");
    const adapter = arg("adapter") ?? "generic";
    const seed = arg("seed");
    const domain = arg("domain");
    const schedule = arg("schedule"); // cron expression; falls back to env.DEFAULT_CRAWL_CRON if omitted
    const requestsPerSecond = arg("rps") ? Number(arg("rps")) : undefined;
    const feedUrl = arg("feed-url");
    if (adapter === "rss") {
        if (!id || !name || !feedUrl) {
            console.error("Usage for --adapter rss: npx tsx scripts/seedSource.ts --id <id> --name <name> --adapter rss --feed-url <url> [--schedule <cron>] [--rps <number>]");
            process.exit(1);
        }
        await upsertSource({
            id,
            name,
            adapter,
            enabled: true,
            config: {
                feedUrl,
                ...(schedule ? { schedule } : {}),
                ...(requestsPerSecond !== undefined ? { requestsPerSecond } : {}),
            },
            termsUrl: null,
            robotsUrl: null,
            license: null,
            allowedUsage: null,
            redistributionAllowed: null,
            attributionRequired: null,
        });
        console.log(`Seeded RSS source '${id}' (feed: ${feedUrl}).`);
        await pool.end();
        return;
    }
    if (!id || !name || !seed || !domain) {
        console.error("Usage: npx tsx scripts/seedSource.ts --id <id> --name <name> --seed <url> --domain <allowed-domain> [--adapter generic] [--schedule <cron>] [--rps <number>]");
        process.exit(1);
    }
    await upsertSource({
        id,
        name,
        adapter,
        enabled: true,
        config: {
            seeds: [seed],
            allowedDomains: [domain],
            maxDepth: 2,
            ...(schedule ? { schedule } : {}),
            ...(requestsPerSecond !== undefined ? { requestsPerSecond } : {}),
            documents: { pdf: false, ocr: false, tables: false },
        },
        termsUrl: null,
        robotsUrl: null,
        license: null,
        allowedUsage: null,
        redistributionAllowed: null,
        attributionRequired: null,
    });
    console.log(`Seeded source '${id}'.`);
    await pool.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
