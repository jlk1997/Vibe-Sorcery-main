import asyncio
import hashlib
import hmac
import json
import os
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.core.emotion_engine import emotion_engine
from app.core.music_prompt_builder import MusicCreativeSpec
from app.core.journey_math import duration_from_preference, target_av_for_step
from app.core.style_presets import get_preset
from app.integrations.minimax.client import MiniMaxClient, minimax_client
from app.models.schemas import (
    EmotionEmbedding,
    GenerationJob,
    Playlist,
    PlaylistTrack,
    ProvenanceRecord,
    User,
    Work,
)
from app.services.storage import get_storage_service
from app.services.job_progress import update_job_phase
from app.services.reference_track import apply_reference_emotion, resolve_reference_config
from app.config import settings as app_settings


def shift_stage_label(step: int, total: int) -> str:
    if step <= 1:
        return "起点"
    if step >= total:
        return "终点"
    return "过渡"


def resolve_playlist_title(journey_config: dict) -> str:
    raw = journey_config.get("title")
    if isinstance(raw, str):
        stripped = raw.strip()
        if stripped:
            return stripped
    return "Emotional Journey"


def build_share_text(journey_config: dict) -> str:
    curve = journey_config.get("target_curve", "calm_to_energy")
    labels = {
        "calm_to_energy": "从平静到能量",
        "sad_to_hope": "从低落到希望",
        "chaos_to_order": "从纷乱到安定",
        "neutral": "心情转换",
    }
    label = labels.get(curve, "心情转换")
    title = resolve_playlist_title(journey_config)
    steps = journey_config.get("steps", 6)
    return f"{title} · {label} · {steps} 轨转换旅程"


