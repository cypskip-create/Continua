import {useEffect,useState,type CSSProperties} from 'react';
/** Center within the visible viewport while the keyboard is open; otherwise
 * retain the app's bottom-sheet placement. Never guess a keyboard's height. */
export function useKeyboardPanel(open:boolean){
 const [viewport,setViewport]=useState<{top:number;height:number;keyboard:boolean}|null>(null);
 useEffect(()=>{
  if(!open){setViewport(null);return;}
  let restingHeight=window.innerHeight;
  const update=()=>{const v=window.visualViewport;const height=v?.height??window.innerHeight;
   const editing=document.activeElement?.matches('input,textarea,[contenteditable="true"]')??false;
   if(!editing)restingHeight=window.innerHeight;
   setViewport({top:(v?.offsetTop??0)+height/2,height:Math.max(120,height-24),keyboard:Math.max(window.innerHeight,restingHeight)-height>150});};
  update();window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
  return()=>{window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
 },[open]);
 return {centered:viewport?.keyboard||undefined,style:viewport?.keyboard?{'--composer-top':`${viewport.top}px`,'--composer-height':`${viewport.height}px`} as CSSProperties:undefined};
}
