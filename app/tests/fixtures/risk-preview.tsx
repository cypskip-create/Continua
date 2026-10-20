// Local visual QA only. Synthetic numerical-test inputs, never production data.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {RiskIntelligenceView} from '../../src/components/engine/RiskIntelligence';
import type {RiskIntelligence} from '../../src/api/riskIntelligence';
import data from './risk-test-snapshot.json';
import '../../src/index.css';
import '../../src/styles/brand-system.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><main className="mx-auto max-w-5xl p-4"><p className="mb-4 text-xs text-muted-foreground">Local visual test · synthetic test holdings, not market observations</p><h1 className="mb-4 text-2xl font-semibold">Continua Risk Intelligence</h1><RiskIntelligenceView data={data as unknown as RiskIntelligence}/></main></QueryClientProvider>);
