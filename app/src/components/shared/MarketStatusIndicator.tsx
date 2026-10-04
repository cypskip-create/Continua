import { useMemo } from "react";

export const MarketStatusIndicator = () => {
  const marketStatus = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();
    const day = now.getDay();
    
    // NSE trading hours: Mon-Fri, 9:00 AM - 3:00 PM EAT
    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = hours >= 9 && hours < 15;
    const isPreMarket = hours >= 8 && hours < 9;
    const isAfterHours = hours >= 15 && hours < 17;
    
    if (!isWeekday) {
      return { status: "closed", label: "Closed", sublabel: "Opens Monday 9:00 AM" };
    }
    
    if (isMarketHours) {
      const closeTime = new Date();
      closeTime.setHours(15, 0, 0, 0);
      const diff = closeTime.getTime() - now.getTime();
      const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
      const minsLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return { 
        status: "open", 
        label: "Market Open", 
        sublabel: `Closes in ${hoursLeft}h ${minsLeft}m` 
      };
    }
    
    if (isPreMarket) {
      return { status: "pre", label: "Pre-Market", sublabel: "Opens at 9:00 AM" };
    }
    
    if (isAfterHours) {
      return { status: "after", label: "After Hours", sublabel: "Market closed" };
    }
    
    return { status: "closed", label: "Closed", sublabel: "Opens 9:00 AM" };
  }, []);

  const statusColors = {
    open: "bg-bull text-white",
    pre: "bg-accent text-white",
    after: "bg-muted-foreground text-white",
    closed: "bg-muted text-muted-foreground"
  };

  const dotColors = {
    open: "bg-white animate-pulse",
    pre: "bg-white",
    after: "bg-white/50",
    closed: "bg-muted-foreground"
  };

  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-medium ${statusColors[marketStatus.status as keyof typeof statusColors]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColors[marketStatus.status as keyof typeof dotColors]}`} />
      <span>{marketStatus.label}</span>
      <span className="opacity-75 hidden sm:inline">• {marketStatus.sublabel}</span>
    </div>
  );
};
