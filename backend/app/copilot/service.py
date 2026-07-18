"""Creation Copilot — tool registry and chat orchestration."""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.style_presets import apply_preset, list_presets
from app.config import settings
from app.copilot.moderation import moderate_copilot_input
from app.copilot.actions import build_studio_actions
from app.integrations.minimax.client import minimax_client
from app.models.schemas import StudioSession, User

COPILOT_SYSTEM = """你是炼金音坊（Vibe Sorcery）的创作助手。帮助用户选择风格包、创作模式、填写意图、规划情绪旅程。
可用工具：apply_preset, suggest_mode, explain_derivative, plan_journey_hint, start_generation, explain_credits。
回答简洁中文。若用户想直接生成，使用 start_generation 并说明预估额度；否则给出 preset/mode 建议让用户在工作室确认。"""

TOOLS = [
    {
        "name": "apply_preset",
        "description": "应用风格包，返回 journey 与 music_params",
        "parameters": {"preset_id": "string", "steps": "int", "text_intent": "string"},
    },
    {
        "name": "suggest_mode",
        "description": "根据用户描述推荐创作模式",
        "parameters": {"user_text": "string"},
    },
    {
        "name": "explain_derivative",
        "description": "解释二次创作/翻唱/重生成/锚定的区别",
        "parameters": {"topic": "remix|cover|regenerate|anchor"},
    },
    {
        "name": "plan_journey_hint",
        "description": "根据意图规划情绪旅程（航点、曲线、步数）",
        "parameters": {"text_intent": "string", "steps": "int"},
    },
    {
        "name": "explain_credits",
        "description": "解释额度消耗、免费获取方式与充值入口",
        "parameters": {},
    },
    {
        "name": "start_generation",
        "description": "估算额度并准备一键生成（需用户确认）",
        "parameters": {"mode": "string", "text_intent": "string"},
    },
]


def _tool_apply_preset(preset_id: str, steps: int = 6, text_intent: str = "") -> dict:
    try:
        result = apply_preset(preset_id, steps=steps, overrides={"text_intent": text_intent})
        result["tool"] = "apply_preset"
        result["mode"] = "quickJourney"
        return result
    except ValueError as e:
        return {"error": str(e), "tool": "apply_preset"}


def _tool_suggest_mode(user_text: str) -> dict:
    text = user_text.lower()
    if any(k in text for k in ("歌词", "人声", "唱歌", "vocal")):
        return {"tool": "suggest_mode", "mode": "vocals", "reason": "你提到了人声或歌词"}
    if any(k in text for k in ("系列", "playlist", "多首", "旅程", "曲线")):
        if any(k in text for k in ("故事", "场景", "规划")):
            return {"tool": "suggest_mode", "mode": "textJourney", "reason": "有故事场景，适合文字旅程"}
        return {"tool": "suggest_mode", "mode": "quickJourney", "reason": "需要多首连贯曲目"}
    return {"tool": "suggest_mode", "mode": "quickTrack", "reason": "快速单曲最适合入门"}


def _tool_explain_derivative(topic: str) -> dict:
    explanations = {
        "remix": "二次创作：AI 改写 prompt，保留谱系，生成新版本。",
        "cover": "风格翻唱：使用翻唱模型，可改人声与歌词。",
        "regenerate": "同参重生成：参数不变换随机种子，快速多试几版。",
        "anchor": "延续创作：以作品为音频锚点，在工作室生成系列。",
    }
    return {
        "tool": "explain_derivative",
        "topic": topic,
        "explanation": explanations.get(topic, explanations["remix"]),
    }


async def _tool_plan_journey_hint(
    text_intent: str,
    steps: int = 6,
    db: Session | None = None,
    user_id: str | None = None,
) -> dict:
    plan = await minimax_client.plan_journey(text_intent, steps=steps, db=db, user_id=user_id)
    waypoints = plan.get("waypoints") or []
    journey = {
        "mode": "prompt_journey",
        "title": plan.get("title", "情绪旅程"),
        "target_curve": plan.get("target_curve", "calm_to_energy"),
        "steps": plan.get("steps", steps),
        "waypoints": waypoints,
        "instrumental": True,
    }
    return {
        "tool": "plan_journey_hint",
        "mode": "textJourney",
        "text_intent": text_intent,
        "title": journey["title"],
        "target_curve": journey["target_curve"],
        "steps": journey["steps"],
        "waypoints": waypoints,
        "journey": journey,
    }


