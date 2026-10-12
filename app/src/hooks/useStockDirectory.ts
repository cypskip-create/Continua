import {useMemo} from 'react';
import {useInstruments} from './useInstruments';
import {stockDirectory} from '../lib/stockDirectory';
export function useStockDirectory(){
 const {instruments,isLoading,isError}=useInstruments('NSE');
 const directory=useMemo(()=>stockDirectory(instruments),[instruments]);
 const symbols=useMemo(()=>directory.map(stock=>stock.symbol),[directory]);
 const metadata=useMemo(()=>Object.fromEntries(directory.map(stock=>[stock.symbol,{name:stock.name,sector:stock.sector}])),[directory]);
 return {directory,symbols,metadata,isLoading,isError};
}
