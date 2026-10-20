"""Native Engine adapter to the canonical, Docker-packaged Python risk models."""
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'backend'/'python'))
from continua_risk import build_risk_intelligence, simulate_risk, stock_risk, _contributions, VERSION
