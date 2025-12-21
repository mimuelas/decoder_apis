import pytest
from app import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_homepage_loads(client):
    """Test that the homepage loads successfully."""
    rv = client.get('/')
    assert rv.status_code == 200
    assert b'HAR Analyzer' in rv.data


def test_static_files(client):
    """Test that static files are accessible."""
    rv = client.get('/static/style.css')
    assert rv.status_code == 200
