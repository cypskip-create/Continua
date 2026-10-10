import { readFile } from "node:fs/promises";
import { draftCbkBondReport } from "../src/ingestion/normalizers/cbkBondReport.js";
const [file,url]=process.argv.slice(2);
if(!file || !url) throw new Error("Usage: tsx scripts/draftBondReport.ts extracted-layout.txt official-source-url. Draft only; review before importing.");
console.log(JSON.stringify(draftCbkBondReport(await readFile(file,"utf8"),url),null,2));