TOOL_SELECT_SYSTEM = """你是炼金音坊创作助手的工具路由器。根据用户消息选择最合适的工具。
只返回 JSON，格式：
{"tool":"<name>","arguments":{...},"reason":"简短中文"}
tool 必须是之一：apply_preset, suggest_mode, explain_derivative, plan_journey_hint, start_generation, explain_credits, none
- apply_preset: preset_id, steps(默认6), text_intent
- suggest_mode: user_text
- explain_derivative: topic(remix|cover|regenerate|anchor)
- plan_journey_hint: text_intent, steps(默认6)
- explain_credits: 额度/充值/会员问题
- none: 纯闲聊无需工具"""


async def _select_tool_llm(
    message: str,
    preset_ids: list[str],
    db: Session,
    user_id: str,
    history: list[dict] | None = None,
) -> tuple[str | None, dict]:
    if settings.use_mock_ai:
        return None, {}

    history_lines = []
    for m in (history or [])[-8:]:
        role = m.get("role", "user")
        content = str(m.get("content", ""))[:300]
        history_lines.append(f"{role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "（无历史）"

    prompt = (
        f"对话历史：\n{history_block}\n\n"
        f"当前用户消息：{message}\n"
        f"可用 preset_id: {', '.join(preset_ids)}"
    )
    try:
        raw = await minimax_client.chat_completion(
            messages=[
                {"role": "system", "content": TOOL_SELECT_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            response_format="json",
            db=db,
            user_id=user_id,
        )
        data = json.loads(raw)
        tool = data.get("tool")
        if not tool or tool == "none":
            return None, {}
        return str(tool), dict(data.get("arguments") or {})
    except Exception:
        return None, {}


async def run_tool(
    name: str,
    args: dict,
    db: Session,
    user_id: uuid.UUID,
    message: str,
) -> dict:
    if name == "plan_journey_hint":
        return await _tool_plan_journey_hint(
            args.get("text_intent") or message,
            int(args.get("steps") or 6),
            db,
            str(user_id),
        )
    if name == "suggest_mode" and not args.get("user_text"):
        args = {**args, "user_text": message}
    if name == "apply_preset" and not args.get("text_intent"):
        args = {**args, "text_intent": message}
    if name == "start_generation":
        if not args.get("text_intent"):
            args = {**args, "text_intent": message}
        ctx_mode = args.get("mode")
        if not ctx_mode or ctx_mode == "quickTrack":
            args = {**args, "mode": args.get("mode", "quickTrack")}
    return execute_tool(name, args)


def _tool_explain_credits() -> dict:
    from app.services.credits import COVER_COST, GENERATION_COST, PLAYLIST_COST, REMIX_COST

    return {
        "tool": "explain_credits",
        "explanation": (
            f"单曲 {GENERATION_COST} 额度 · 歌单 {PLAYLIST_COST} 额度 · Remix/Cover {REMIX_COST} 额度 · "
            f"变体按数量计费 · 旅程规划免费。注册礼包 {settings.welcome_credits} 额度，"
            f"每日签到 +{settings.daily_checkin_credits}，任务可额外领取。"
        ),
        "pricing": [
            {"label": "single", "cost": GENERATION_COST},
            {"label": "playlist", "cost": PLAYLIST_COST},
            {"label": "remix", "cost": REMIX_COST},
            {"label": "cover", "cost": COVER_COST},
        ],
        "navigate": "/pages/pricing/index",
    }


def _tool_start_generation(mode: str = "quickTrack", text_intent: str = "") -> dict:
    from app.services.credit_estimates import estimate_credits

    mode_map = {
        "quickTrack": "single",
        "playlist": "playlist",
        "textJourney": "playlist",
        "quickJourney": "playlist",
        "remix": "remix",
        "cover": "cover",
        "variation": "variation",
        "vocals": "lyrics",
    }
    est_mode = mode_map.get(mode, "single")
    est = estimate_credits(mode=est_mode)
    create_mode = mode if mode in mode_map else "quickTrack"
    if create_mode in ("textJourney", "quickJourney"):
        create_mode = "playlist"
    if create_mode == "vocals":
        create_mode = "lyrics"
    return {
        "tool": "start_generation",
        "mode": create_mode,
        "text_intent": text_intent,
        "estimate": {"cost": est["credits"], "label": est["mode"]},
    }


def execute_tool(name: str, args: dict) -> dict:
    if name == "apply_preset":
        return _tool_apply_preset(
            args.get("preset_id", "lo-fi-night"),
            int(args.get("steps", 6)),
            args.get("text_intent", ""),
        )
    if name == "suggest_mode":
        return _tool_suggest_mode(args.get("user_text", ""))
    if name == "explain_derivative":
        return _tool_explain_derivative(args.get("topic", "remix"))
    if name == "explain_credits":
        return _tool_explain_credits()
    if name == "start_generation":
        return _tool_start_generation(
            args.get("mode", "quickTrack"),
            args.get("text_intent", ""),
        )
    return {"error": f"Unknown tool: {name}"}


def _pick_tool(message: str) -> tuple[str, dict]:
    lower = message.lower()
    if any(k in message for k in ("额度", "credits", "充值", "订阅", "会员", "扣费", "消耗", "定价", "月卡")):
        return "explain_credits", {}

    if any(k in message for k in ("remix", "二次创作", "翻唱", "cover", "重生成", "锚定", "延续")):
        topic = "remix"
        if "翻唱" in message or "cover" in lower:
            topic = "cover"
        elif "重生成" in message or "regenerate" in lower:
            topic = "regenerate"
        elif "锚定" in message or "延续" in message:
            topic = "anchor"
        return "explain_derivative", {"topic": topic}

    if any(k in message for k in ("旅程", "规划", "航点", "曲线", "journey", "故事线", "情绪线")):
        return "plan_journey_hint", {"text_intent": message, "steps": 6}

    if any(k in message for k in ("帮我生成", "开始生成", "直接生成", "确认生成", "现在就生成")):
        mode = "quickTrack"
        if any(k in message for k in ("歌单", "playlist", "旅程")):
            mode = "playlist"
        return "start_generation", {"mode": mode, "text_intent": message}

    if any(k in message for k in ("lo-fi", "lofi", "深夜", "专注", "能量", "风格包", "preset")):
        pid = "lo-fi-night"
        if "专注" in message:
            pid = "calm-focus"
        elif "能量" in message:
            pid = "energy-rise"
        return "apply_preset", {"preset_id": pid, "steps": 6, "text_intent": message}

    return "suggest_mode", {"user_text": message}


def _session_title_from_message(message: str) -> str:
    cleaned = message.strip().replace("\n", " ")
    if len(cleaned) <= 36:
        return cleaned or "创作对话"
    return cleaned[:36] + "…"


def _fallback_reply(tool_name: str, tool_result: dict) -> str:
    if tool_result.get("explanation"):
        return str(tool_result["explanation"])
    if tool_result.get("reason"):
        return f"建议模式：{tool_result.get('mode')} — {tool_result['reason']}"
    if tool_result.get("journey"):
        return f"已规划旅程「{tool_result.get('title')}」，共 {tool_result.get('steps')} 步，曲线 {tool_result.get('target_curve')}。"
    if tool_result.get("preset_id"):
        return f"推荐风格包 {tool_result['preset_id']}，意图：{tool_result.get('text_intent', '')}"
    if tool_result.get("explanation") and tool_name == "explain_credits":
        return str(tool_result["explanation"])
    return "建议从「快速单曲」+「Lo-Fi 深夜」风格包开始，写一句创作意图即可生成。"


def _build_llm_messages(session_messages: list[dict], follow_up: str) -> list[dict]:
    llm_messages: list[dict] = [{"role": "system", "content": COPILOT_SYSTEM}]
    for m in session_messages[-12:]:
        if m.get("role") in ("user", "assistant"):
            llm_messages.append({"role": m["role"], "content": str(m.get("content", ""))[:2000]})
    llm_messages.append({"role": "user", "content": follow_up})
    return llm_messages


async def _prepare_chat_turn(
    db: Session,
    user: User,
    message: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    session: StudioSession | None = None
    if session_id:
        session = (
            db.query(StudioSession)
            .filter(StudioSession.id == uuid.UUID(session_id), StudioSession.user_id == user.id)
            .first()
        )
    if not session:
        session = StudioSession(user_id=user.id, messages=[], context={})
        db.add(session)
        db.commit()
        db.refresh(session)

    messages = list(session.messages or [])
    messages.append({"role": "user", "content": message})

    if not session.title or session.title == "创作对话":
        session.title = _session_title_from_message(message)

    presets = list_presets()
    preset_ids = [p["id"] for p in presets]

    session_ctx = dict(session.context or {})
    ctx_hint = ""
    if session_ctx.get("last_preset"):
        ctx_hint += f"\n上次风格包：{session_ctx['last_preset'].get('preset_id')}"
    if session_ctx.get("last_journey"):
        ctx_hint += f"\n上次旅程：{session_ctx['last_journey'].get('title', '')}"

    tool_name, tool_args = await _select_tool_llm(message, preset_ids, db, str(user.id), messages)
    if not tool_name:
        tool_name, tool_args = _pick_tool(message)
    if ctx_hint and tool_name == "suggest_mode" and session_ctx.get("last_preset"):
        tool_name, tool_args = "apply_preset", {
            "preset_id": session_ctx["last_preset"].get("preset_id", "lo-fi-night"),
            "steps": 6,
            "text_intent": message,
        }
    tool_result = await run_tool(tool_name, tool_args, db, user.id, message)

    follow_up = (
        f"基于以上对话，结合工具结果给出简洁中文建议。{ctx_hint}"
        f"\n工具：{tool_name}\n工具结果：{json.dumps(tool_result, ensure_ascii=False)}"
    )
    llm_messages = _build_llm_messages(messages, follow_up)

    return {
        "session": session,
        "messages": messages,
        "tool_name": tool_name,
        "tool_result": tool_result,
        "llm_messages": llm_messages,
        "session_ctx": session_ctx,
    }


def _finalize_chat_turn(
    db: Session,
    prepared: dict[str, Any],
    reply: str,
) -> dict[str, Any]:
    session: StudioSession = prepared["session"]
    messages: list[dict] = prepared["messages"]
    tool_name: str = prepared["tool_name"]
    tool_result: dict = prepared["tool_result"]
    session_ctx: dict = prepared["session_ctx"]

    actions = build_studio_actions(tool_name, tool_result)
    messages.append({
        "role": "assistant",
        "content": reply,
        "tool_result": tool_result,
        "tool_name": tool_name,
        "actions": actions,
    })
    session.messages = messages

    ctx = dict(session_ctx)
    if tool_result.get("preset_id"):
        ctx["last_preset"] = tool_result
    if tool_result.get("journey"):
        ctx["last_journey"] = tool_result
    session.context = ctx
    db.commit()

    return {
        "session_id": str(session.id),
        "reply": reply,
        "tool_result": tool_result,
        "tool_name": tool_name,
        "actions": actions,
        "messages": messages,
    }


async def _generate_reply(
    prepared: dict[str, Any],
    db: Session,
    user: User,
) -> str:
    try:
        return await minimax_client.chat_completion(
            messages=prepared["llm_messages"],
            db=db,
            user_id=str(user.id),
        )
    except Exception:
        return _fallback_reply(prepared["tool_name"], prepared["tool_result"])


async def chat(
    db: Session,
    user: User,
    message: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    blocked = moderate_copilot_input(message)
    if blocked:
        return {
            "session_id": session_id or "",
            "reply": blocked,
            "tool_result": {"error": blocked},
            "tool_name": "none",
            "actions": [],
            "messages": [{"role": "assistant", "content": blocked}],
        }
    return await _chat_internal(db, user, message, session_id)


async def _chat_internal(
    db: Session,
    user: User,
    message: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    prepared = await _prepare_chat_turn(db, user, message, session_id)
    reply = await _generate_reply(prepared, db, user)
    return _finalize_chat_turn(db, prepared, reply)


def delete_session(db: Session, user_id: uuid.UUID, session_id: str) -> bool:
    session = (
        db.query(StudioSession)
        .filter(StudioSession.id == uuid.UUID(session_id), StudioSession.user_id == user_id)
        .first()
    )
    if not session:
        return False
    db.delete(session)
    db.commit()
    return True


def list_sessions(db: Session, user_id: uuid.UUID, limit: int = 20) -> list[dict]:
    rows = (
        db.query(StudioSession)
        .filter(StudioSession.user_id == user_id)
        .order_by(StudioSession.updated_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(s.id),
            "title": s.title,
            "message_count": len(s.messages or []),
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in rows
    ]


def _chunk_text(text: str, size: int = 24) -> list[str]:
    if not text:
        return []
    return [text[i : i + size] for i in range(0, len(text), size)]


async def chat_stream(
    db: Session,
    user: User,
    message: str,
    session_id: str | None = None,
):
    """Async generator of SSE events: delta chunks then done payload."""
    blocked = moderate_copilot_input(message)
    if blocked:
        yield {"type": "delta", "text": blocked}
        yield {
            "type": "done",
            "session_id": session_id or "",
            "reply": blocked,
            "actions": [],
            "tool_name": "none",
        }
        return

    result = await _prepare_chat_turn(db, user, message, session_id)
    reply_parts: list[str] = []

    if settings.copilot_llm_stream:
        try:
            async for chunk in minimax_client.chat_completion_stream(
                messages=result["llm_messages"],
                db=db,
                user_id=str(user.id),
            ):
                reply_parts.append(chunk)
                yield {"type": "delta", "text": chunk}
        except Exception:
            reply_parts.clear()

    reply = "".join(reply_parts)
    if not reply.strip():
        reply = await _generate_reply(result, db, user)
        if not reply.strip():
            reply = _fallback_reply(result["tool_name"], result["tool_result"])
        for chunk in _chunk_text(reply):
            yield {"type": "delta", "text": chunk}

    finalized = _finalize_chat_turn(db, result, reply)
    yield {
        "type": "done",
        "session_id": finalized.get("session_id"),
        "reply": reply,
        "actions": finalized.get("actions") or [],
        "tool_name": finalized.get("tool_name"),
        "tool_result": finalized.get("tool_result"),
    }
