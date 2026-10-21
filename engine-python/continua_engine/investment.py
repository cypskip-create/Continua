"""Numerical implementation shared with the compatibility worker."""
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'backend' / 'python'))
from investment_intelligence import run_investment
