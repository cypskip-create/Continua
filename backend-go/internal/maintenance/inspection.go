package maintenance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
)

// Inspect is a fixed, read-only operator query registry, not an arbitrary SQL
// endpoint. Responses contain no credentials, user records or extracted text.
func Inspect(ctx context.Context, db *sql.DB, operation, source, symbol string) (json.RawMessage, error) {
	if db == nil || !regexp.MustCompile(`^[A-Za-z0-9._-]{1,200}$`).MatchString(source) || !regexp.MustCompile(`^[A-Z0-9.-]{1,20}$`).MatchString(symbol) {
		return nil, errors.New("invalid inspection scope")
	}
	queries := map[string]string{
		"history-inventory": `SELECT jsonb_build_object(
 'downloads',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT source_id,status,count(*) AS count FROM scraping.document_jobs GROUP BY source_id,status ORDER BY source_id,status LIMIT 1000)x),'[]'::jsonb),
 'archiveYears',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT archive_url,archive_year,cardinality(pages) AS discovered_pages,cardinality(completed_pages) AS completed_pages FROM scraping.archive_checkpoints ORDER BY archive_url,archive_year LIMIT 1000)x),'[]'::jsonb),
 'reviews',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT source,status,count(*) AS count FROM market.financial_statement_candidates GROUP BY source,status ORDER BY source,status LIMIT 1000)x),'[]'::jsonb),
 'automaticValidations',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT outcome,reason,count(*) AS count FROM (SELECT DISTINCT ON(extraction_id) outcome,reason FROM market.document_validations ORDER BY extraction_id,validated_at DESC) latest GROUP BY outcome,reason ORDER BY outcome,count(*) DESC LIMIT 100)x),'[]'::jsonb),
 'financialPeriods',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT s.symbol,p.fiscal_year,p.period_type,count(i.period_id) AS income,count(b.period_id) AS balance,count(c.period_id) AS cashflow FROM market.financial_periods p JOIN market.securities s ON s.id=p.security_id LEFT JOIN market.income_statements i ON i.period_id=p.id LEFT JOIN market.balance_sheets b ON b.period_id=p.id LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id WHERE p.fiscal_year>=2015 GROUP BY s.symbol,p.fiscal_year,p.period_type ORDER BY s.symbol,p.fiscal_year LIMIT 10000)x),'[]'::jsonb))`,
		"filing-publication": `SELECT jsonb_build_object(
 'securityId',$1::text,
 'earnings',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT fiscal_year,fiscal_quarter,reported_date,eps_actual,revenue_actual FROM market.earnings_events WHERE security_id=$1 ORDER BY fiscal_year DESC,fiscal_quarter DESC NULLS LAST LIMIT 3)x),'[]'::jsonb),
 'history',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT p.fiscal_year,p.period_end,p.reported_at,i.revenue,i.eps,c.free_cash_flow FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id=p.id LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id WHERE p.security_id=$1 AND p.period_type='annual' ORDER BY p.fiscal_year DESC LIMIT 100)x),'[]'::jsonb),
 'validation',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT DISTINCT ON(v.extraction_id) v.extraction_id,v.validator_version,v.outcome,v.reason FROM market.document_validations v JOIN market.financial_statement_candidates c ON c.scraped_extraction_id=v.extraction_id WHERE c.security_id=$1 ORDER BY v.extraction_id DESC,v.validated_at DESC LIMIT 100)x),'[]'::jsonb))`,
		"payment-schema": `SELECT jsonb_build_object('profilesExist',to_regclass('public.profiles') IS NOT NULL,'liveOrdersExist',to_regclass('public.paystack_live_orders') IS NOT NULL,'nativeAttemptsExist',to_regclass('public.paystack_native_attempts') IS NOT NULL,'renewalsExist',to_regclass('public.paystack_card_renewals') IS NOT NULL)`,
		"index-freshness": `SELECT jsonb_build_object(
 'source',(SELECT to_jsonb(x) FROM (SELECT id,enabled,config->>'schedule' AS schedule,config->>'revisitAfterMinutes' AS revisit_minutes FROM scraping.sources WHERE id=$1)x),
 'latestCrawl',(SELECT to_jsonb(x) FROM (SELECT status,http_status,last_crawled,last_changed FROM scraping.crawl_state WHERE source_id=$1 ORDER BY last_crawled DESC NULLS LAST LIMIT 1)x),
 'latestNewContent',(SELECT max(retrieved_at) FROM scraping.raw_artifacts WHERE source_id=$1),
 'indices',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT code,event_timestamp,updated_at FROM market.indices WHERE exchange='NSE' ORDER BY code LIMIT 100)x),'[]'::jsonb))`,
		"publisher-coverage": `SELECT jsonb_build_object(
 'source',(SELECT to_jsonb(x) FROM (SELECT id,enabled,redistribution_allowed,config->>'permissionReference' IS NOT NULL AS has_permission FROM scraping.sources WHERE id=$1)x),
 'extractions',(SELECT jsonb_build_object('count',count(*),'newest',max(e.extracted_at)) FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE a.source_id=$1),
 'jobs',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT status,count(*) AS count FROM scraping.document_jobs WHERE source_id=$1 GROUP BY status)x),'[]'::jsonb),
 'candidates',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT status,count(*) AS count FROM market.financial_statement_candidates WHERE source=$1 GROUP BY status)x),'[]'::jsonb),
 'completedTabs',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT document->'context'->>'tab' AS tab,count(*) AS count FROM scraping.document_jobs WHERE source_id=$1 AND status='complete' GROUP BY tab ORDER BY tab LIMIT 100)x),'[]'::jsonb),
 'missingRegisteredTickers',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT DISTINCT document->'context'->>'ticker' AS ticker FROM scraping.document_jobs j WHERE source_id=$1 AND document->'context'->>'ticker' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM market.securities s WHERE s.exchange='NSE' AND s.symbol=CASE document->'context'->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE document->'context'->>'ticker' END) ORDER BY ticker LIMIT 1000)x),'[]'::jsonb))`,
		"history-coverage": `SELECT jsonb_build_object(
 'security',(SELECT to_jsonb(x) FROM (SELECT s.id,s.symbol,s.status,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.id=$1)x),
 'periods',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT p.fiscal_year,p.period_type,p.period_end,p.reported_at,i.revenue,i.eps,i.net_income FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id=p.id WHERE p.security_id=$1 ORDER BY p.fiscal_year DESC,p.period_end DESC LIMIT 100)x),'[]'::jsonb),
 'quote',(SELECT to_jsonb(x) FROM (SELECT last_price,event_timestamp,source FROM market.live_quotes WHERE security_id=$1)x),
 'recentDailyBars',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT bar_time,close,volume,source_url FROM market.candles WHERE security_id=$1 AND interval='1d' ORDER BY bar_time DESC LIMIT 10)x),'[]'::jsonb))`,
		"archive-coverage": `SELECT jsonb_build_object(
 'sourceId',$1::text,'storage',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT CASE WHEN storage_path LIKE 'r2://continua-financial-documents/%' THEN 'private-r2' ELSE 'non-r2' END AS storage,count(*) AS count FROM scraping.raw_artifacts WHERE source_id=$1 GROUP BY 1)x),'[]'::jsonb),
 'queue',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT status,count(*) AS count FROM scraping.document_jobs WHERE source_id=$1 GROUP BY status)x),'[]'::jsonb))`,
	}
	query, ok := queries[operation]
	if !ok {
		return nil, errors.New("unknown native inspection")
	}
	var args []any
	switch operation {
	case "payment-schema", "history-inventory":
	case "history-coverage", "filing-publication":
		args = []any{"NSE:" + symbol}
	default:
		args = []any{source}
	}
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SET LOCAL statement_timeout='12000ms'`); err != nil {
		return nil, err
	}
	var raw []byte
	if err = tx.QueryRowContext(ctx, query, args...).Scan(&raw); err != nil {
		return nil, err
	}
	if len(raw) > 1048576 || !json.Valid(raw) {
		return nil, errors.New("inspection response exceeds budget")
	}
	return json.RawMessage(raw), nil
}
