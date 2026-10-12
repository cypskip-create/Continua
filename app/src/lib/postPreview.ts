export const FEED_PREVIEW_CHARACTERS=600;
/** Character cap, not a device-dependent three-line cut. Keep the source intact. */
export function postPreview(content:string,limit=FEED_PREVIEW_CHARACTERS){
 const chars=Array.from(content);
 if(chars.length<=limit)return {text:content,truncated:false};
 let text=chars.slice(0,limit).join('');
 const boundary=text.lastIndexOf(' ');
 if(boundary>text.length-40)text=text.slice(0,boundary);
 return {text:text.trimEnd()+'…',truncated:true};
}
