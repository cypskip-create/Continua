import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_engine.candles import aggregate_candles
from continua_engine.publisher import source_financial_tables, legal_issuer_identity, profile_observation, issuer_masthead_matches

class MarketObservationTests(unittest.TestCase):
    def candle(self, date, close, source="https://fixture.example/report"):
        return {"securityId":"NSE:COOP","timestamp":date,"open":close-1,"close":close,"high":close+1,"low":close-2,"volume":100,"sourceUrl":source}

    def test_calendar_weeks_months_leap_year_and_order(self):
        source=[self.candle("2024-03-04T12:00:00Z", 22),self.candle("2024-03-03T12:00:00Z", 21),self.candle("2024-02-29T12:00:00Z",20)]
        weekly=aggregate_candles(source,"1w")
        self.assertEqual([b["timestamp"] for b in weekly],["2024-02-26T00:00:00.000Z","2024-03-04T00:00:00.000Z"])
        self.assertEqual(weekly[0]["close"],21)
        self.assertEqual(weekly[0]["volume"],200)
        monthly=aggregate_candles(source,"1M")
        self.assertEqual(len(monthly),2)
        self.assertEqual(monthly[0]["timestamp"],"2024-02-01T00:00:00.000Z")

    def test_mixed_provenance_and_empty_data_never_invent_source(self):
        source=[self.candle("2026-01-01",20),self.candle("2026-01-02",21,"https://fixture.example/other")]
        self.assertNotIn("sourceUrl",aggregate_candles(source,"1M")[0])
        self.assertEqual(aggregate_candles([],"1d"),[])

    def table(self):
        return {"kind":"publisher_table","tab":"Financials","category":"Profit/Loss","columns":["Metric","2025","2024"],"rows":[{"label":"Revenue","rowKind":"item","cells":[{"raw":"1.00 B"},{"raw":"900 M"}]}]}

    def test_publisher_tables_preserve_raw_precision_not_canonical_values(self):
        table=self.table();table["rows"][0]["ignored"]=100
        result=source_financial_tables([table],2026)
        self.assertEqual(result[0]["rows"][0],{"label":"Revenue","rowKind":"item","values":["1.00 B","900 M"]})

    def test_tables_reject_future_duplicate_years_wrong_cells_and_oversize(self):
        for mutation in ("future","duplicates","cells","label"):
            table=self.table()
            if mutation=="future": table["columns"][1]="2027"
            if mutation=="duplicates": table["columns"][1]="2024"
            if mutation=="cells": table["rows"][0]["cells"]=[{"raw":"1"}]
            if mutation=="label": table["rows"][0]["label"]="x"*501
            self.assertEqual(source_financial_tables([table],2026),[])

    def test_issuer_identity_never_drops_group_or_subsidiary(self):
        self.assertEqual(legal_issuer_identity("KCB Group PLC"),"kcbgroup")
        self.assertNotEqual(legal_issuer_identity("KCB Kenya Limited"),"kcbgroup")
        self.assertTrue(issuer_masthead_matches("KCB Group PLC audited annual results","KCB Group Limited"))
        self.assertFalse(issuer_masthead_matches("KCB Kenya Ltd annual results","KCB Group PLC"))

    def test_profile_matching_is_exact_and_rejects_unsafe_websites(self):
        table={"kind":"publisher_profile","companyName":"KCB Group Ltd","facts":{"address":"Nairobi","website":"https://example.test"}}
        self.assertEqual(profile_observation([table],"KCB Group PLC")["headquarters"],"Nairobi")
        self.assertIsNone(profile_observation([table],"KCB Kenya Ltd"))
        table["facts"]["website"]="javascript:alert(1)"
        self.assertIsNone(profile_observation([table],"KCB Group PLC")["website"])

if __name__ == "__main__": unittest.main()
