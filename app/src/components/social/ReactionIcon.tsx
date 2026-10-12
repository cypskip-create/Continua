import { useId } from 'react';
import type { CommunityReaction } from './CommunityReactionButton';
// One cached, transparent, original 3D atlas. SVG viewports preserve each
// object's proportions; this isn't the browser's Unicode emoji renderer.
const order=['rocket','agree','question','warning','thank_you','sad',
 'angry','bullish','bearish','fire','love','thumbs_up',
 'thumbs_down','strong_hold','insightful','watch','laugh','celebrate',
 'trophy','heartbreak','shocked','thinking','cant_look','hopeful','mind_blown','cool'];
const aliases:Record<string,string>={support:'strong_hold',disagree:'thumbs_down',cautious:'warning',diamond_hands:'strong_hold',shark:'watch'};
const xs=[0,254,477,700,925,1150,1374],ys=[0,278,492,715,932,1145];
export function ReactionIcon({id,size=24}:{id:CommunityReaction;size?:number}) {
 const clipId=useId();
 const i=Math.max(0,order.indexOf(aliases[id]??id)),col=i%6,row=Math.floor(i/6);
 const x=xs[col],y=ys[row],width=xs[col+1]-x,height=ys[row+1]-y;
 return <svg width={size} height={size} viewBox={`${x} ${y} ${width} ${height}`} preserveAspectRatio="xMidYMid meet" overflow="hidden" aria-hidden="true" focusable="false" data-reaction-art={id}>
  <defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height}/></clipPath></defs>
  <image href="/reactions/continua-3d-atlas.png" width="1374" height="1145" clipPath={`url(#${clipId})`}/>
 </svg>;
}
