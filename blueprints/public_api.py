"""
Public REST API for PDF extraction, script execution, and API key management.

Endpoints:
    POST /api/v1/extract            — Extract data from a PDF (multipart file upload)
    POST /api/v1/scripts/<id>/run   — Trigger a script run (returns build_id immediately)
    GET  /api/v1/keys               — List all API keys (metadata only, never raw key)
    POST /api/v1/keys               — Create a new API key (raw key returned once)
    DELETE /api/v1/keys/<id>        — Deactivate an API key

Authentication:
    All endpoints except POST /api/v1/keys creation require X-API-Key header.
    Key management endpoints are intentionally unprotected so the first key
    can be bootstrapped, but this can be locked down in production via firewall.
"""
import os
import secrets
import tempfile

from flask import Blueprint, request, jsonify, current_app

from extensions import db
from models.api_key import APIKey
from models.rule import ExtractionRule
from models.script import Script, Build
from extraction_engine import extract_text_from_pdf, apply_rules
from services.auth import require_api_key
from services.script_runner import execute_script_async

public_api_bp = Blueprint('public_api', __name__)


# ---------------------------------------------------------------------------
# PDF Extraction
# ---------------------------------------------------------------------------

@public_api_bp.route('/api/v1/extract', methods=['POST'])
@require_api_key
def extract():
    """
    Accept a PDF file via multipart/form-data and run all configured rules.

    Optional query param:
        rule_ids — comma-separated list of rule UUIDs to run instead of all

    Returns:
        {
          "success": true,
          "filename": "invoice.pdf",
          "extracted_fields": {"Invoice Number": "INV-1234"},
          "rules_applied": 5,
          "metadata": {"api_version": "v1"}
        }
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided. Use multipart/form-data with field "file".'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Only PDF files are supported'}), 400

    # Determine which rules to apply
    rule_ids_param = request.args.get('rule_ids', '').strip()
    if rule_ids_param:
        ids = [r.strip() for r in rule_ids_param.split(',') if r.strip()]
        rules_qs = ExtractionRule.query.filter(ExtractionRule.id.in_(ids)).all()
    else:
        rules_qs = ExtractionRule.query.all()

    if not rules_qs:
        return jsonify({'error': 'No extraction rules configured'}), 422

    # Save to a temp file and extract
    tmp_path = None
    try:
        suffix = '.pdf'
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
            dir=current_app.config['UPLOAD_FOLDER'],
        ) as tmp:
            tmp_path = tmp.name
            file.save(tmp)

        text = extract_text_from_pdf(tmp_path)
        rules_dicts = [{'field_name': r.field_name, 'regex': r.regex} for r in rules_qs]
        extracted = apply_rules(text, rules_dicts)
    except Exception as e:
        return jsonify({'error': f'Extraction failed: {str(e)}'}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    return jsonify({
        'success': True,
        'filename': file.filename,
        'extracted_fields': extracted,
        'rules_applied': len(rules_qs),
        'metadata': {'api_version': 'v1'},
    })


# ---------------------------------------------------------------------------
# Script Execution
# ---------------------------------------------------------------------------

@public_api_bp.route('/api/v1/scripts/<script_id>/run', methods=['POST'])
@require_api_key
def run_script_api(script_id):
    """
    Trigger an async script run via API key.  Returns immediately with a build_id.

    Stream output via:  GET /api/builds/<build_id>/stream  (SSE)

    Returns 202 Accepted:
        { "build_id": "...", "status": "started" }
    """
    script = db.session.get(Script, script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    script_path = os.path.join(current_app.config['SCRIPTS_FOLDER'], script.filename)
    if not os.path.exists(script_path):
        return jsonify({'error': 'Script file not found on disk'}), 404

    build = Build(script_id=script.id, status='pending', triggered_by='api')
    db.session.add(build)
    db.session.commit()

    build_dir = os.path.join(current_app.config['BUILDS_FOLDER'], script.filename)
    os.makedirs(build_dir, exist_ok=True)

    app = current_app._get_current_object()
    execute_script_async(app, build.id, script_path, build_dir)

    return jsonify({'build_id': build.id, 'status': 'started'}), 202


# ---------------------------------------------------------------------------
# API Key Management
# ---------------------------------------------------------------------------

@public_api_bp.route('/api/v1/keys', methods=['GET'])
def list_keys():
    """List all API keys (metadata only — raw key is never stored)."""
    keys = APIKey.query.order_by(APIKey.created_at.desc()).all()
    return jsonify([{
        'id': k.id,
        'name': k.name,
        'is_active': k.is_active,
        'last_used_at': k.last_used_at.isoformat() if k.last_used_at else None,
        'created_at': k.created_at.isoformat() if k.created_at else None,
    } for k in keys])


@public_api_bp.route('/api/v1/keys', methods=['POST'])
def create_key():
    """
    Create a new API key.  Returns the raw key exactly once — store it safely.

    Body (JSON):
        { "name": "My Integration" }
    """
    body = request.get_json(silent=True) or {}
    name = (body.get('name') or '').strip()
    if not name:
        return jsonify({'error': '"name" is required'}), 400

    raw_key = secrets.token_urlsafe(32)
    api_key = APIKey(name=name, key_hash=APIKey.hash_key(raw_key))
    db.session.add(api_key)
    db.session.commit()

    return jsonify({
        'id': api_key.id,
        'name': api_key.name,
        'key': raw_key,  # Only time the raw key is returned
        'note': 'Store this key securely. It will not be shown again.',
    }), 201


@public_api_bp.route('/api/v1/keys/<key_id>', methods=['DELETE'])
def deactivate_key(key_id):
    """Deactivate (soft-delete) an API key."""
    api_key = db.session.get(APIKey, key_id)
    if not api_key:
        return jsonify({'error': 'Key not found'}), 404

    api_key.is_active = False
    db.session.commit()
    return jsonify({'id': api_key.id, 'is_active': False})
