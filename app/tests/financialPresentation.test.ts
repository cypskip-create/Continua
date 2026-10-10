import {test} from "node:test";
import assert from "node:assert/strict";
import {financialNumber, growthPercent, metricPoints, statementMetrics, metricNumber} from "../src/lib/financialPresentation.ts";

test("financial values use compact units and keep zeros distinct from missing data",()=>{
  assert.equal(financialNumber(153900000000,"KES"),"KES 153.9B");
  assert.equal(financialNumber(-549700000),"-549.7M");
  assert.equal(financialNumber(31000),"31K");
  assert.equal(financialNumber(0),"0");
  for(const v of [null,undefined,"",NaN,Infinity])assert.equal(financialNumber(v),"—");
});
test("YoY matches the same fiscal quarter, not the preceding row",()=>{
  const history=[{fiscalYear:2024,fiscalQuarter:1,revenue:100,netIncome:10,eps:1},{fiscalYear:2024,fiscalQuarter:2,revenue:500,netIncome:50,eps:5},{fiscalYear:2025,fiscalQuarter:1,revenue:125,netIncome:12,eps:1.2}];
  const points=metricPoints(history,statementMetrics["Income statement"][0]);
  assert.equal(points[2].yoy,25);
  assert.equal(points[1].yoy,null);
  assert.equal(growthPercent(10,0),null);
  assert.equal(growthPercent(null,10),null);
  assert.equal(growthPercent(-50,-100),50);
});
test("ratios require valid denominators and never invent missing statement values",()=>{
  const metric=statementMetrics["Financial indicators"].find(m=>m.label==="ROE")!;
  assert.equal(metricNumber(metric.get({fiscalYear:2025,revenue:100,netIncome:10,eps:1,totalEquity:100}),metric),"10.0%");
  assert.equal(metric.get({fiscalYear:2025,revenue:100,netIncome:10,eps:1,totalEquity:0}),null);
  assert.equal(metricNumber(null,metric),"—");
});
