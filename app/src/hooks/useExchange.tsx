import { createContext, useContext, useState } from "react";
import { DEFAULT_EXCHANGE, getExchangeMeta, type ExchangeMeta } from "@/lib/exchanges";

// Mirrors components/theme/ThemeProvider.tsx's shape exactly: same
// localStorage-backed context pattern, just for "which exchange" instead
// of "which color scheme". Every screen that shows exchange-specific data
// (quotes, movers, screener, instruments, ...) should read the selected
// exchange from here rather than hardcoding "NSE", so switching countries
// in one place (the ExchangeSelector) updates the whole app.
type ExchangeContextState = {
  exchange: string;
  exchangeMeta: ExchangeMeta;
  setExchange: (code: string) => void;
};

const STORAGE_KEY = "continua-exchange";

const initialState: ExchangeContextState = {
  exchange: DEFAULT_EXCHANGE,
  exchangeMeta: getExchangeMeta(DEFAULT_EXCHANGE),
  setExchange: () => null,
};

const ExchangeContext = createContext<ExchangeContextState>(initialState);

export function ExchangeProvider({ children }: { children: React.ReactNode }) {
  const [exchange, setExchangeState] = useState<string>(
    () => DEFAULT_EXCHANGE
  );

  const value: ExchangeContextState = {
    exchange,
    exchangeMeta: getExchangeMeta(exchange),
    setExchange: (_code: string) => {
      localStorage.setItem(STORAGE_KEY, DEFAULT_EXCHANGE);
      setExchangeState(DEFAULT_EXCHANGE);
    },
  };

  return <ExchangeContext.Provider value={value}>{children}</ExchangeContext.Provider>;
}

export const useExchange = () => {
  const context = useContext(ExchangeContext);
  if (context === undefined) throw new Error("useExchange must be used within an ExchangeProvider");
  return context;
};
