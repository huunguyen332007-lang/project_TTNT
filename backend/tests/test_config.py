import pytest

from app.config import load_settings


def test_config_defaults_and_blank_cors():
    defaults = load_settings({"NODE_ENV": "test"})
    assert defaults.port == 3000
    assert defaults.max_upload_bytes == 5 * 1024 * 1024
    assert defaults.cors_origins == ("http://localhost:5173", "http://localhost:8080")
    assert load_settings({"CORS_ORIGINS": ""}).cors_origins == ()
    assert load_settings({"CORS_ORIGINS": "https://a.test, https://b.test"}).cors_origins == ("https://a.test", "https://b.test")


def test_config_validation_and_production_database_requirement():
    with pytest.raises(ValueError, match="DATABASE_URL"):
        load_settings({"NODE_ENV": "production"})
    with pytest.raises(ValueError, match="ADMIN_API_KEY"):
        load_settings({"ADMIN_API_KEY": "short"})
    with pytest.raises(ValueError, match="AI_SERVICE_URL"):
        load_settings({"AI_SERVICE_URL": "not-a-url"})
    with pytest.raises(ValueError, match="MAX_UPLOAD_MB"):
        load_settings({"MAX_UPLOAD_MB": "nan"})
    production = load_settings({"NODE_ENV": "production", "DATABASE_URL": "postgres://ttnt:secret@db:5432/ttnt"})
    assert production.is_production
