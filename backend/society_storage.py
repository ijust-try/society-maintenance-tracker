import hashlib
import os
import time
from fastapi import HTTPException, UploadFile
import requests

CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")
UPLOAD_FOLDER = os.environ.get("CLOUDINARY_UPLOAD_FOLDER", "society-maintenance")
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
ALLOWED_MIME_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _require_config():
    if not (CLOUD_NAME and API_KEY and API_SECRET):
        raise HTTPException(status_code=503, detail="Photo storage is not configured")


def _signature(params: dict) -> str:
    canonical = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hashlib.sha1((canonical + API_SECRET).encode("utf-8")).hexdigest()


def create_upload_signature() -> dict:
    _require_config()
    timestamp = int(time.time())
    params = {"folder": UPLOAD_FOLDER, "timestamp": timestamp}
    return {
        "cloud_name": CLOUD_NAME,
        "api_key": API_KEY,
        "timestamp": timestamp,
        "folder": UPLOAD_FOLDER,
        "signature": _signature(params),
        "resource_type": "image",
    }


async def upload_photo(file: UploadFile) -> dict:
    _require_config()
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG and WEBP images are allowed")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Photo must be 5 MB or smaller")
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded photo is empty")

    timestamp = int(time.time())
    params = {"folder": UPLOAD_FOLDER, "timestamp": timestamp}
    data = {
        "api_key": API_KEY,
        "timestamp": timestamp,
        "folder": UPLOAD_FOLDER,
        "signature": _signature(params),
    }
    endpoint = f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload"
    try:
        response = requests.post(endpoint, data=data, files={"file": (file.filename or "photo", content, file.content_type)}, timeout=30)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Photo storage service is unavailable") from exc

    public_id = payload.get("public_id", "")
    secure_url = payload.get("secure_url")
    if not secure_url or not public_id.startswith(UPLOAD_FOLDER + "/"):
        raise HTTPException(status_code=502, detail="Photo storage returned an invalid result")
    return {"photo_url": secure_url, "photo_public_id": public_id}


def validate_uploaded_photo_url(url: str | None, public_id: str | None) -> None:
    if not url:
        return
    _require_config()
    if not public_id:
        raise HTTPException(status_code=400, detail="Photo identifier is required")
    if f"res.cloudinary.com/{CLOUD_NAME}/" not in url:
        raise HTTPException(status_code=400, detail="Photo URL is not from the configured image storage")
    if not public_id.startswith(UPLOAD_FOLDER + "/"):
        raise HTTPException(status_code=400, detail="Invalid photo identifier")
