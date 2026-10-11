# Autonomous document processing — 11 October 2026

The authentication page now shares the research illustration with the public website. Browser smoke checks decode the asset and check responsive widths without contacting production.

## Runtime responsibilities

1. Scraper archive discovery runs on each source's existing publisher-aware schedule and enqueues document URLs durably.
2. An independent document drain runs every two minutes while the scraper service is awake. It re-reads enabled sources, shares the source lock with discovery, and processes up to ten NSE documents per run. It does not rediscover the entire archive to process already queued work.
3. Workers claim one report at a time instead of leasing a whole batch before processing. Failures return to the retry queue. Empty PDF extractions are not stored as successes; prior empty completed jobs are automatically requeued in bounded batches. Raw files remain in the configured private archive.
4. Generic-source extraction sweeps retain their schedule, recover existing empty PDF results, and likewise refuse new empty PDF successes. Database connection and query timeouts keep a disconnected collector from hanging forever. Failure of the optional legacy-recovery pass does not block already queued documents.
5. The backend's document publication worker starts at boot and runs every two minutes independently of the heuristic candidate bridge. It validates up to 25 latest extractions per run, oldest first, using versioned registered validators. The pipeline's single-flight and database advisory locks prevent duplicate publication.
6. Exact issuer, source provenance, dates, units, accounting reconciliation and canonical conflict checks remain mandatory. Candidate creation, financial publication and validation audit are in the same transaction. The worker records the reason when a record needs review and retries transaction failures on later ticks.
7. Published company records invalidate financial read and Engine caches and recompute derived research where a usable price exists. The app's existing history endpoints supply chart inputs; the backend does not manufacture missing bars, candles or estimates.

## Configuration

- Scraper: `DOCUMENT_DRAIN_CRON` defaults to `*/2 * * * *`; `DOCUMENT_DRAIN_BATCH_SIZE` defaults to 10, allowed 1–25. Existing `SCHEDULER_ENABLED` must be true.
- Backend: `DOCUMENT_PUBLICATION_CRON` defaults to `*/2 * * * *`; `DOCUMENT_PUBLICATION_BATCH_SIZE` defaults to 25, allowed 1–100.
- Defaults work without new private environment variables or schema migrations. Configured private storage and source permissions remain unchanged.

## Safety and honest limitations

This is automated extraction and publication for supported, validated layouts—not an instruction to fabricate figures. OCR-only financial rows, incomplete/native-truncated documents, unknown layouts, ambiguous issuer identity, mixed company/group columns and conflicting canonical values remain in review. Adding a tested validator version makes prior review records eligible for automatic re-evaluation; no operator has to approve the normal clean publication path.

Document validation uses only the latest extraction for an immutable artifact. The validator version is bumped for the incomplete-native guard; prior successful canonical records are not silently restated or deleted.

These services currently use Render's free web-service tier. In-process schedules operate only while the services are awake; they resume at startup and persisted queue checkpoints survive sleep/redeploy. True continuous unattended processing requires an always-on hosting plan. This change does not purchase one, add keep-alive workarounds or promise 24/7 ingestion.

No one-off production discovery, extraction, validation or publication command was used for this task. The deployed workers own the work. Tests use mocked queues/transactions and local PDF fixtures; live observation, if performed, is read-only.
