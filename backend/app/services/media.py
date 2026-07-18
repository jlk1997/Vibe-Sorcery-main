import hashlib
import json
import subprocess
import tempfile
import uuid
from pathlib import Path

from app.config import settings
from app.services.storage import get_storage_service


def transcode_to_hls(source_bytes: bytes, work_id: str) -> dict:
    """Convert audio to HLS segments and upload to object storage."""
    storage = get_storage_service()
    prefix = f"hls/{work_id}/{uuid.uuid4().hex}"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src = tmp_path / "source.mp3"
        src.write_bytes(source_bytes)
        playlist = tmp_path / "index.m3u8"
        segment_pattern = tmp_path / "seg_%03d.ts"

        cmd = [
            settings.ffmpeg_path,
            "-y",
            "-i",
            str(src),
            "-codec:a",
            "aac",
            "-b:a",
            "128k",
            "-f",
            "hls",
            "-hls_time",
            "6",
            "-hls_list_size",
            "0",
            "-hls_segment_filename",
            str(segment_pattern),
            str(playlist),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            return {
                "status": "skipped",
                "reason": str(e),
                "hls_url": None,
                "prefix": None,
            }

        uploaded_keys = []
        for f in sorted(tmp_path.iterdir()):
            if f.suffix in (".m3u8", ".ts"):
                key = f"{prefix}/{f.name}"
                content_type = "application/vnd.apple.mpegurl" if f.suffix == ".m3u8" else "video/mp2t"
                storage.upload_bytes(f.read_bytes(), key, content_type)
                uploaded_keys.append(key)

        m3u8_key = f"{prefix}/index.m3u8"
        hls_url = storage.get_presigned_url(m3u8_key, expires=86400 * 7)
        if settings.cdn_base_url:
            hls_url = f"{settings.cdn_url}/{storage.bucket}/{m3u8_key}"

        return {
            "status": "completed",
            "hls_url": hls_url,
            "prefix": prefix,
            "segments": len([k for k in uploaded_keys if k.endswith(".ts")]),
        }


def generate_waveform_preview(source_bytes: bytes) -> bytes | None:
    """Generate a simple waveform PNG placeholder using numpy if librosa unavailable."""
    try:
        import io
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
        import librosa

        y, _ = librosa.load(io.BytesIO(source_bytes), sr=22050, mono=True, duration=30)
        fig, ax = plt.subplots(figsize=(6, 1.5))
        ax.plot(np.linspace(0, len(y), len(y)), y, color="#7c3aed", linewidth=0.5)
        ax.axis("off")
        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight", transparent=True)
        plt.close(fig)
        return buf.getvalue()
    except Exception:
        return None
