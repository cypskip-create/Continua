import { describe, expect, it } from "vitest";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/continua_test";
process.env.LOG_LEVEL ??= "fatal";
const { extractPdfText } = await import("../../src/extraction/pdfText.js");
function textPdf(lines:string[]) {
  const content = `BT /F1 12 Tf 40 750 Td ${lines.map((line,index)=>`${index ? "0 -20 Td " : ""}(${line}) Tj`).join("\n")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let output="%PDF-1.4\n"; const offsets=[0];
  for (const [index,object] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output+=`${index+1} 0 obj\n${object}\nendobj\n`; }
  const xref=Buffer.byteLength(output);
  output+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(v=>String(v).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}
describe("native PDF extraction",()=>{
  it("extracts real PDF bytes with aligned financial rows",async()=>{
    const result=await extractPdfText(textPdf(["Consolidated income statement", "Revenue 359433 340120", "Cost of sales 101216 95400", "Gross profit 258217 244720"]));
    expect(result.method).toBe("native_pdf_text");
    expect(result.text).toContain("Revenue");
    expect(result.tables[0]).toMatchObject({rows:expect.arrayContaining([{label:"Revenue",values:["359433","340120"]}])});
  });
  it("supports sequential documents without a shared PDF worker",async()=>{
    for(let i=0;i<3;i++) expect((await extractPdfText(textPdf(["A genuine reported company financial statement", "Total assets 200000 180000", "Total equity 150000 140000"]))).text).toContain("Total assets");
  });
});
