import { RollingNumber } from "@/components/shared/RollingNumber";
import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Share, Download, ZoomIn, ZoomOut } from "lucide-react";

interface ImageViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  initialIndex?: number;
}

export function ImageViewer({ open, onOpenChange, images, initialIndex = 0 }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [dragY, setDragY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const panStart=useRef({x:0,y:0}),mouseStart=useRef<{x:number;y:number}|null>(null);
  const [imageError,setImageError]=useState(false);
  useEffect(()=>{setPan({x:0,y:0});setImageError(false);},[currentIndex,open]);
  useEffect(()=>{if(zoom===1)setPan({x:0,y:0});},[zoom]);
  const startY = useRef(0);
  const startX = useRef(0);
  const startDist = useRef(0);
  const gestureMoved = useRef(false);
  const pinching = useRef(false);
  const pinchZoom = useRef(1);
  useEffect(() => {
    if (open) { setCurrentIndex(Math.max(0, Math.min(initialIndex, images.length - 1))); setZoom(1); setDragY(0); }
  }, [open, initialIndex, images.length]);

  const handlePrev = () => { setZoom(1); setCurrentIndex((i) => Math.max(0, i - 1)); };
  const handleNext = () => { setZoom(1); setCurrentIndex((i) => Math.min(images.length - 1, i + 1)); };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    gestureMoved.current = false;
    pinching.current = e.touches.length === 2;
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      startDist.current = Math.hypot(dx, dy);
      pinchZoom.current = zoom;
      return;
    }
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    panStart.current=pan;
  }, [zoom,pan]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && startDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setZoom(Math.max(1, Math.min(4, pinchZoom.current * (dist / startDist.current))));
      return;
    }
    if (zoom > 1) {if(e.touches.length===1){gestureMoved.current=true;setPan({x:Math.max(-window.innerWidth*(zoom-1)/2,Math.min(window.innerWidth*(zoom-1)/2,panStart.current.x+e.touches[0].clientX-startX.current)),y:Math.max(-window.innerHeight*(zoom-1)/2,Math.min(window.innerHeight*(zoom-1)/2,panStart.current.y+e.touches[0].clientY-startY.current))});}return;}
    const dy = e.touches[0].clientY - startY.current;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) gestureMoved.current = true;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) setDragY(dy);
  }, [zoom]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if(e.touches.length===1&&zoom>1){startX.current=e.touches[0].clientX;startY.current=e.touches[0].clientY;panStart.current=pan;startDist.current=0;return;}
    if (!pinching.current && zoom === 1 && e.changedTouches.length) {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        setCurrentIndex(i => Math.max(0, Math.min(images.length - 1, i + (dx < 0 ? 1 : -1))));
      } else if (dy > 100 && dy > Math.abs(dx)) onOpenChange(false);
    }
    setDragY(0);
    startDist.current = 0;
  }, [zoom, images.length, onOpenChange,pan]);

  if (!images.length) return null;

  const opacity = Math.max(0.3, 1 - dragY / 400);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose fullScreen
        onKeyDown={e=>{if(e.defaultPrevented||e.repeat)return;if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();handlePrev();}if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();handleNext();}if(e.key==='+')setZoom(z=>Math.min(4,z+0.5));if(e.key==='-')setZoom(z=>Math.max(1,z-0.5));}}
        className="max-w-full !max-h-[100dvh] w-screen h-[100dvh] p-0 bg-black border-0 rounded-none overflow-hidden"
        style={{ background: `rgba(0,0,0,${opacity})` }}
      >
        <DialogTitle className="sr-only">Post image gallery</DialogTitle>
        <DialogDescription className="sr-only">Swipe left or right for another image. Swipe down or press Escape to close.</DialogDescription>
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
          <Button aria-label="Close image gallery" variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
          {images.length > 1 && (
            <span className="text-white/80 text-sm font-semibold tabular-nums">
              <RollingNumber value={currentIndex + 1} /> / <RollingNumber value={images.length} />
            </span>
          )}
          <div className="flex items-center gap-1">
            <Button aria-label="Zoom out" disabled={zoom===1} variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10" onClick={()=>setZoom(z=>Math.max(1,z-0.5))}><ZoomOut className="h-4 w-4"/></Button>
            <Button aria-label="Zoom in" disabled={zoom===4} variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10" onClick={()=>setZoom(z=>Math.min(4,z+0.5))}><ZoomIn className="h-4 w-4"/></Button>
            <Button aria-label="Share image" variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10" onClick={() => { if (navigator.share) void navigator.share({ url: images[currentIndex] }).catch(() => {}); else void navigator.clipboard?.writeText(images[currentIndex]).catch(() => {}); }}>
              <Share className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10" asChild>
              <a aria-label="Download image" href={images[currentIndex]} download target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        {/* Swipe between images or down to dismiss; double-tap the image to zoom. */}
        <div
          className="flex items-center justify-center w-full h-full select-none touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => { setDragY(0); gestureMoved.current = true; startDist.current = 0; }}
          onMouseDown={e=>{if(zoom>1){mouseStart.current={x:e.clientX,y:e.clientY};panStart.current=pan;gestureMoved.current=false;}}}
          onMouseMove={e=>{if(mouseStart.current&&zoom>1){gestureMoved.current=true;setPan({x:panStart.current.x+e.clientX-mouseStart.current.x,y:panStart.current.y+e.clientY-mouseStart.current.y});}}}
          onMouseUp={()=>{mouseStart.current=null;}}
          onMouseLeave={()=>{mouseStart.current=null;}}
          onClick={() => !gestureMoved.current && zoom === 1 && onOpenChange(false)}
          tabIndex={0}
          style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? "transform 0.25s ease" : "none" }}
        >
          {imageError?<p role="alert" className="px-6 text-center text-sm text-white/80">This image could not load. Try another photo or reopen the gallery.</p>:<img
            src={images[currentIndex]}
            alt={`Post image ${currentIndex + 1} of ${images.length}`}
            className="max-w-full max-h-full object-contain"
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transition: "transform 0.12s ease",cursor:zoom>1?'grab':'zoom-in' }}
            onError={()=>setImageError(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
            draggable={false}
          />}
        </div>

        {/* Navigation arrows are available on touch screens and desktop. */}
        {images.length > 1 && (
          <>
            <Button aria-label="Previous image" disabled={currentIndex === 0} variant="ghost" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full text-white bg-black/30 hover:bg-black/50" onClick={(e) => { e.stopPropagation(); handlePrev(); }}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button aria-label="Next image" disabled={currentIndex === images.length - 1} variant="ghost" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full text-white bg-black/30 hover:bg-black/50" onClick={(e) => { e.stopPropagation(); handleNext(); }}>
              <ChevronRight className="h-6 w-6" />
            </Button>
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex z-10" aria-label="Gallery pages">
              {images.map((_, idx) => (
                <button type="button" data-small-target key={idx} aria-label={`Show image ${idx + 1}`} aria-current={idx === currentIndex ? 'true' : undefined} onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); setZoom(1); }} className="inline-flex h-8 w-6 items-center justify-center bg-transparent"><span aria-hidden="true" className={`block rounded-full transition-colors ${idx===currentIndex?'h-1.5 w-1.5 bg-white':'h-1 w-1 bg-white/45'}`}/></button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
