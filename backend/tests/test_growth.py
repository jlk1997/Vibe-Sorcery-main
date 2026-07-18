"""Growth engine unit tests."""

from app.services.growth import _normalize_code, generate_referral_code


def test_normalize_referral_code():
    assert _normalize_code(" ab-12 ") == "AB12"


def test_generate_referral_code_from_username():
    code = generate_referral_code("lofi_user", suffix="ABCD")
    assert code.startswith("LOFIUS")
    assert len(code) <= 12