class PlaylistOrchestrator:
    """Markov-chain playlist generation with MiniMax + provenance persistence."""

    def __init__(
        self,
        db: Session,
        minimax: MiniMaxClient | None = None,
    ):
        self.db = db
        self.minimax = minimax or minimax_client

    def _sign_provenance(self, record: dict) -> str:
        payload = json.dumps(record, sort_keys=True, default=str)
        return hmac.new(
            settings.jwt_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()

    def _is_cancelled(self, job_id: uuid.UUID) -> bool:
        self.db.expire_all()
        job = self.db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        return job is not None and job.status == "cancelled"

    def _update_job_progress(
        self,
        job: GenerationJob,
        playlist_id: uuid.UUID,
        completed_steps: list[dict],
    ):
        work_ids = [s["work_id"] for s in completed_steps]
        job.result = {
            "playlist_id": str(playlist_id),
            "work_ids": work_ids,
            "completed_steps": completed_steps,
        }
        job.progress = len(completed_steps) / max(job.total_steps or 1, 1)
        job.current_step = len(completed_steps)
        if job.current_step >= (job.total_steps or 1):
            job.status_message = "生成完成"
        self.db.commit()

    def _abort_partial_playlist(
        self,
        job: GenerationJob,
        playlist_id: uuid.UUID,
        completed_steps: list[dict],
        works_created: list[str],
        exc: Exception,
        *,
        failed_at_step: int,
    ) -> None:
        if not completed_steps:
            raise exc
        from app.workers.errors import PartialPlaylistError

        job.result = {
            "playlist_id": str(playlist_id),
            "work_ids": works_created,
            "completed_steps": completed_steps,
            "partial": True,
            "failed_at_step": failed_at_step,
        }
        job.playlist_id = playlist_id
        job.status_message = f"部分完成（{len(completed_steps)}/{job.total_steps or len(completed_steps)} 首）"
        self.db.commit()
        raise PartialPlaylistError(str(exc)) from exc

    async def _generate_track_audio(
        self,
        *,
        job: GenerationJob,
        step: int,
        prompt: str,
        instrumental: bool,
        owner_id: uuid.UUID,
        mock_audio_bytes: bytes | None = None,
    ):
        gen_seed = hash(f"{job.id}-{step}") % 1_000_000
        last_exc: Exception | None = None
        for attempt in range(2):
            try:
                music_result = await self.minimax.generate_music(
                    prompt=prompt,
                    is_instrumental=instrumental,
                    seed=gen_seed,
                    db=self.db,
                    user_id=str(owner_id),
                    mock_audio_bytes=mock_audio_bytes if settings.use_mock_ai else None,
                )
                if not music_result.audio_bytes:
                    raise RuntimeError("No audio returned from MiniMax")
                return music_result, gen_seed
            except Exception as exc:
                last_exc = exc
                if attempt == 0:
                    await asyncio.sleep(3)
        raise last_exc or RuntimeError("Track generation failed")

    async def generate_playlist(
        self,
        job: GenerationJob,
        owner_id: uuid.UUID,
        journey_config: dict,
        music_params: dict,
        seed_audio_bytes: bytes | None = None,
        seed_filename: str = "seed.wav",
        anchor_context: dict | None = None,
    ) -> dict:
        mode = journey_config.get("mode", "prompt_journey")
        if seed_audio_bytes is not None or mode in ("markov", "audio_anchor"):
            if seed_audio_bytes is None:
                raise RuntimeError("markov/audio_anchor mode requires seed audio")
            return await self._generate_markov_playlist(
                job, owner_id, seed_audio_bytes, seed_filename, journey_config, music_params
            )
        return await self._generate_prompt_journey(
            job, owner_id, journey_config, music_params, anchor_context or {}
        )

    async def _generate_prompt_journey(
        self,
        job: GenerationJob,
        owner_id: uuid.UUID,
        journey_config: dict,
        music_params: dict,
        anchor_context: dict,
    ) -> dict:
        """Intent-first playlist: no user seed required."""
        job.status = "running"
        steps = journey_config.get("steps", 6)
        job.total_steps = steps
        update_job_phase(self.db, job, progress=0.05, status_message="任务已排队，准备开始…", phase="queued")

        track_duration = duration_from_preference(music_params.get("duration_preference"))
        waypoints = journey_config.get("waypoints") or []
        target_curve = journey_config.get("target_curve", "calm_to_energy")
        instrumental = journey_config.get("instrumental", True)
        bpm_range_list = music_params.get("bpm_range", [80, 120])
        bpm_range = (int(bpm_range_list[0]), int(bpm_range_list[1])) if bpm_range_list else (80, 120)

        preset = get_preset(anchor_context.get("preset_id") or "")
        base = emotion_engine.infer_from_intent(
            text_intent=anchor_context.get("text_intent"),
            preset=preset,
            preference_moods=anchor_context.get("moods"),
            preference_genres=anchor_context.get("genres"),
        )
        if anchor_context.get("moods"):
            base["moods"] = list(anchor_context["moods"])
        if anchor_context.get("genres"):
            base["genres"] = list(anchor_context["genres"])

        reference_cfg = resolve_reference_config(journey_config, anchor_context)
        ref_work_uuid = None
        if reference_cfg:
            base, ref_work_uuid = apply_reference_emotion(
                self.db,
                base,
                reference_cfg.get("work_id"),
                av_offset=reference_cfg.get("av_offset"),
            )

        text_intent = anchor_context.get("text_intent") or ""
        spec_raw = anchor_context.get("creative_spec")
        if isinstance(spec_raw, dict):
            base_spec = MusicCreativeSpec.model_validate(spec_raw)
        else:
            base_spec = MusicCreativeSpec(
                moods=base["moods"],
                genres=base["genres"],
                text_intent=text_intent,
                bpm_range=[bpm_range[0], bpm_range[1]],
                key=str(music_params.get("key", "auto")),
            )
        owner = self.db.query(User).filter(User.id == owner_id).first()
        owner_tenant = owner.tenant_id if owner else app_settings.default_tenant_id

        playlist = Playlist(
            owner_id=owner_id,
            title=resolve_playlist_title(journey_config),
            journey_config={
                **journey_config,
                "mode": "prompt_journey",
                "share_text": build_share_text(journey_config),
            },
            visibility="private",
        )
        self.db.add(playlist)
        self.db.flush()

        works_created: list[str] = []
        completed_steps: list[dict] = []
        parent_work: Work | None = None

        for step in range(1, steps + 1):
            if self._is_cancelled(job.id):
                job.status = "cancelled"
                job.error_message = "Cancelled by user"
                job.status_message = "已取消"
                self.db.commit()
                return job.result or {}

            update_job_phase(
                self.db,
                job,
                progress=(step - 1) / steps,
                status_message=f"正在生成第 {step} / {steps} 首…",
                current_step=step,
                phase=f"track_{step}",
            )

            target_av = target_av_for_step(step, steps, waypoints, target_curve)
            step_moods = list(base["moods"])
            step_genres = list(base["genres"])

            prompt_data = await self.minimax.build_music_prompt(
                moods=step_moods,
                genres=step_genres,
                step=step,
                total_steps=steps,
                target_curve=target_curve,
                bpm_range=bpm_range,
                key=music_params.get("key", "auto"),
                instrumental=instrumental,
                target_av=target_av,
                text_intent=text_intent,
                creative_spec=base_spec,
                db=self.db,
                user_id=str(owner_id),
            )

            gen_seed = hash(f"{job.id}-{step}") % 1_000_000
            try:
                music_result, gen_seed = await self._generate_track_audio(
                    job=job,
                    step=step,
                    prompt=prompt_data.get("prompt", text_intent or "ambient emotional music"),
                    instrumental=instrumental,
                    owner_id=owner_id,
                )
            except Exception as exc:
                self._abort_partial_playlist(
                    job, playlist.id, completed_steps, works_created, exc, failed_at_step=step
                )

            work_key = get_storage_service().generate_work_key(str(owner_id), "mp3")
            storage_key, audio_url = get_storage_service().upload_bytes(
                music_result.audio_bytes, work_key, "audio/mpeg"
            )
            content_hash = hashlib.sha256(music_result.audio_bytes).hexdigest()

            work = Work(
                owner_id=owner_id,
                title=f"Track {step}",
                audio_url=audio_url,
                storage_key=storage_key,
                duration=track_duration,
                moods=step_moods,
                genres=step_genres,
                arousal=target_av[0],
                valence=target_av[1],
                content_hash=content_hash,
                parent_work_id=parent_work.id if parent_work else None,
                reference_work_id=ref_work_uuid if step == 1 and ref_work_uuid else None,
                preset_id=anchor_context.get("preset_id"),
                playlist_id=playlist.id,
                step_index=step,
                visibility="private",
                tenant_id=owner_tenant,
            )
            self.db.add(work)
            self.db.flush()

            record_type = "anchor" if step == 1 and not parent_work else "generated"
            prov = ProvenanceRecord(
                work_id=work.id,
                parent_work_id=parent_work.id if parent_work else None,
                pipeline_version=settings.pipeline_version,
                step_index=step,
                record_type=record_type,
                emotion_snapshot={
                    "moods": step_moods,
                    "genres": step_genres,
                    "arousal": target_av[0],
                    "valence": target_av[1],
                    "target_av": list(target_av),
                },
                m3_request={
                    "model": settings.minimax_chat_model,
                    "prompt_data": prompt_data,
                    "journey_step": step,
                    "waypoints": waypoints,
                    "text_intent": text_intent,
                    "preset_id": anchor_context.get("preset_id"),
                    "generation_mode": "prompt_journey",
                },
                music_request={
                    "model": music_result.model,
                    "prompt": music_result.prompt,
                    "seed": gen_seed,
                    "is_instrumental": instrumental,
                    "task_id": music_result.task_id,
                    "bpm_range": list(bpm_range),
                    "key": music_params.get("key", "auto"),
                    "duration_preference": music_params.get("duration_preference", "medium"),
                    "text_intent": text_intent,
                },
                output_meta={
                    "audio_url": audio_url,
                    "sha256": content_hash,
                    "format": "mp3",
                },
                job_id=job.id,
            )
            prov.signature = self._sign_provenance(
                {
                    "work_id": str(work.id),
                    "parent": str(parent_work.id) if parent_work else None,
                    "hash": content_hash,
                }
            )
            self.db.add(prov)
            self.db.add(
                PlaylistTrack(playlist_id=playlist.id, work_id=work.id, position=step)
            )

            works_created.append(str(work.id))
            completed_steps.append(
                {
                    "work_id": str(work.id),
                    "step": step,
                    "audio_url": audio_url,
                    "title": work.title,
                    "shift_stage": shift_stage_label(step, steps),
                }
            )
            parent_work = work
            self._update_job_progress(job, playlist.id, completed_steps)
            if step < steps:
                await asyncio.sleep(3)

        job.status = "audio_ready"
        job.progress = min(0.99, len(completed_steps) / max(job.total_steps or 1, 1))
        job.phase = "audio_ready"
        job.status_message = "音轨已生成，正在后处理…"
        job.result = {
            "playlist_id": str(playlist.id),
            "work_ids": works_created,
            "completed_steps": completed_steps,
            "partial": len(completed_steps) < (job.total_steps or 1),
        }
        job.playlist_id = playlist.id
        self.db.commit()
        return job.result

    async def _generate_markov_playlist(
        self,
        job: GenerationJob,
        owner_id: uuid.UUID,
        seed_audio_bytes: bytes,
        seed_filename: str,
        journey_config: dict,
        music_params: dict,
    ) -> dict:
        job.status = "running"
        job.total_steps = journey_config.get("steps", 6)
        update_job_phase(self.db, job, progress=0.05, status_message="任务已排队，准备开始…", phase="queued")

        track_duration = duration_from_preference(music_params.get("duration_preference"))
        waypoints = journey_config.get("waypoints") or []

        analysis = emotion_engine.analyze_bytes(
            seed_audio_bytes, suffix=os.path.splitext(seed_filename)[1] or ".wav"
        )

        playlist = Playlist(
            owner_id=owner_id,
            title=resolve_playlist_title(journey_config),
            journey_config=journey_config,
            visibility="private",
        )
        self.db.add(playlist)
        self.db.flush()

        seed_key = get_storage_service().generate_work_key(str(owner_id))
        seed_storage_key, seed_url = get_storage_service().upload_bytes(seed_audio_bytes, seed_key)

        seed_work = Work(
            owner_id=owner_id,
            title="Seed Track",
            audio_url=seed_url,
            storage_key=seed_storage_key,
            duration=track_duration,
            moods=analysis["moods"],
            genres=analysis["genres"],
            arousal=analysis.get("arousal"),
            valence=analysis.get("valence"),
            content_hash=hashlib.sha256(seed_audio_bytes).hexdigest(),
            playlist_id=playlist.id,
            step_index=0,
            visibility="private",
        )
        self.db.add(seed_work)
        self.db.flush()

        if analysis.get("embedding"):
            self.db.add(
                EmotionEmbedding(
                    work_id=seed_work.id,
                    embedding=analysis["embedding"],
                )
            )

        seed_prov = ProvenanceRecord(
            work_id=seed_work.id,
            pipeline_version=settings.pipeline_version,
            step_index=0,
            record_type="seed",
            emotion_snapshot={
                "moods": analysis["moods"],
                "genres": analysis["genres"],
                "arousal": analysis.get("arousal"),
                "valence": analysis.get("valence"),
            },
            output_meta={"audio_url": seed_url},
            job_id=job.id,
        )
        seed_prov.signature = self._sign_provenance(
            {"work_id": str(seed_work.id), "type": "seed"}
        )
        self.db.add(seed_prov)
        self.db.add(
            PlaylistTrack(playlist_id=playlist.id, work_id=seed_work.id, position=0)
        )

        works_created: list[str] = []
        completed_steps: list[dict] = []

        completed_steps.append(
            {
                "work_id": str(seed_work.id),
                "step": 0,
                "audio_url": seed_url,
                "title": seed_work.title,
            }
        )
        works_created.append(str(seed_work.id))
        self._update_job_progress(job, playlist.id, completed_steps)

        current_input = seed_audio_bytes
        parent_work = seed_work
        target_curve = journey_config.get("target_curve", "calm_to_energy")
        steps = journey_config.get("steps", 6)
        instrumental = journey_config.get("instrumental", True)
        bpm_range_list = music_params.get("bpm_range", [80, 120])
        bpm_range = (int(bpm_range_list[0]), int(bpm_range_list[1])) if bpm_range_list else (80, 120)

        for step in range(1, steps + 1):
            if self._is_cancelled(job.id):
                job.status = "cancelled"
                job.error_message = "Cancelled by user"
                job.status_message = "已取消"
                self.db.commit()
                return job.result or {}

            update_job_phase(
                self.db,
                job,
                progress=(step - 1) / steps,
                status_message=f"正在生成第 {step} / {steps} 首…",
                current_step=step,
                phase=f"track_{step}",
            )

            step_analysis = emotion_engine.analyze_bytes(
                current_input, suffix=".mp3"
            )
            target_av = target_av_for_step(step, steps, waypoints, target_curve)

            prompt_data = await self.minimax.build_music_prompt(
                moods=step_analysis["moods"],
                genres=step_analysis["genres"],
                step=step,
                total_steps=steps,
                target_curve=target_curve,
                bpm_range=bpm_range,
                key=music_params.get("key", "auto"),
                instrumental=instrumental,
                target_av=target_av,
                db=self.db,
                user_id=str(owner_id),
            )

            try:
                music_result, seed = await self._generate_track_audio(
                    job=job,
                    step=step,
                    prompt=prompt_data.get("prompt", ""),
                    instrumental=instrumental,
                    owner_id=owner_id,
                    mock_audio_bytes=current_input if settings.use_mock_ai else None,
                )
            except Exception as exc:
                self._abort_partial_playlist(
                    job, playlist.id, completed_steps, works_created, exc, failed_at_step=step
                )

            work_key = get_storage_service().generate_work_key(str(owner_id), "mp3")
            storage_key, audio_url = get_storage_service().upload_bytes(
                music_result.audio_bytes, work_key, "audio/mpeg"
            )
            content_hash = hashlib.sha256(music_result.audio_bytes).hexdigest()

            work = Work(
                owner_id=owner_id,
                title=f"Track {step}",
                audio_url=audio_url,
                storage_key=storage_key,
                duration=track_duration,
                moods=step_analysis["moods"],
                genres=step_analysis["genres"],
                arousal=step_analysis.get("arousal"),
                valence=step_analysis.get("valence"),
                content_hash=content_hash,
                parent_work_id=parent_work.id,
                playlist_id=playlist.id,
                step_index=step,
                visibility="private",
            )
            self.db.add(work)
            self.db.flush()

            if step_analysis.get("embedding"):
                self.db.add(
                    EmotionEmbedding(
                        work_id=work.id,
                        embedding=step_analysis["embedding"],
                    )
                )

            prov = ProvenanceRecord(
                work_id=work.id,
                parent_work_id=parent_work.id,
                pipeline_version=settings.pipeline_version,
                step_index=step,
                record_type="generated",
                emotion_snapshot={
                    "moods": step_analysis["moods"],
                    "genres": step_analysis["genres"],
                    "arousal": step_analysis.get("arousal"),
                    "valence": step_analysis.get("valence"),
                    "target_av": list(target_av),
                },
                m3_request={
                    "model": settings.minimax_chat_model,
                    "prompt_data": prompt_data,
                    "journey_step": step,
                    "waypoints": waypoints,
                },
                music_request={
                    "model": music_result.model,
                    "prompt": music_result.prompt,
                    "seed": seed,
                    "is_instrumental": instrumental,
                    "task_id": music_result.task_id,
                    "bpm_range": list(bpm_range),
                    "key": music_params.get("key", "auto"),
                    "duration_preference": music_params.get("duration_preference", "medium"),
                },
                output_meta={
                    "audio_url": audio_url,
                    "sha256": content_hash,
                    "format": "mp3",
                },
                job_id=job.id,
            )
            prov.signature = self._sign_provenance(
                {
                    "work_id": str(work.id),
                    "parent": str(parent_work.id),
                    "hash": content_hash,
                }
            )
            self.db.add(prov)
            self.db.add(
                PlaylistTrack(
                    playlist_id=playlist.id, work_id=work.id, position=step
                )
            )

            works_created.append(str(work.id))
            completed_steps.append(
                {
                    "work_id": str(work.id),
                    "step": step,
                    "audio_url": audio_url,
                    "title": work.title,
                    "shift_stage": shift_stage_label(step, steps),
                }
            )
            current_input = music_result.audio_bytes
            parent_work = work
            self._update_job_progress(job, playlist.id, completed_steps)
            if step < steps:
                await asyncio.sleep(3)

        job.status = "audio_ready"
        job.progress = min(0.99, len(completed_steps) / max(job.total_steps or 1, 1))
        job.phase = "audio_ready"
        job.status_message = "音轨已生成，正在后处理…"
        job.result = {
            "playlist_id": str(playlist.id),
            "work_ids": works_created,
            "completed_steps": completed_steps,
            "partial": len(completed_steps) < (job.total_steps or 1),
        }
        job.playlist_id = playlist.id
        self.db.commit()

        return job.result
