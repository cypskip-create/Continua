import test from 'node:test';import assert from 'node:assert/strict';
import {researchReportHtml,researchReportLines} from '../src/lib/researchReport.js';
test('research exports use readable labels and omit developer internals',()=>{
 const data={expectedReturn:12.5,lossProbability:.1,missing:null,inputHash:'private-hash',sourceUrl:'https://fixture.invalid'};
 const text=researchReportLines(data).join('\n');assert.match(text,/Expected Return: 12.5/);assert.match(text,/Missing: Unavailable/);assert.doesNotMatch(text,/private-hash|fixture.invalid/);
});
test('HTML report text cannot execute a supplied script or image handler',()=>{
 const html=researchReportHtml('Forecast',{note:'<SCRIPT>alert(1)</SCRIPT><img src=x onerror=alert(2)>'});
 assert.doesNotMatch(html,/<script\b|<img\b/i);assert.match(html,/&lt;SCRIPT&gt;/);
});
