import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {env} from '../../config/index.js';

/** Only the owned edge with a separate server secret can supply visitor IPs.
 * Ordinary forwarded headers continue to use the configured Render proxy hops.
 * This assertion grants no API key, user identity, entitlement or admin access.
 */
export function edgeClientIdentity(secret=env.CONTINUA_EDGE_ORIGIN_SECRET){
 if(secret!==undefined&&(typeof secret!=='string'||secret.length<32||secret.length>512||secret.trim()!==secret))throw Error('Invalid edge identity configuration');
 const expected=secret?createHash('sha256').update(secret).digest():null;
 return (req,res,next)=>{
  delete res.locals.trustedEdgeClientIP;
  const provided=req.get('X-Continua-Edge-Secret'),candidate=req.get('X-Continua-Client-IP');
  if(expected&&typeof provided==='string'&&provided.length>=32&&provided.length<=512&&
    typeof candidate==='string'&&candidate.length<=64&&!candidate.includes('%')&&isIP(candidate)&&
    timingSafeEqual(createHash('sha256').update(provided).digest(),expected))res.locals.trustedEdgeClientIP=candidate;
  next();
 };
}
export function rateLimitClientIP(req,res){return res.locals.trustedEdgeClientIP??req.ip??'unknown';}
