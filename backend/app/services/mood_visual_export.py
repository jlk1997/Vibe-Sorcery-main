"""Render mood visual slideshow as MP4 via ffmpeg."""

from __future__ import annotations

import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import User, Work, WorkExport
from app.services.credits import deduct_credits
from app.services.mood_visual import build_mood_visual_manifest, fetch_work_audio_bytes
from app.services.storage import get_storage_service
from app.services.subscriptions import is_active_subscriber

from app.services.ecosystem import (
    MEMBER_FREE_MV_PER_MONTH,
    _member_export_count_this_month,
)

MV_VIDEO_CREDIT_COST = 2
WIDTH = 1280
HEIGHT = 720


def _mv_video_cost(db: Session, user: User) -> int:
    if is_active_subscriber(db, user.id) and _member_export_count_this_month(db, user.id, "mv_video") < MEMBER_FREE_MV_PER_MONTH:
        return 0
    return MV_VIDEO_CREDIT_COST


def _fetch_url_bytes(url: str) -> bytes | None:
    try:
        resp = httpx.get(url, timeout=60)
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace(":", "\\:")
        .replace("%", "\\%")
        .replace("\n", " ")
    )[:120]


def _render_text_png(text: str, out: Path) -> bool:
    safe = _escape_drawtext(text or "Vibe Sorcery")
    cmd = [
        settings.ffmpeg_path,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=0x1a0a2e:s={WIDTH}x{HEIGHT}:d=1",
        "-vf",
        f"drawtext=text='{safe}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2",
        "-frames:v",
        "1",
        str(out),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=45)
        return out.is_file()
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _normalize_image(src: Path, out: Path) -> bool:
    cmd = [
        settings.ffmpeg_path,
        "-y",
        "-i",
        str(src),
        "-vf",
        f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x1a0a2e",
        "-frames:v",
        "1",
        str(out),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=45)
        return out.is_file()
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _slide_text(slide: dict[str, Any]) -> str:
    if slide.get("type") == "emotion":
        a = slide.get("arousal", "—")
        v = slide.get("valence", "—")
        return f"Arousal {a} · Valence {v}"
    return (slide.get("text") or slide.get("caption") or "Vibe Sorcery").strip()


def _prepare_slide_images(slides: list[dict[str, Any]], tmp: Path) -> list[tuple[Path, float]]:
    prepared: list[tuple[Path, float]] = []
    for i, slide in enumerate(slides):
        duration = float(slide.get("duration_sec") or 3)
        out = tmp / f"slide_{i:03d}.png"
        ok = False
        if slide.get("type") == "cover" and slide.get("image_url"):
            raw = tmp / f"slide_{i:03d}_raw"
            data = _fetch_url_bytes(slide["image_url"])
            if data:
                raw.write_bytes(data)
                ok = _normalize_image(raw, out)
        if not ok:
            ok = _render_text_png(_slide_text(slide), out)
        if ok:
            prepared.append((out, duration))
    return prepared


def render_mood_visual_mp4(slides: list[dict[str, Any]], audio_bytes: bytes) -> bytes | None:
    if not slides:
        return None
    prepared = None
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        prepared = _prepare_slide_images(slides, tmp)
        if not prepared:
            return None

        audio_path = tmp / "audio.mp3"
        audio_path.write_bytes(audio_bytes)

        concat_path = tmp / "slideshow.txt"
        lines: list[str] = []
        for img, duration in prepared:
            escaped = str(img).replace("\\", "/").replace("'", "'\\''")
            lines.append(f"file '{escaped}'")
            lines.append(f"duration {duration}")
        last_img = str(prepared[-1][0]).replace("\\", "/").replace("'", "'\\''")
        lines.append(f"file '{last_img}'")
        concat_path.write_text("\n".join(lines), encoding="utf-8")

        silent_video = tmp / "silent.mp4"
        cmd_video = [
            settings.ffmpeg_path,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_path),
            "-vf",
            f"fps=24,scale={WIDTH}:{HEIGHT}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(silent_video),
        ]
        try:
            subprocess.run(cmd_video, check=True, capture_output=True, timeout=180)
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return None

        output = tmp / "mood_mv.mp4"
        cmd_mux = [
            settings.ffmpeg_path,
            "-y",
            "-i",
            str(silent_video),
            "-i",
            str(audio_path),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output),
        ]
        try:
            subprocess.run(cmd_mux, check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return None

        if not output.is_file():
            return None
        return output.read_bytes()


def export_mood_visual_video(db: Session, user: User, work: Work) -> dict[str, Any]:
    manifest = build_mood_visual_manifest(db, work)
    slides = manifest.get("slides") or []
    if not slides:
        raise HTTPException(status_code=400, detail="No visual content for this work")

    cost = _mv_video_cost(db, user)
    if cost > 0 and not deduct_credits(db, user.id, cost, source="export_mv_video"):
        raise HTTPException(status_code=402, detail="Insufficient credits for MV export")

    audio_bytes = fetch_work_audio_bytes(work)
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Could not load work audio")

    mp4_bytes = render_mood_visual_mp4(slides, audio_bytes)
    if not mp4_bytes:
        raise HTTPException(status_code=503, detail="MV export unavailable (ffmpeg required)")

    key = f"mv/{work.id}/{uuid.uuid4().hex}.mp4"
    storage_key, url = get_storage_service().upload_bytes(mp4_bytes, key, "video/mp4")

    row = WorkExport(
        work_id=work.id,
        user_id=user.id,
        export_type="mv_video",
        status="ready",
        meta={
            "title": work.title,
            "format": "mp4",
            "storage_key": storage_key,
            "download_url": url,
            "slide_count": len(slides),
            "cost": cost,
        },
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": str(row.id),
        "export_type": "mv_video",
        "download_url": url,
        "cost": cost,
        "meta": row.meta,
    }
