import {Card, CardContent} from '@/components/ui/card';
export interface ContinuaScores {
    value: number | null; growth: number | null; health: number | null; dividend: number | null;
    risk: number | null; position: number | null; quality?: number | null; overall: number | null;
    evidence?: Record<string, unknown> & {coveragePercent?: number; confidence?: string; reason?: string | null; sectorProfile?: string};
}
const color = (n: number | null) => n == null ? 'text-muted-foreground' : n >= 70 ? 'text-bull' : n >= 45 ? 'text-accent' : 'text-bear';
export function ContinuaScoreCard({scores}: {scores: ContinuaScores}) {
    const factors = [
        ['Valuation', scores.value], ['Growth', scores.growth], ['Financial strength', scores.health],
        ['Income', scores.dividend], ['Risk', scores.risk], ['Quality', scores.quality ?? null], ['Momentum', scores.position],
    ] as [string, number | null][];
    const evidence = scores.evidence;
    return <Card className="soft-card overflow-hidden"><CardContent className="p-4 space-y-4">
        <div><p title="Continua score" className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-semibold">C score</p>
            <div className="flex items-baseline gap-2 mt-1"><span className={`text-3xl font-bold ${color(scores.overall)}`}>{scores.overall ?? '—'}</span>
                <span className="text-xs text-muted-foreground">{scores.overall == null ? 'Insufficient evidence' : '/100 · observed factor assessment'}</span></div>
            <p className="text-xs text-muted-foreground mt-1">Evidence coverage: {evidence?.coveragePercent ?? '—'}% · {evidence?.confidence ?? 'unavailable'} confidence · {evidence?.sectorProfile ?? 'unclassified'} sector profile</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{factors.map(([label, value]) => <div key={label} className="rounded-xl bg-muted/30 p-2">
            <p className="text-[0.625rem] text-muted-foreground">{label}</p><p className={`text-sm font-semibold ${color(value)}`}>{value == null ? 'Unavailable' : `${value}/100`}</p>
            {value != null && <div className="h-1 bg-muted mt-1 rounded-full"><div className="h-full bg-primary rounded-full" style={{width: `${value}%`}}/></div>}
        </div>)}</div>
        {evidence?.reason && <p className="text-xs text-muted-foreground">{evidence.reason}</p>}
        <details className="text-xs"><summary className="cursor-pointer font-medium">Methodology & evidence</summary><div className="mt-2 space-y-2 text-muted-foreground">
            <p>{String(evidence?.methodologyVersion ?? 'Version unavailable')}. Coverage describes available evidence, not investment quality. Missing factors are not scored as neutral.</p>
            <p>Sector-specific factors use disclosed bounded thresholds. No predictive accuracy, probability or Morningstar analyst rating is claimed. Financial firms need regulatory evidence for financial strength.</p>
            {Object.entries((evidence?.pillars ?? {}) as Record<string, {observations?: {metric: string; value: number; worst: number; best: number}[]; missing?: string[]}>).map(([name, pillar]) => <div key={name}>
                <p className="font-medium capitalize">{name}</p>
                {(pillar.observations ?? []).map(o => <p key={o.metric}>{o.metric}: {o.value} · disclosed scale {o.worst} to {o.best}</p>)}
                {!!pillar.missing?.length && <p>Unavailable: {pillar.missing.join(', ')}</p>}
            </div>)}
            <p>Growth, yields, returns and volatility use fractions (0.1 = 10%). Multiples use ×. Higher risk scores mean lower observed risk; they do not establish safety.</p>
        </div></details>
    </CardContent></Card>;
}
