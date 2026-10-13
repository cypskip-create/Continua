import { pool } from "../storage/db.js";
export async function checkHealth() {
    try {
        await pool.query("SELECT 1 FROM scraping.sources LIMIT 1");
        return { status: "ok", database: "ok", timestamp: new Date().toISOString() };
    }
    catch {
        return { status: "degraded", database: "unreachable", timestamp: new Date().toISOString() };
    }
}
