package maintenance

import "errors"

// Explicitly registered postconditions prevent a generic SQL runner from silently
// dropping the privacy checks formerly supplied by individual operator scripts.
func ProtectionChecks(version string) ([]string, error) {
	private := func(table string) string {
		return "SELECT c.relrowsecurity AND NOT has_table_privilege('anon','" + table + "','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','" + table + "','SELECT,INSERT,UPDATE,DELETE') FROM pg_class c WHERE c.oid='" + table + "'::regclass"
	}
	switch version {
	case "20261018100000":
		return []string{"SELECT NOT has_function_privilege('anon','market.canonical_financial_history(text,text,integer,boolean)','EXECUTE') AND NOT has_function_privilege('authenticated','market.canonical_financial_history(text,text,integer,boolean)','EXECUTE')", "SELECT NOT has_function_privilege('anon','market.publisher_financial_history(text)','EXECUTE') AND NOT has_function_privilege('authenticated','market.publisher_financial_history(text)','EXECUTE')"}, nil

	case "20261011160000":
		return []string{"SELECT count(*)=1 FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.id='NSE:KUKZ' AND s.symbol='KUKZ' AND s.exchange='NSE' AND s.currency='KES' AND s.status='active' AND lower(c.name)='kakuzi plc'"}, nil
	case "20261010210000":
		return []string{private("public.paystack_live_orders"), "SELECT NOT has_function_privilege('authenticated','public.fulfill_paystack_live_order(text,bigint,timestamptz)','EXECUTE') AND NOT has_function_privilege('anon','public.fulfill_paystack_live_order(text,bigint,timestamptz)','EXECUTE')", "SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='continua-membership-expiry' AND active)"}, nil
	case "20261015110000":
		return []string{private("market.observed_daily_closes"), private("market.close_publication_receipts"), "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='market' AND tablename='observed_daily_closes' AND indexname='observed_daily_closes_lookup')"}, nil
	case "20261012030000":
		return []string{"SELECT c.relrowsecurity AND NOT has_table_privilege('anon','public.account_reports','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','public.account_reports','INSERT,UPDATE,DELETE') FROM pg_class c WHERE c.oid='public.account_reports'::regclass",
			"SELECT to_regprocedure('public.community_can_interact(uuid)') IS NOT NULL AND to_regprocedure('public.community_set_safety(uuid,text,boolean)') IS NOT NULL AND to_regprocedure('public.community_submit_report(text,uuid,text,text)') IS NOT NULL"}, nil
	case "20261012010000":
		return []string{private("market.engine_forecast_notebook"), "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='market.engine_forecast_notebook'::regclass AND tgname='forecast_rules_guard' AND NOT tgisinternal)"}, nil
	case "20261012011000":
		return []string{private("market.financial_version_audit"), "SELECT count(*)=4 FROM pg_trigger WHERE tgname='financial_version_capture' AND NOT tgisinternal"}, nil
	case "20261010220000":
		return []string{private("scraping.document_jobs"), private("scraping.archive_checkpoints"), private("market.price_history_sources"), "SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='scraper-raw' AND NOT public)"}, nil
	case "20261011211500":
		return []string{"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='market' AND table_name='candles' AND column_name='source_url' AND is_nullable='YES')"}, nil
	case "20261013090000":
		return []string{private("market.native_research_refresh"),
			"SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='market' AND tablename='native_research_refresh' AND indexname='native_research_refresh_due')",
			"SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='market' AND table_name='native_research_refresh' AND column_name IN('security_id','symbol','requested_version','requested_at','next_attempt_at','attempts','lease_token','lease_until','last_error')"}, nil
	case "20261012220000":
		return []string{private("public.paystack_native_attempts"), private("public.paystack_card_renewals")}, nil
	case "20261012020000":
		return []string{"SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='paystack_live_orders' AND column_name IN('terms_version','terms_accepted_at')"}, nil
	case "20261011110000":
		return []string{private("market.document_validations")}, nil
	case "20261011100000":
		return []string{private("market.invalid_filing_archive")}, nil
	case "20261011123000":
		return []string{"SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='market' AND is_nullable='YES' AND ((table_name='income_statements' AND column_name='eps') OR (table_name='cash_flow_statements' AND column_name='operating_cash_flow'))"}, nil
	default:
		return nil, errors.New("migration protection workflow is not registered; offline planning only")
	}
}
