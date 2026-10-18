import {pythonCalculation} from './pythonCalculations.js';
// Wire aliases remain compatible; the one scoring implementation is the
// existing isolated, secret-free Python Engine calculation worker.
export async function computeAfriScore(securityId, inputs) {
    return pythonCalculation('cscore', [securityId, inputs]);
}
