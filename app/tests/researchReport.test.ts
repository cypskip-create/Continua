import test from 'node:test';import assert from 'node:assert/strict';
import {researchReportHtml,researchReportLines} from '../src/lib/researchReport.js';
test('readable reports preserve results and limitations while excluding operational hashes',()=>{
 const data={expectedShortfall:1234.5,assumptions:{horizonDays:30},limitation:'A scenario, not a guarantee.',missing:null,governance:{inputHash:'private-hash'}};
 const lines=researchReportLines(data).join('\n');assert.match(lines,/Expected Shortfall: 1,234.5/);assert.match(lines,/Horizon Days: 30/);assert.match(lines,/Missing: Unavailable/);assert.match(lines,/not a guarantee/);assert.doesNotMatch(lines,/private-hash/);
});
test('HTML report text cannot execute a supplied script or image handler',()=>{
 const html=researchReportHtml('forecast',{note:'<script>alert(1)</script><img onerror="evil()">'});
 assert.doesNotMatch(html,/<script>|<img /);assert.match(html,/&lt;script&gt;/);assert.match(html,/<!doctype html>/i);
});
