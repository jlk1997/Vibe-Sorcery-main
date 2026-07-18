import io
import time
import uuid
from typing import BinaryIO, Optional

import boto3
from botocore.client import Config

from app.config import settings

_PRESIGN_CACHE: dict[str, tuple[float, str]] = {}
_PRESIGN_TTL = 1800  # 30 min — URLs valid 24h; avoid repeated signing


class StorageService:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4"),
            use_ssl=settings.s3_use_ssl,
        )
        self.bucket = settings.s3_bucket
        self._ready = False

    def _ensure_bucket(self):
        if self._ready:
            return
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self.client.create_bucket(Bucket=self.bucket)
            except Exception:
                pass
        self._ready = True

    def upload_file(
        self,
        file_obj: BinaryIO,
        key: str,
        content_type: str = "audio/mpeg",
    ) -> tuple[str, str]:
        self._ensure_bucket()
        self.client.upload_fileobj(
            file_obj,
            self.bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return key, self.get_presigned_url(key)

    def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: str = "audio/mpeg",
    ) -> tuple[str, str]:
        return self.upload_file(io.BytesIO(data), key, content_type)

    def generate_work_key(self, user_id: str, extension: str = "mp3") -> str:
        return f"works/{user_id}/{uuid.uuid4()}.{extension}"

    def generate_avatar_key(self, user_id: str, extension: str = "jpg") -> str:
        return f"avatars/{user_id}/{uuid.uuid4()}.{extension}"

    def get_presigned_put_url(self, key: str, content_type: str = "image/jpeg", expires: int = 3600) -> str:
        self._ensure_bucket()
        url = self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=expires,
        )
        if settings.s3_public_endpoint != settings.s3_endpoint:
            url = url.replace(settings.s3_endpoint, settings.s3_public_endpoint, 1)
        return url

    def get_object_bytes(self, key: str) -> bytes:
        self._ensure_bucket()
        resp = self.client.get_object(Bucket=self.bucket, Key=key)
        try:
            return resp["Body"].read()
        finally:
            resp["Body"].close()

    def delete_object(self, key: str) -> None:
        self._ensure_bucket()
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            pass

    def get_presigned_url(self, key: str, expires: int = 86400) -> str:
        cache_key = f"{key}:{expires}"
        cached = _PRESIGN_CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        self._ensure_bucket()
        url = self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )
        if settings.s3_public_endpoint != settings.s3_endpoint:
            url = url.replace(settings.s3_endpoint, settings.s3_public_endpoint, 1)

        _PRESIGN_CACHE[cache_key] = (time.monotonic() + _PRESIGN_TTL, url)
        if len(_PRESIGN_CACHE) > 2000:
            now = time.monotonic()
            for k in list(_PRESIGN_CACHE):
                if _PRESIGN_CACHE[k][0] <= now:
                    _PRESIGN_CACHE.pop(k, None)
        return url


_storage: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    global _storage
    if _storage is None:
        _storage = StorageService()
    return _storage
