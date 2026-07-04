"""Storage abstraction: local disk (default) + Google Cloud Storage (opt-in).

Selection is driven by the presence of GCS_BUCKET_NAME + (GOOGLE_APPLICATION_CREDENTIALS
or Application Default Credentials). Falls back silently to local storage.
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

LOCAL_STORAGE_DIR = Path(os.environ.get("LOCAL_STORAGE_DIR", "/app/backend/storage_data"))
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME")


class LocalStorage:
    kind = "local"

    def __init__(self, base_dir: Path = LOCAL_STORAGE_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, key: str, data: bytes) -> str:
        target = self.base_dir / key
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as f:
            f.write(data)
        return str(target)

    def read_bytes(self, key: str) -> bytes:
        target = self.base_dir / key
        if not target.exists():
            raise FileNotFoundError(key)
        return target.read_bytes()

    def local_path(self, key: str) -> str:
        return str(self.base_dir / key)

    def exists(self, key: str) -> bool:
        return (self.base_dir / key).exists()

    def delete(self, key: str) -> None:
        target = self.base_dir / key
        if target.exists():
            target.unlink()


class GCSStorage:
    kind = "gcs"

    def __init__(self, bucket_name: str):
        from google.cloud import storage as gcs_storage
        self._client = gcs_storage.Client()
        self._bucket = self._client.bucket(bucket_name)
        self._cache_dir = LOCAL_STORAGE_DIR / "_gcs_cache"
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, key: str, data: bytes) -> str:
        blob = self._bucket.blob(key)
        blob.upload_from_string(data)
        return f"gs://{self._bucket.name}/{key}"

    def read_bytes(self, key: str) -> bytes:
        blob = self._bucket.blob(key)
        return blob.download_as_bytes()

    def local_path(self, key: str) -> str:
        """Ensure a local file exists (download if needed) and return its path.
        Used for parselmouth which needs a filesystem path."""
        target = self._cache_dir / key.replace("/", "_")
        if not target.exists():
            data = self.read_bytes(key)
            target.write_bytes(data)
        return str(target)

    def exists(self, key: str) -> bool:
        return self._bucket.blob(key).exists()

    def delete(self, key: str) -> None:
        blob = self._bucket.blob(key)
        if blob.exists():
            blob.delete()


_backend: Optional[object] = None


def get_storage():
    """Return a lazily-initialized storage backend (singleton)."""
    global _backend
    if _backend is not None:
        return _backend

    if GCS_BUCKET_NAME:
        try:
            _backend = GCSStorage(GCS_BUCKET_NAME)
            logger.info("Storage backend: Google Cloud Storage (bucket=%s)", GCS_BUCKET_NAME)
            return _backend
        except Exception as e:
            logger.warning("GCS init failed, falling back to local storage: %s", e)

    _backend = LocalStorage()
    logger.info("Storage backend: Local disk at %s", LOCAL_STORAGE_DIR)
    return _backend
