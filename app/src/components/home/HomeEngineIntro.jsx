import { Link } from 'react-router-dom';
import { Zap, ArrowRight, Search, PieChart, ChartNoAxesCombined, Sparkles } from 'lucide-react';

const actions = [['Research a stock', 'Briefing', Search], ['Analyse portfolio', 'Portfolio', PieChart], ['Run a scenario', 'Scenario lab', ChartNoAxesCombined], ['Ask a question', 'Ask Engine', Sparkles]];
export function HomeEngineIntro({ plan }) {
  return <section className="home-engine-intro" aria-label="Continua Engine">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary"/><h2 className="text-base font-semibold">Continua Engine</h2>{plan?.startsWith('premium') && <span className="text-[0.625rem] uppercase text-muted-foreground">{plan === 'premium_plus' ? 'Premium Plus' : 'Premium'}</span>}</div><Link to="/engine" aria-label="Explore Continua Engine" className="grid h-10 w-10 place-items-center text-primary"><ArrowRight size={22}/></Link></div>
    <h3>Make sense of the market.</h3>
    <p>Deep company research, portfolio analysis, risk insights and more.</p>
    <nav aria-label="Engine shortcuts">{actions.map(([label, tool, Icon]) => <Link key={tool} to={`/engine?tool=${encodeURIComponent(tool)}`}><Icon size={17}/><span>{label}</span></Link>)}</nav>
  </section>;
}
