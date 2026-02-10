"""
API key authentication decorator for public API endpoints.

Usage:
    @require_api_key
    def my_endpoint():
        ...

The client must send:
    X-API-Key: <raw key>

The key is hashed with SHA-256 and looked up in the APIKey table.
"""
import hashlib
from functools import wraps
from flask import request, jsonify


def require_api_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        raw_key = request.headers.get('X-API-Key', '').strip()
        if not raw_key:
            return jsonify({'error': 'Missing X-API-Key header'}), 401

        from models.api_key import APIKey
        from extensions import db
        from datetime import datetime, timezone

        key_hash = APIKey.hash_key(raw_key)
        api_key = APIKey.query.filter_by(key_hash=key_hash, is_active=True).first()
        if not api_key:
            return jsonify({'error': 'Invalid or inactive API key'}), 401

        # Update last_used_at without blocking on failure
        try:
            api_key.last_used_at = datetime.now(timezone.utc)
            db.session.commit()
        except Exception:
            db.session.rollback()

        return f(*args, **kwargs)
    return decorated
