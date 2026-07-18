"""Copilot tool routing tests."""

from app.copilot.service import _pick_tool, _tool_explain_derivative, _tool_suggest_mode, execute_tool


def test_pick_tool_derivative():
    name, args = _pick_tool("什么是 remix 和翻唱的区别")
    assert name == "explain_derivative"
    assert args["topic"] in ("remix", "cover")


def test_pick_tool_journey():
    name, args = _pick_tool("帮我规划一条情绪旅程")
    assert name == "plan_journey_hint"
    assert "text_intent" in args


def test_execute_suggest_mode():
    result = execute_tool("suggest_mode", {"user_text": "我想写一首带歌词的歌"})
    assert result["mode"] == "vocals"


def test_explain_derivative():
    result = _tool_explain_derivative("anchor")
    assert "锚定" in result["explanation"] or "延续" in result["explanation"]
