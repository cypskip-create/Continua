"""Shared logical-transfer ceiling for one bounded scheduled collection run.

Not a cloud invoice meter: database traffic, TLS framing and SDK headers are
excluded. The scheduler reserves the full ceiling durably before doing work.
"""
import threading

class TransferLimitReached(RuntimeError):
    pass

class TransferBudget:
    def __init__(self, limit):
        if type(limit) is not int or not 1 <= limit <= 1024**3:
            raise ValueError('Invalid logical transfer limit')
        self.limit=limit
        self.values={'downloadBytes':0,'uploadBytes':0}
        self.lock=threading.Lock()
        self.retries=0
    def consume(self,direction,size):
        if direction not in self.values or type(size) is not int or size<0:
            raise ValueError('Invalid logical transfer accounting')
        with self.lock:
            if sum(self.values.values())+size>self.limit:
                raise TransferLimitReached('Logical transfer budget reached')
            self.values[direction]+=size
    def snapshot(self):
        with self.lock:return dict(self.values,limitBytes=self.limit,retryCount=self.retries)

def retry():
    if active is not None:
        with active.lock:active.retries+=1

# A scheduled process runs one job serially. Threads share the same limiter.
active=None

def account(direction,size):
    if active is not None:active.consume(direction,size)

class MeteredReader:
    def __init__(self,reader):self.reader=reader
    async def read(self,n=-1):
        data=await self.reader.read(n);account('downloadBytes',len(data));return data
    async def readline(self):
        data=await self.reader.readline();account('downloadBytes',len(data));return data
    async def readexactly(self,n):
        data=await self.reader.readexactly(n);account('downloadBytes',len(data));return data
