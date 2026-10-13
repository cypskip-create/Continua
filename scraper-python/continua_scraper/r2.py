"""Native private evidence storage. File bodies and verification are streaming."""
import hashlib
import os
import re

def safe_key(value):
    if not value or len(value)>1024 or any(part in ("",".","..") for part in value.split("/")) or re.search(r"[\\\x00-\x1f?#]",value):
        raise ValueError("Invalid artifact key")
    return value

class R2Storage:
    def __init__(self,client,bucket,*,rollback_write=None,dual_write=True,max_bytes=50*1024*1024):
        self.client,self.bucket=client,bucket
        self.rollback_write,self.dual_write=rollback_write,dual_write
        self.max_bytes=max_bytes

    @classmethod
    def from_environment(cls,*,rollback_write=None):
        import boto3
        from botocore.config import Config
        account=os.environ.get("R2_ACCOUNT_ID","")
        bucket=os.environ.get("R2_BUCKET","")
        key=os.environ.get("R2_ACCESS_KEY_ID","")
        secret=os.environ.get("R2_SECRET_ACCESS_KEY","")
        if not re.fullmatch(r"[a-f0-9]{32}",account) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]",bucket) or not key or not secret:
            raise ValueError("Private R2 configuration is incomplete")
        client=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",aws_access_key_id=key,aws_secret_access_key=secret,
            config=Config(connect_timeout=10,read_timeout=60,retries={"max_attempts":3,"mode":"standard"},request_checksum_calculation="when_required",response_checksum_validation="when_required"))
        return cls(client,bucket,rollback_write=rollback_write,dual_write=os.environ.get("R2_DUAL_WRITE","true").lower() in ("true","1","yes"))

    def upload(self,key,artifact):
        safe_key(key)
        if key.split("/")[-1].split(".")[0]!=artifact.sha256 or artifact.size>self.max_bytes:
            raise ValueError("Invalid artifact content")
        digest=hashlib.sha256()
        with artifact.path.open("rb") as body:
            while chunk:=body.read(65536):
                digest.update(chunk)
            if digest.hexdigest()!=artifact.sha256 or body.tell()!=artifact.size:
                raise ValueError("Artifact content changed")
            body.seek(0)
            try:
                self.client.put_object(Bucket=self.bucket,Key=key,Body=body,ContentLength=artifact.size,ContentType=artifact.content_type,Metadata={"sha256":artifact.sha256},IfNoneMatch="*")
            except Exception as error:
                if getattr(error,"response",{}).get("ResponseMetadata",{}).get("HTTPStatusCode")!=412:
                    raise
        stored=self.client.get_object(Bucket=self.bucket,Key=key)
        digest,total=hashlib.sha256(),0
        try:
            if stored.get("ContentLength")!=artifact.size:
                raise ValueError("R2 size verification failed")
            while chunk:=stored["Body"].read(65536):
                total+=len(chunk)
                if total>artifact.size:
                    raise ValueError("R2 size verification failed")
                digest.update(chunk)
            if total!=artifact.size or digest.hexdigest()!=artifact.sha256:
                raise ValueError("R2 checksum verification failed")
        finally:
            stored["Body"].close()
        if self.dual_write:
            if self.rollback_write is None:
                raise ValueError("Required rollback copy is not configured")
            self.rollback_write(key,artifact)
        # Only this verified return value may become the database storage_path.
        return f"r2://{self.bucket}/{key}"
