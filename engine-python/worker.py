from continua_engine.risk_intelligence import simulate_risk, stock_risk
"""Bounded native worker protocol. stdin/stdout only; no provider credentials."""
import json
import pathlib
import sys
from continua_engine.market_statistics import market_statistics
from continua_engine.filing_draft import filing_draft
from continua_engine.notebook import validate_forecast,private_calibration
from continua_engine.market_intelligence import analyse_market
from continua_engine.advanced import run_advanced
from continua_engine.labs import lab_calculation,earnings_lab,stress_workspace
from continua_engine.portfolio_workspace import snapshot_plan,portfolio_workspace
from continua_engine.calculated_answer import calculated_answer,assistant_answer,assistant_evidence,validate_assistant_answer
from continua_engine.feed_mapping import map_feed,normalize_feed,map_fundamentals,normalize_fundamentals_bundle,map_nse_batch,map_nse_fundamentals
from continua_engine.execution import simulate_execution, backtest, volume_profile
from continua_engine import indicators, ratios, valuation, preferences, monitoring, dividends, portfolio, reported, candles, publisher, risk, analytics, publication, reports, briefing, safaricom, registered_reports, cbk, document_plan, readiness, research_components, bundle, news, valuation_models, research_snapshot

OPERATIONS = {"stock_risk":stock_risk,"risk_simulation":simulate_risk,"market_statistics":market_statistics,"simulate_execution":simulate_execution,"backtest":backtest,"volume_profile":volume_profile,"filing_draft":filing_draft,"sma":indicators.sma,"ema":indicators.ema,"rsi":indicators.rsi,
              "macd":indicators.macd,"crossover":indicators.latest_crossover,
              "ratios":ratios.compute_ratios,"yoy":ratios.yoy_growth,"annual_ratio":valuation.annual_ratio_at,
              "record_interest":preferences.record_interest,"recommendations":preferences.recommendations,
              "evaluate_monitor":monitoring.evaluate_monitor,"monitor_evaluation":monitoring.monitor_evaluation,"trailing_dividend":dividends.trailing_dividend_per_share,
              "portfolio_analysis":portfolio.portfolio_analysis,"performance":portfolio.performance,
              "aligned_returns":portfolio.aligned_returns,"daily_close_map":portfolio.daily_close_map,
              "reported_ratios":reported.reported_research_ratios,"aggregate_candles":candles.aggregate_candles,
              "source_financial_tables":publisher.source_financial_tables,"publisher_profile":publisher.profile_observation,
              "issuer_identity":publisher.legal_issuer_identity,"issuer_masthead":publisher.issuer_masthead_matches,
              "validate_preferences":preferences.validate_preferences,
              "risk_contributions":risk.risk_contributions,"portfolio_risk":risk.portfolio_risk,
              "total_return_series":risk.total_return_series,"portfolio_overview":risk.portfolio_overview,
              "analyze_financials":analytics.analyze_financials,"data_quality":analytics.data_quality,"scenarios":analytics.scenarios,
              "validate_historical_confirmation":publication.validate_historical_confirmation,"resolve_company_entity":publication.resolve_company_entity,
              "native_annual_report":reports.native_annual_report,
              "company_briefing":briefing.company_briefing,"research_synthesis":briefing.research_synthesis,
              "condensed_group_report":safaricom.condensed_group_report,"safaricom_press_report":safaricom.press_report,
              "kakuzi_group_report":registered_reports.kakuzi_group_report,"kcb_group_report":registered_reports.kcb_group_report,
              "kakuzi_html_record":registered_reports.kakuzi_html_record,"draft_cbk_bond_report":cbk.draft_bond_report,
              "document_publication_plan":document_plan.publication_plan,
              "research_readiness":readiness.research_readiness,"evidence_fingerprint":analytics.fingerprint,"changes_between":analytics.changes_between,
              "afri_score":research_components.afri_score,"company_diagnostics":research_components.company_diagnostics,"summarize_news":research_components.summarize_news,
              "assemble_company_bundle":bundle.assemble_company_bundle,
              "analyze_news_issuers":news.analyze_news_issuers,"article_evidence_text":news.article_evidence_text,
              "clean_article_content":news.clean_article_content,"is_financial_news":news.is_financial_news,
              "dedupe_news":news.dedupe_news,"news_impact":news.news_impact,
              "relative_valuation":valuation_models.relative_valuation,"dividend_discount":valuation_models.dividend_discount,
              "valuation_bundle":valuation_models.valuation_bundle,
              "research_snapshot":research_snapshot.research_snapshot,"technical_results":research_snapshot.technical_results,
              "map_news_rows":news.map_news_rows,"valuation_history":valuation.valuation_history,
              "classify_news_category":news.classify_news_category,"news_ingestion_input":news.news_ingestion_input,"news_revalidation":news.news_revalidation,
              "announcement_ingestion_input":news.announcement_ingestion_input}

