"""Exact byte hashes, with a bounded file path for document-sized evidence."""
import hashlib

def sha256(data):
    if not isinstance(data,(bytes,bytearray,memoryview)):raise TypeError('Byte evidence required')
    return hashlib.sha256(data).hexdigest()

def sha256_file(path,*,max_bytes=50*1024*1024):
    if type(max_bytes) is not int or max_bytes<1:raise ValueError('Invalid evidence budget')
    digest=hashlib.sha256();size=0
    with open(path,'rb') as body:
        while chunk:=body.read(65536):
            size+=len(chunk)
            if size>max_bytes:raise ValueError('Evidence hash byte budget exceeded')
            digest.update(chunk)
    return digest.hexdigest()
