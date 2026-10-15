"""Per-process logical payload counters, not a replacement for Render billing."""
import threading

class TransferCounters:
    def __init__(self):
        self._lock=threading.Lock()
        self._values={key:0 for key in ('uploadPayloadBytesAttempted','uploadedObjectsVerified','existingObjectsVerified','uploadPayloadBytesAvoided','legacyUploadPayloadBytesAttempted')}
    def add(self,key,value):
        if key not in self._values or type(value) is not int or value<0:raise ValueError('Invalid transfer counter')
        with self._lock:self._values[key]+=value
    def snapshot(self):
        with self._lock:values=dict(self._values)
        return {'scope':'current-process logical payload; SDK retries, headers, API and database traffic are excluded','counters':values}