EVIDENCE_OPERATIONS={'map_news_rows','dedupe_news','news_ingestion_input','news_revalidation','announcement_ingestion_input'}
OPERATIONS.update({'validate_forecast':validate_forecast,'private_calibration':private_calibration})
OPERATIONS['analyse_market']=analyse_market
OPERATIONS['run_advanced']=run_advanced
OPERATIONS['lab_calculation']=lab_calculation
OPERATIONS['earnings_lab']=earnings_lab
OPERATIONS['stress_workspace']=stress_workspace
OPERATIONS['calculated_answer']=calculated_answer
OPERATIONS['assistant_answer']=assistant_answer
OPERATIONS['assistant_evidence']=assistant_evidence
OPERATIONS['validate_assistant_answer']=validate_assistant_answer
OPERATIONS.update({'snapshot_plan':snapshot_plan,'portfolio_workspace':portfolio_workspace})
OPERATIONS.update({'map_feed':map_feed,'normalize_feed':normalize_feed})
OPERATIONS['map_fundamentals']=map_fundamentals
OPERATIONS['normalize_fundamentals_bundle']=normalize_fundamentals_bundle
OPERATIONS['aggregate_touched_candles']=candles.aggregate_touched_candles
OPERATIONS['map_nse_batch']=map_nse_batch
OPERATIONS['map_nse_fundamentals']=map_nse_fundamentals

def execute(operation, args):
    if operation in OPERATIONS:
        return OPERATIONS[operation](*args)
    if operation in ("stress","bond","futures","earnings"):
        # Reuse the already tested native Python lab code, never Node forwarding.
        sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"backend"/"python"))
        from engine_calculations import calculate
        return calculate(operation,args)
    raise ValueError("unsupported_operation")

if __name__ == "__main__":
    try:
        if sys.argv[1:] == ['--evidence-stream']:
            # One bounded page at a time, with no inherited DB/provider keys.
            for index in range(1001):
                raw = sys.stdin.buffer.readline(33554434)
                if not raw:
                    sys.exit(0)
                if index == 1000 or len(raw) > 33554433 or not raw.endswith(b'\n'):
                    raise ValueError('evidence_input_limit')
                request = json.loads(raw,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))
                if set(request)!={'operation','args'} or request['operation'] not in EVIDENCE_OPERATIONS or not isinstance(request['args'],list):
                    raise ValueError('invalid_evidence_request')
                output = json.dumps(execute(request['operation'],request['args']),allow_nan=False,separators=(',',':'))
                if len(output.encode())>16777216:
                    raise ValueError('evidence_output_limit')
                print(output,flush=True)
            raise ValueError('evidence_request_limit')
        document_mode = sys.argv[1:] == ['--document']
        evidence_mode = sys.argv[1:] == ['--evidence']
        research_mode = sys.argv[1:] == ['--research']
        if sys.argv[1:] not in ([],['--evidence'],['--document'],['--research']): raise ValueError('invalid_worker_profile')
        input_limit = 33554432 if evidence_mode else 16777216 if document_mode else 8388608 if research_mode else 2097152
        raw = sys.stdin.buffer.read(input_limit + 1)
        if len(raw)>input_limit:
            raise ValueError("input_limit")
        request=json.loads(raw,parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")))
        if set(request)!={"operation","args"} or not isinstance(request["args"],list):
            raise ValueError("invalid_request")
        if document_mode and request['operation'] not in ('document_publication_plan','condensed_group_report'):
            raise ValueError('invalid_document_operation')
        if evidence_mode and request['operation'] not in EVIDENCE_OPERATIONS:
            raise ValueError('invalid_evidence_operation')
        if research_mode and request['operation'] not in ('run_advanced','portfolio_workspace','assistant_answer','assistant_evidence'): raise ValueError('invalid_research_operation')
        output=json.dumps(execute(request["operation"],request["args"]),allow_nan=False,separators=(",",":"))
        if len(output.encode())>(16777216 if evidence_mode else 4194304):
            raise ValueError("output_limit")
        print(output)
    except Exception:
        print("Engine request rejected",file=sys.stderr)
        sys.exit(1)
