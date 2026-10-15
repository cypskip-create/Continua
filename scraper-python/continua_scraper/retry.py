"""Native bounded retry; cancellation is never turned into another attempt."""
import asyncio
import math
import random
from .transfer_budget import retry

async def with_retry(operation,*,max_retries,base_delay_ms,is_retryable=None,on_retry=None,sleep=asyncio.sleep,random_value=random.random):
    if not callable(operation) or type(max_retries) is not int or not 0<=max_retries<=10:
        raise ValueError('Invalid retry operation or attempt budget')
    if isinstance(base_delay_ms,bool) or not isinstance(base_delay_ms,(int,float)) or not math.isfinite(base_delay_ms) or base_delay_ms<0:
        raise ValueError('Invalid retry delay')
    delays=[base_delay_ms/1000*2**attempt for attempt in range(max_retries)]
    if any(delay*1.2>300 for delay in delays):raise ValueError('Retry delay budget exceeded')
    for attempt in range(max_retries+1):
        try:return await operation()
        except asyncio.CancelledError:raise
        except Exception as error:
            if attempt==max_retries or (is_retryable is not None and not is_retryable(error)):raise
            retry()
            spread=random_value()
            if not isinstance(spread,(int,float)) or not math.isfinite(spread) or not 0<=spread<=1:raise ValueError('Invalid retry randomness') from None
            if on_retry is not None:
                pending=on_retry(attempt+1,error)
                if hasattr(pending,'__await__'):await pending
            await sleep(max(0,delays[attempt]*(1+.2*(spread*2-1))))
