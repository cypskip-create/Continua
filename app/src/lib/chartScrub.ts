/** Selection depends on horizontal position, never on hitting a chart path. */
export function chartScrubIndex(clientX: number, left: number, width: number, count: number, insetLeft = 0, insetRight = 0) {
  if (!count || !Number.isFinite(clientX)) return -1;
  const fraction = Math.min(1, Math.max(0, (clientX - left - insetLeft) / Math.max(1, width - insetLeft - insetRight)));
  return Math.round(fraction * (count - 1));
}
export function chartTimeScrubIndex(clientX:number,left:number,width:number,timestamps:number[],insetRight=0){
  if(!timestamps.length)return -1;
  const fraction=Math.min(1,Math.max(0,(clientX-left)/Math.max(1,width-insetRight)));
  const target=timestamps[0]+fraction*(timestamps.at(-1)!-timestamps[0]);
  let nearest=0;
  for(let index=1;index<timestamps.length;index++)if(Math.abs(timestamps[index]-target)<Math.abs(timestamps[nearest]-target))nearest=index;
  return nearest;
}
