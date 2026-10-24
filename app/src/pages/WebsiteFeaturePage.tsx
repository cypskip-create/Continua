import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowUpRight, ArrowRight, Check, Menu, X } from 'lucide-react';
import { ContinuaMark } from '@/components/shared/ContinuaMark';
import { websiteFeatures, type WebsiteFeature } from '@/lib/websiteFeatures';
import './landing.css';
import './websiteFeature.css';
export default function WebsiteFeaturePage(){
 const {feature}=useParams();const [menu,setMenu]=useState(false);
 const data=feature&&Object.prototype.hasOwnProperty.call(websiteFeatures,feature)?websiteFeatures[feature as WebsiteFeature]:undefined;
 if(!data)return <main className="p-8"><h1>Feature not found</h1><Link to="/landing">Explore Continua</Link></main>;
 return <div className="continua-site site-feature-page">
 <Helmet><title>{data.label} — Continua</title><meta name="description" content={data.lead}/></Helmet>
 <a className="site-skip" href="#feature-main">Skip to content</a>
 <header className="site-header"><Link className="site-brand" to="/landing"><ContinuaMark size={36} appearance="light"/><span>Continua</span></Link><nav aria-label="Feature navigation">{Object.entries(websiteFeatures).map(([key,item])=><Link key={key} to={'/features/'+key} aria-current={feature===key?'page':undefined}>{item.label}</Link>)}<Link to="/developers">Developers & API</Link></nav><div className="site-header-actions"><Link to="/auth">Open app<ArrowUpRight size={16}/></Link><button aria-label={menu?'Close menu':'Open menu'} aria-expanded={menu} aria-controls="feature-menu" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></header>
 {menu&&<nav id="feature-menu" className="site-mobile-menu" aria-label="Website navigation">{Object.entries(websiteFeatures).map(([key,item])=><Link key={key} to={'/features/'+key} onClick={()=>setMenu(false)}>{item.label}<ArrowRight size={16}/></Link>)}<Link to="/developers">Developers & API<ArrowUpRight size={16}/></Link><Link to="/docs">Documentation<ArrowRight size={16}/></Link><Link to="/landing">Back to website<ArrowRight size={16}/></Link></nav>}
 <main id="feature-main"><section className="site-wrap feature-intro"><Link className="feature-back" to="/landing#platform"><ArrowLeft size={15}/>All platform tools</Link><p className="site-kicker">{data.label}</p><h1>{data.title}</h1><p className="feature-lead">{data.lead}</p><div className="feature-actions"><Link className="site-button" to="/auth">Explore in the app<ArrowUpRight size={18}/></Link><Link className="site-button site-button-secondary" to="/landing#plans">Compare plans<ArrowRight size={18}/></Link></div></section>
 {'image' in data&&<figure className="site-wrap feature-figure"><img src={data.image} alt={data.alt} width="1280" height="853" decoding="async"/><figcaption>{data.imageNote}</figcaption></figure>}
 <section className="site-wrap feature-sections" aria-label={'About '+data.label}>{data.sections.map(([title,body],index)=><article key={title}><span className="feature-index">0{index+1}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</section>
 <section className="site-soft"><div className="site-wrap feature-start"><div><p className="site-kicker">GET STARTED</p><h2>A simple way in.</h2><ol>{data.steps.map(step=><li key={step}><Check size={18}/><span>{step}</span></li>)}</ol></div><aside><h3>Plan access</h3><p>{data.access}</p><Link to="/landing#plans">View memberships<ArrowRight size={16}/></Link></aside></div></section>
 <section className="site-wrap feature-end"><p>{data.note}</p><Link className="site-button" to="/auth">Get started with Continua<ArrowUpRight size={18}/></Link></section>
 </main><footer className="site-footer site-wrap"><div className="site-footer-links"><Link to="/landing">Continua</Link><Link to="/docs">Documentation</Link><Link to="/developers">Developers & API</Link><Link to="/help">Help</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div><p className="site-fine-print">Research and portfolio tracking. No trade execution or custody of funds. Capital is at risk.</p></footer></div>
}
