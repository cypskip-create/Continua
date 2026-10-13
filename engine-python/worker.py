"""Bounded native worker protocol. stdin/stdout only; no provider credentials."""
import json
import pathlib
import sys
from continua_engine import indicators, ratios, valuation, preferences, monitoring, dividends, portfolio, reported

OPERATIONS = {"sma":indicators.sma,"ema":indicators.ema,"rsi":indicators.rsi,
              "macd":indicators.macd,"crossover":indicators.latest_crossover,
              "ratios":ratios.compute_ratios,"yoy":ratios.yoy_growth,"annual_ratio":valuation.annual_ratio_at,
              "record_interest":preferences.record_interest,"recommendations":preferences.recommendations,
              "evaluate_monitor":monitoring.evaluate_monitor,"trailing_dividend":dividends.trailing_dividend_per_share,
              "portfolio_analysis":portfolio.portfolio_analysis,"performance":portfolio.performance,
              "aligned_returns":portfolio.aligned_returns,"daily_close_map":portfolio.daily_close_map,
              "reported_ratios":reported.reported_research_ratios}

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
        raw = sys.stdin.buffer.read(2097153)
        if len(raw)>2097152:
            raise ValueError("input_limit")
        request=json.loads(raw,parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite")))
        if set(request)!={"operation","args"} or not isinstance(request["args"],list):
            raise ValueError("invalid_request")
        output=json.dumps(execute(request["operation"],request["args"]),allow_nan=False,separators=(",",":"))
        if len(output.encode())>4194304:
            raise ValueError("output_limit")
        print(output)
    except Exception:
        print("Engine request rejected",file=sys.stderr)
        sys.exit(1)
