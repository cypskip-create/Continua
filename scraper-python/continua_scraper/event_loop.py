"""psycopg-compatible loop selection without deprecated global policies."""
import asyncio
import os

def database_event_loop():
    loop=asyncio.SelectorEventLoop() if os.name=='nt' else asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    return loop
