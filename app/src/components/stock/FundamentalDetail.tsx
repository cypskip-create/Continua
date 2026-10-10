import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export function FundamentalDetail({title,symbol,currency,open,onOpenChange,children}: {title:string;symbol:string;currency:string;open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent fullScreen hideClose className="fundamental-detail block p-0">
    <header className="sticky top-0 z-30 bg-background border-b border-border px-4 py-3 pr-16">
      <DialogTitle>{title}</DialogTitle><DialogDescription className="mt-1">{symbol} · {currency} · Sourced company research</DialogDescription>
      <DialogClose aria-label="Close" className="absolute right-3 top-2 grid h-11 w-11 place-items-center rounded-full bg-muted text-xl">×</DialogClose>
    </header><div className="px-4 pb-12 space-y-0">{children}</div>
  </DialogContent></Dialog>;
}
export function FundamentalHeading({title,onOpen,label}: {title:string;onOpen?:()=>void;label?:string}) {
  return <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-semibold">{title}</h3>{onOpen&&<button type="button" onClick={onOpen} aria-label={label??`Open ${title.toLowerCase()} detail`} className="shrink-0 px-2 py-2 text-sm font-semibold text-primary">{label??"Details"} <span aria-hidden="true">›</span></button>}</div>;
}
