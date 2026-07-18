from app.services.hls import hls_prefix_from_work, rewrite_hls_playlist


class _FakeStorage:
    def __init__(self):
        self.signed: list[str] = []

    def get_presigned_url(self, key: str, expires: int = 86400) -> str:
        self.signed.append(key)
        return f"https://cdn.example/{key}?sig=1"


def test_rewrite_hls_playlist_signs_segments():
    storage = _FakeStorage()
    m3u8 = "\n".join(
        [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXT-X-TARGETDURATION:6",
            "#EXTINF:6.0,",
            "seg_000.ts",
            "#EXTINF:6.0,",
            "seg_001.ts",
            "#EXT-X-ENDLIST",
        ]
    )
    out = rewrite_hls_playlist(m3u8, "hls/work/uuid", storage)
    assert "https://cdn.example/hls/work/uuid/seg_000.ts?sig=1" in out
    assert "https://cdn.example/hls/work/uuid/seg_001.ts?sig=1" in out
    assert storage.signed == ["hls/work/uuid/seg_000.ts", "hls/work/uuid/seg_001.ts"]


def test_hls_prefix_from_storage_key():
    assert hls_prefix_from_work(hls_storage_prefix="hls/abc/def", hls_url=None) == "hls/abc/def"


def test_hls_prefix_from_legacy_url():
    url = "http://localhost:9000/vibe-sorcery/hls/w1/u1/index.m3u8?X-Amz-Signature=abc"
    assert hls_prefix_from_work(hls_storage_prefix=None, hls_url=url) == "hls/w1/u1"
