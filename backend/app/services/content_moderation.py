"""Content moderation for UGC — DB-backed word list with block/mask actions."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException

_DEFAULT_PATTERNS: list[tuple[str, str, str]] = [
    ("赌博", "gambling", "block"),
    ("色情", "adult", "block"),
    ("毒品", "drugs", "block"),
    ("枪支", "violence", "block"),
    ("恐怖", "violence", "block"),
    ("法轮功", "political", "block"),
    ("习近平", "political", "block"),
    (r"共产党.*(打倒|推翻)", "political", "block"),
    (r"自杀.*教程", "harm", "block"),
    ("制毒", "drugs", "block"),
    ("洗钱", "fraud", "block"),
    ("诈骗", "fraud", "block"),
    ("裸聊", "adult", "block"),
    ("代孕", "adult", "block"),
    ("傻逼", "profanity", "mask"),
    ("操你", "profanity", "mask"),
    ("妈的", "profanity", "mask"),
]

_CACHE_KEY = "moderation:words:v1"
_CACHE_TTL = 300


@dataclass
class ModerationResult:
    action: Literal["ok", "block", "mask"]
    text: str
    reason: str | None = None
    is_filtered: bool = False


def _compile_patterns(words: list[tuple[str, str]]) -> list[tuple[re.Pattern, str]]:
    compiled: list[tuple[re.Pattern, str]] = []
    for pattern, level in words:
        try:
            compiled.append((re.compile(pattern, re.IGNORECASE), level))
        except re.error:
            continue
    return compiled


def _load_words(db) -> list[tuple[str, str]]:
    from app.models.schemas import ModerationWord
    from app.services.cache import cache_get, cache_set

    cached = cache_get(_CACHE_KEY)
    if cached:
        return [(row["pattern"], row["level"]) for row in cached]

    rows = (
        db.query(ModerationWord)
        .filter(ModerationWord.enabled == True)
        .order_by(ModerationWord.created_at.asc())
        .all()
    )
    if not rows:
        seed_default_words(db)
        rows = (
            db.query(ModerationWord)
            .filter(ModerationWord.enabled == True)
            .order_by(ModerationWord.created_at.asc())
            .all()
        )

    payload = [{"pattern": r.pattern, "level": r.level} for r in rows]
    cache_set(_CACHE_KEY, payload, ttl_seconds=_CACHE_TTL)
    return [(r.pattern, r.level) for r in rows]


def seed_default_words(db) -> int:
    from app.models.schemas import ModerationWord

    existing = db.query(ModerationWord).count()
    if existing > 0:
        return 0
    for pattern, category, level in _DEFAULT_PATTERNS:
        db.add(ModerationWord(pattern=pattern, category=category, level=level, enabled=True))
    db.commit()
    from app.services.cache import cache_clear

    cache_clear(_CACHE_KEY)
    return len(_DEFAULT_PATTERNS)


def invalidate_word_cache() -> None:
    from app.services.cache import cache_clear

    cache_clear(_CACHE_KEY)


def moderate_text(text: str | None, *, db=None, scene: str = "comment") -> ModerationResult:
    """Return moderation result. scene is informational for future provider routing."""
    if not text or not text.strip():
        return ModerationResult(action="ok", text=text or "")

    if len(text) > 5000:
        return ModerationResult(action="block", text=text, reason="内容过长")

    words: list[tuple[str, str]]
    if db is not None:
        words = _load_words(db)
    else:
        words = [(p, lvl) for p, _, lvl in _DEFAULT_PATTERNS]

    compiled = _compile_patterns(words)
    masked = text
    filtered = False
    for pattern, level in compiled:
        if not pattern.search(masked):
            continue
        if level == "block":
            return ModerationResult(
                action="block",
                text=text,
                reason="内容包含不允许的词汇，请修改后重试",
            )
        if level == "mask":
            masked = pattern.sub(lambda m: "*" * len(m.group(0)), masked)
            filtered = True

    if filtered and masked != text:
        return ModerationResult(action="mask", text=masked, is_filtered=True, reason="部分内容已过滤")
    return ModerationResult(action="ok", text=text)


def check_content_moderation(text: str | None) -> str | None:
    """Legacy helper — block-only check without DB."""
    result = moderate_text(text)
    if result.action == "block":
        return result.reason
    return None


def moderate_publish_content(caption: str | None, *, work_title: str | None = None, db=None) -> None:
    for field_name, value in [("caption", caption), ("title", work_title)]:
        result = moderate_text(value, db=db, scene="publish")
        if result.action == "block":
            raise HTTPException(status_code=400, detail=f"{field_name}: {result.reason}")


def moderate_profile_fields(
    *,
    display_name: str | None = None,
    bio: str | None = None,
    db=None,
) -> dict[str, str]:
    """Return moderated profile fields; raises on block."""
    out: dict[str, str] = {}
    for field_name, value in [("display_name", display_name), ("bio", bio)]:
        if value is None:
            continue
        result = moderate_text(value, db=db, scene="profile")
        if result.action == "block":
            raise HTTPException(status_code=400, detail=f"{field_name}: {result.reason}")
        out[field_name] = result.text
    return out


def parse_mentions(content: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"@([a-zA-Z0-9_]{2,32})", content)))
