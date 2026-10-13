"""A bounded heavy-work scheduler: one browser/PDF/archive job at a time."""
import asyncio

class QueueFull(Exception):
    pass

class SerialWorkQueue:
    def __init__(self,max_waiting=25):
        if type(max_waiting) is not int or max_waiting<1:
            raise ValueError("invalid queue capacity")
        self.lock=asyncio.Lock()
        self.max_waiting=max_waiting
        self.waiting=0
        self.closed=False

    async def run(self,work):
        if self.closed:
            raise RuntimeError("queue closed")
        if self.waiting>=self.max_waiting:
            raise QueueFull("heavy-work queue is full")
        self.waiting+=1
        try:
            async with self.lock:
                return await work()
        finally:
            self.waiting-=1

    async def close(self):
        self.closed=True
        async with self.lock:
            pass
