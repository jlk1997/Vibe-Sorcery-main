"""Tests for legal consent and content moderation."""

from app.services.content_moderation import check_content_moderation
from app.services.legal import get_required_versions, list_documents, require_registration_consents


def test_list_documents():
    docs = list_documents()
    assert len(docs) >= 6
    slugs = {d["slug"] for d in docs}
    assert "privacy-policy" in slugs
    assert "terms-of-service" in slugs


def test_required_versions():
    versions = get_required_versions()
    assert "terms" in versions
    assert "privacy" in versions


def test_content_moderation_blocks():
    assert check_content_moderation("正常音乐分享") is None
    assert check_content_moderation("赌博网站推广") is not None


def test_registration_consents_valid():
    versions = get_required_versions()
    require_registration_consents(versions["terms"], versions["privacy"])


def test_legal_documents_api():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    res = client.get("/api/v1/legal/documents")
    assert res.status_code == 200
    data = res.json()
    assert len(data["documents"]) >= 6

    slug_res = client.get("/api/v1/legal/documents/privacy-policy")
    assert slug_res.status_code == 200
    assert "content" in slug_res.json()

    meta_res = client.get("/api/v1/legal/meta")
    assert meta_res.status_code == 200
    meta = meta_res.json()
    assert "required_versions" in meta
    assert "contact_email" in meta
