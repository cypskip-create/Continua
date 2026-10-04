import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, ComposedChart, Bar } from "recharts";
// @ts-ignore: Ignore missing React type declarations in the local environment
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, TrendingDown, Crosshair, Ruler, PenTool, 
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Activity
} from "lucide-react";

interface EnhancedStockChartProps {
  symbol: string;
  timeframe: string;
}

const generateMockData = (timeframe: string) => {
  const dataPoints: { date: string; price: number; volume: number; timestamp: number; sma20?: number; sma50?: number; rsi?: number }[] = [];
  const basePrice = 150;
  let points = 30;

  switch (timeframe) {
    case "1D": points = 78; break;
    case "5D": case "1W": points = 35; break;
    case "1M": points = 22; break;
    case "3M": case "6M": points = 65; break;
    case "1Y": points = 252; break;
    case "ALL": case "5Y": points = 1260; break;
  }

  let currentPrice = basePrice;
  const prices: number[] = [];
  
  for (let i = 0; i < points; i++) {
    const date = new Date();
    
    if (timeframe === "1D") {
      date.setMinutes(date.getMinutes() - (points - i) * 5);
    } else {
      date.setDate(date.getDate() - (points - i));
    }
    
    const momentum = Math.random() > 0.48 ? 1 : -1;
    const volatility = timeframe === "1D" ? 0.3 : 0.8;
    const change = momentum * Math.random() * volatility;
    currentPrice = Math.max(basePrice * 0.7, Math.min(basePrice * 1.5, currentPrice + change));
    prices.push(currentPrice);

    // Calculate SMAs
    const sma20 = i >= 19 ? prices.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20 : undefined;
    const sma50 = i >= 49 ? prices.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50 : undefined;
    
    // Mock RSI (simplified)
    const rsi = 30 + Math.random() * 40;

    let formattedDate = "";
    if (timeframe === "1D") {
      formattedDate = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (timeframe === "1W" || timeframe === "5D") {
      formattedDate = date.toLocaleDateString('en-US', { weekday: 'short' });
    } else if (timeframe === "1M" || timeframe === "3M" || timeframe === "6M") {
      formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      formattedDate = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }

    dataPoints.push({
      date: formattedDate,
      price: parseFloat(currentPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000) + 500000,
      timestamp: date.getTime(),
      sma20,
      sma50,
      rsi
    });
  }

  return dataPoints;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
        <p className="text-foreground font-semibold text-lg">
          KES {data.price.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">
          Vol: {(data.volume / 1000000).toFixed(2)}M
        </p>
        {data.sma20 && (
          <p className="text-xs text-blue-500">SMA20: {data.sma20.toFixed(2)}</p>
        )}
        {data.sma50 && (
          <p className="text-xs text-orange-500">SMA50: {data.sma50.toFixed(2)}</p>
        )}
      </div>
    );
  }
  return null;
};

export const EnhancedStockChart = ({ symbol, timeframe }: EnhancedStockChartProps) => {
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [chartType, setChartType] = useState<"area" | "line">("area");
  
  const data = useMemo(() => generateMockData(timeframe), [timeframe]);
  
  const firstPrice = data[0]?.price || 0;
  const lastPrice = data[data.length - 1]?.price || 0;
  const isPositive = lastPrice >= firstPrice;
  const changePercent = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
  
  const strokeColor = isPositive ? "hsl(var(--bull))" : "hsl(var(--bear))";
  const gradientId = `colorPrice-${symbol}-${timeframe}`;

  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));
  const padding = (maxPrice - minPrice) * 0.1;

  const technicalIndicators = {
    rsi: data[data.length - 1]?.rsi?.toFixed(1) || "50",
    macd: isPositive ? "Bullish" : "Bearish",
    signal: isPositive ? "Buy" : "Sell"
  };

  return (
    <div className="space-y-3">
      {/* Chart Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <Badge variant={showVolume ? "default" : "outline"} className="text-xs cursor-pointer" onClick={() => setShowVolume(!showVolume)}>
            <Activity className="h-3 w-3 mr-1" />
            Volume
          </Badge>
          <Badge variant={showSMA20 ? "default" : "outline"} className="text-xs cursor-pointer" onClick={() => setShowSMA20(!showSMA20)}>
            SMA 20
          </Badge>
          <Badge variant={showSMA50 ? "default" : "outline"} className="text-xs cursor-pointer" onClick={() => setShowSMA50(!showSMA50)}>
            SMA 50
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Crosshair className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Ruler className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <PenTool className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Price Summary */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-2xl font-bold">KES {lastPrice.toFixed(2)}</span>
          <div className={`flex items-center text-sm ${isPositive ? 'text-bull' : 'text-bear'}`}>
            {isPositive ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
            <span>{isPositive ? '+' : ''}{changePercent}%</span>
            <span className="text-muted-foreground ml-2">
              ({isPositive ? '+' : ''}KES {(lastPrice - firstPrice).toFixed(2)})
            </span>
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-muted-foreground">RSI: <span className="text-foreground">{technicalIndicators.rsi}</span></div>
          <div className="text-muted-foreground">MACD: <span className={isPositive ? 'text-bull' : 'text-bear'}>{technicalIndicators.macd}</span></div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide={true} />
            <YAxis hide={true} domain={[minPrice - padding, maxPrice + padding]} yAxisId="price" />
            <YAxis hide={true} orientation="right" yAxisId="volume" />
            <Tooltip content={<CustomTooltip />} />
            
            {showVolume && (
              <Bar 
                dataKey="volume" 
                yAxisId="volume" 
                fill="hsl(var(--muted))" 
                opacity={0.3}
                barSize={2}
              />
            )}
            
            <Area 
              type="monotone" 
              dataKey="price" 
              yAxisId="price"
              stroke={strokeColor}
              strokeWidth={2}
              fill={chartType === "area" ? `url(#${gradientId})` : "transparent"}
              dot={false}
              activeDot={{ r: 4, fill: strokeColor, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
            />
            
            {showSMA20 && (
              <Area 
                type="monotone" 
                dataKey="sma20" 
                yAxisId="price"
                stroke="#3b82f6"
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="transparent"
                dot={false}
              />
            )}
            
            {showSMA50 && (
              <Area 
                type="monotone" 
                dataKey="sma50" 
                yAxisId="price"
                stroke="#f97316"
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="transparent"
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Technical Indicators Summary */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
        <div className="text-center">
          <p className="text-[0.625rem] text-muted-foreground">Open</p>
          <p className="text-xs font-medium">KES {firstPrice.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-[0.625rem] text-muted-foreground">High</p>
          <p className="text-xs font-medium">KES {maxPrice.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-[0.625rem] text-muted-foreground">Low</p>
          <p className="text-xs font-medium">KES {minPrice.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-[0.625rem] text-muted-foreground">Signal</p>
          <Badge variant={isPositive ? "default" : "destructive"} className="text-[0.625rem] px-1">
            {technicalIndicators.signal}
          </Badge>
        </div>
      </div>
    </div>
  );
};
