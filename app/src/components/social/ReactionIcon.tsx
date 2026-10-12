import type { CommunityReaction } from './CommunityReactionButton';

// Original vector artwork: consistent ink, rounded tiles and Continua's palette.
// IDs stay unchanged so reactions already saved to posts/comments are preserved.
const marks: Record<string,string> = {
 bullish:'M8 24l6-6 5 3 8-12M21 9h6v6', bearish:'M8 10l6 6 5-3 8 12M21 25h6v-6',
 rocket:'M13 22c-1-9 6-15 13-15 0 8-5 14-13 15ZM14 15l-6 3v7l6-3M20 21l-3 7h7l2-10M9 27l-2 3m5-2-1 3',
 diamond_hands:'M8 13l5-5h10l5 5-10 15ZM8 13h20M13 8l5 20 5-20',
 agree:'M9 17l6 6L27 10', question:'M12 12c0-7 13-7 13 0 0 4-7 4-7 8M18 25v1',
 warning:'M18 7 30 28H6ZM18 14v7m0 3v1', thank_you:'M9 18v-7m5 5V7m8 9V7m5 11v-7M8 21c1 8 7 9 10 4 3 5 9 4 10-4',
 fire:'M18 6c1 8 10 9 10 17a10 10 0 0 1-20 0c0-5 4-7 5-11 1 5 3 6 5-6ZM18 20c5 5 4 9 0 9s-5-4 0-9',
 love:'M18 28 8 18C0 9 11 3 18 12c7-9 18-3 10 6Z',
 thumbs_up:'M13 28H7V17h6m0 11h11l4-13H18l1-8c-5-2-4 7-6 10Z',
 thumbs_down:'M13 8H7v11h6m0-11h11l4 13H18l1 8c-5 2-4-7-6-10Z',
 strong_hold:'M7 15l5-5 6 4 5-4 6 5-8 11-5-2-4 1ZM12 17l6-3 6 6M10 23l3-3m0 6 3-4',
 insightful:'M12 21a9 9 0 1 1 12 0l-2 3h-8ZM14 28h8M18 3v1M4 14h2m24 0h2',
 watch:'M4 18c7-12 21-12 28 0-7 12-21 12-28 0ZM22 18a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 celebrate:'M8 28l4-17 13 13ZM22 7v5m5 1 3-3m-1 10h3M16 4l2 3',
 trophy:'M12 7h12v9c0 11-12 11-12 0ZM12 9H6c0 7 3 10 7 10m11-10h6c0 7-3 10-7 10M18 24v5m-5 1h10',
 hopeful:'M18 6v23M18 6l-4 5-4 13 8 5 8-5-4-13ZM8 27l-2 3m22-3 2 3',
 cool:'M7 13h9v6H8Zm13 0h9l-1 6h-8ZM16 15h4M12 25q6 4 12 0',
 shark:'M5 22l11-7 4-9 4 11 7 7-16 2ZM23 19h1M5 22l1 7 6-4',
 cautious:'M18 5 29 10v9c0 7-11 12-11 12S7 26 7 19v-9ZM13 18l4 4 6-8',
};
const faces: Record<string,string> = {
 laugh:'M10 14q3-4 6 0m4 0q3-4 6 0M11 21h14c-1 10-13 10-14 0Z',
 sad:'M11 14h1m12 0h1M12 26q6-7 12 0M26 18l-2 5 4 1Z',
 angry:'M9 11l6 4m12-4-6 4M12 24q6-5 12 0',
 shocked:'M11 12v3m14-3v3M22 24a4 5 0 1 1-8 0 4 5 0 0 1 8 0',
 thinking:'M10 13h2m11-1h3M12 24l10-1M21 27l6-5m-2-3 3 3',
 cant_look:'M7 12l9 8m13-8-9 8M12 27q6 3 12 0',
 mind_blown:'M7 11l4-5 5 3 3-5 4 4 6-1M11 17h1m12 0h1M14 26h8',
 heartbreak:'M18 28 8 18C0 9 11 3 18 12c7-9 18-3 10 6ZM18 12l-3 5 6 3-4 5',
};
export function ReactionIcon({id,size=24}:{id:CommunityReaction;size?:number}) {
 const key=id==='support'?'strong_hold':id==='disagree'?'thumbs_down':id;
 const face=faces[key];
 const color=key==='bullish'||key==='agree'?'#259574':key==='bearish'||key==='warning'?'#d46554':'#7055cc';
 return <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" focusable="false" data-reaction-art={id}>
   <rect x="1" y="1" width="34" height="34" rx="12" fill={color} fillOpacity=".12"/>
   <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
     {face&&<circle cx="18" cy="19" r="13" fill={color} fillOpacity=".07"/>}
     <path d={face||marks[key]||marks.insightful}/>
   </g>
 </svg>;
}
