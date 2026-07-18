"""UI option catalogs for Sound Recipe panel (label + MiniMax prompt token)."""

SOUND_RECIPE_OPTIONS = {
    "instruments": [
        {"id": "violin", "label_zh": "小提琴", "label_en": "Violin", "token": "violin"},
        {"id": "saxophone", "label_zh": "萨克斯", "label_en": "Saxophone", "token": "saxophone"},
        {"id": "piano", "label_zh": "钢琴", "label_en": "Piano", "token": "piano"},
        {"id": "guitar", "label_zh": "吉他", "label_en": "Guitar", "token": "acoustic guitar"},
        {"id": "cello", "label_zh": "大提琴", "label_en": "Cello", "token": "cello"},
        {"id": "flute", "label_zh": "长笛", "label_en": "Flute", "token": "flute"},
        {"id": "trumpet", "label_zh": "小号", "label_en": "Trumpet", "token": "trumpet"},
        {"id": "drums", "label_zh": "鼓", "label_en": "Drums", "token": "drums"},
        {"id": "strings", "label_zh": "弦乐", "label_en": "Strings", "token": "strings section"},
        {"id": "synth", "label_zh": "合成器", "label_en": "Synth", "token": "synthesizer"},
        {"id": "erhu", "label_zh": "二胡", "label_en": "Erhu", "token": "erhu"},
        {"id": "guzheng", "label_zh": "古筝", "label_en": "Guzheng", "token": "guzheng"},
    ],
    "genres": [
        {"id": "classical", "label_zh": "古典", "label_en": "Classical", "token": "classical"},
        {"id": "jazz", "label_zh": "爵士", "label_en": "Jazz", "token": "jazz"},
        {"id": "pop", "label_zh": "流行", "label_en": "Pop", "token": "pop"},
        {"id": "electronic", "label_zh": "电子", "label_en": "Electronic", "token": "electronic"},
        {"id": "folk", "label_zh": "民谣", "label_en": "Folk", "token": "folk"},
        {"id": "rock", "label_zh": "摇滚", "label_en": "Rock", "token": "rock"},
        {"id": "hiphop", "label_zh": "嘻哈", "label_en": "Hip-hop", "token": "hip-hop"},
        {"id": "ambient", "label_zh": "氛围", "label_en": "Ambient", "token": "ambient"},
        {"id": "lofi", "label_zh": "Lo-Fi", "label_en": "Lo-Fi", "token": "lo-fi"},
        {"id": "cinematic", "label_zh": "电影感", "label_en": "Cinematic", "token": "cinematic"},
        {"id": "blues", "label_zh": "蓝调", "label_en": "Blues", "token": "blues"},
        {"id": "funk", "label_zh": "放克", "label_en": "Funk", "token": "funk"},
    ],
    "moods": [
        {"id": "calm", "label_zh": "平静", "token": "calm"},
        {"id": "melancholic", "label_zh": "忧郁", "token": "melancholic"},
        {"id": "happy", "label_zh": "欢快", "token": "happy"},
        {"id": "romantic", "label_zh": "浪漫", "token": "romantic"},
        {"id": "dark", "label_zh": "黑暗", "token": "dark"},
        {"id": "hopeful", "label_zh": "希望", "token": "hopeful"},
        {"id": "energetic", "label_zh": "激昂", "token": "energetic"},
        {"id": "nostalgic", "label_zh": "怀旧", "token": "nostalgic"},
    ],
    "tempo_feel": [
        {"id": "slow", "label_zh": "慢板", "label_en": "Slow"},
        {"id": "medium", "label_zh": "中速", "label_en": "Medium"},
        {"id": "fast", "label_zh": "快板", "label_en": "Fast"},
    ],
    "textures": [
        {"id": "solo", "label_zh": "独奏", "token": "solo performance"},
        {"id": "chamber", "label_zh": "室内乐", "token": "chamber ensemble"},
        {"id": "orchestral", "label_zh": "管弦乐", "token": "full orchestral"},
        {"id": "band", "label_zh": "乐队", "token": "band arrangement"},
    ],
    "meters": [
        {"id": "44", "label_zh": "4/4 稳定", "token": "steady 4/4 time"},
        {"id": "34", "label_zh": "3/4 华尔兹", "token": "waltz 3/4 time"},
        {"id": "swing", "label_zh": "摇摆", "token": "swing rhythm"},
        {"id": "free", "label_zh": "自由节奏", "token": "free rhythm"},
    ],
    "eras": [
        {"id": "baroque", "label_zh": "巴洛克", "token": "Baroque era"},
        {"id": "romantic", "label_zh": "浪漫派", "token": "Romantic era"},
        {"id": "modern", "label_zh": "现代", "token": "modern"},
        {"id": "medieval", "label_zh": "中世纪", "token": "medieval"},
    ],
}

_ALIASES: dict[str, str] = {
    "lo-fi": "lofi",
    "chillhop": "lofi",
    "hip-hop": "hiphop",
    "orchestral": "cinematic",
    "peaceful": "calm",
    "focused": "calm",
    "uplifting": "energetic",
    "excited": "energetic",
    "dramatic": "dark",
    "epic": "energetic",
    "emotional": "melancholic",
    "bright": "happy",
    "mysterious": "dark",
    "ritual": "dark",
}


def _build_token_lookup() -> dict[str, str]:
    lookup: dict[str, str] = {}
    for category in ("instruments", "genres", "moods", "textures", "meters", "eras"):
        for item in SOUND_RECIPE_OPTIONS.get(category, []):
            option_id = str(item["id"])
            token = str(item.get("token") or option_id)
            lookup[option_id] = token
            lookup[option_id.lower()] = token
            lookup[token.lower()] = token
    for alias, target in _ALIASES.items():
        if target in lookup:
            lookup[alias] = lookup[target]
        else:
            lookup[alias] = alias
    return lookup


TOKEN_LOOKUP = _build_token_lookup()


def resolve_prompt_token(value: str) -> str:
    """Map chip id or alias to MiniMax prompt token."""
    raw = (value or "").strip()
    if not raw:
        return ""
    direct = TOKEN_LOOKUP.get(raw) or TOKEN_LOOKUP.get(raw.lower())
    if direct:
        return direct
    return raw


def normalize_option_id(value: str, category: str) -> str:
    """Map preset/API genre/mood strings to chip ids when possible."""
    raw = (value or "").strip()
    if not raw:
        return ""
    key = raw.lower()
    alias = _ALIASES.get(key)
    if alias:
        return alias
    for item in SOUND_RECIPE_OPTIONS.get(category, []):
        option_id = str(item["id"])
        token = str(item.get("token") or option_id).lower()
        if key in (option_id.lower(), token):
            return option_id
    return raw
