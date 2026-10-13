"""Isolated native PDF text extraction. No network, database or billing access.

The parent owns the input temporary file and enforces the execution deadline.
This does not infer companies, units, dates or validated financial facts.
"""
import json
import os
import sys

MAX_INPUT = 50 * 1024 * 1024
MAX_TEXT = 8 * 1024 * 1024
MAX_PAGES = 500


def limit_resources():
    # Linux/Render limits supplement the parent's wall-clock/output limits.
    # Windows does not provide resource; the parent still enforces its deadline.
    if sys.platform != "win32":
        import resource
        for key, ceiling in [(resource.RLIMIT_AS, 256 * 1024 * 1024),
                             (resource.RLIMIT_CPU, 55)]:
            _, hard = resource.getrlimit(key)
            limit = ceiling if hard == resource.RLIM_INFINITY else min(ceiling, hard)
            resource.setrlimit(key, (limit, limit))


def extract(filename):
    import pdfplumber
    if os.path.getsize(filename) > MAX_INPUT:
        raise ValueError("input_limit")
    with open(filename, "rb") as source:
        if source.read(5) != b"%PDF-":
            raise ValueError("invalid_pdf")
    chunks = []
    row_chunks = []
    used = 0
    processed = 0
    with pdfplumber.open(filename) as document:
        total = len(document.pages)
        truncated = total > MAX_PAGES
        for page in document.pages[:MAX_PAGES]:
            # Preserve spatial layout rather than inventing column/year mappings.
            text = page.extract_text(layout=True) or ""
            row_text = page.extract_text(layout=False) or ""
            size = len(text.encode("utf-8")) + len(row_text.encode("utf-8"))
            if used + size > MAX_TEXT:
                truncated = True
                break
            chunks.append(text)
            row_chunks.append(row_text)
            used += size
            processed += 1
            page.close()
    return {"text": "\f".join(chunks), "tableText": "\n\f\n".join(row_chunks), "pageCount": processed,
            "truncated": truncated, "parserVersion": "pdfplumber-0.11.9-layout-v1"}


if __name__ == "__main__":
    try:
        limit_resources()
        if len(sys.argv) != 2:
            raise ValueError("input_required")
        print(json.dumps(extract(sys.argv[1]), ensure_ascii=True))
    except Exception:
        # Never log document text or arbitrary parser exceptions.
        print("PDF extraction failed", file=sys.stderr)
        sys.exit(1)
