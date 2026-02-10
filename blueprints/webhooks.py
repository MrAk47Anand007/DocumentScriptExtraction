"""
Webhook execution blueprint.

POST /webhooks/<token>  — triggers async execution of the script that owns this token.
The JSON request body is passed to the script as the WEBHOOK_PAYLOAD env var.
Returns 202 Accepted immediately with the build_id.
"""
import json
import os
from flask import Blueprint, request, jsonify, current_app
from extensions import db
from models.script import Script, Build
from services.script_runner import execute_script_async

webhooks_bp = Blueprint('webhooks', __name__)


@webhooks_bp.route('/webhooks/<token>', methods=['POST'])
def trigger_webhook(token):
    script = Script.query.filter_by(webhook_token=token).first()
    if not script:
        return jsonify({'error': 'Invalid webhook token'}), 404

    payload = request.get_json(silent=True) or {}

    build = Build(
        script_id=script.id,
        status='pending',
        triggered_by='webhook',
        webhook_payload=json.dumps(payload),
    )
    db.session.add(build)
    db.session.commit()

    build_dir = os.path.join(current_app.config['BUILDS_FOLDER'], script.filename)
    os.makedirs(build_dir, exist_ok=True)

    script_path = os.path.join(current_app.config['SCRIPTS_FOLDER'], script.filename)
    env_vars = {
        'WEBHOOK_PAYLOAD': json.dumps(payload),
        'BUILD_ID': build.id,
        'SCRIPT_ID': script.id,
    }

    app = current_app._get_current_object()
    execute_script_async(app, build.id, script_path, build_dir, env_vars=env_vars)

    return jsonify({
        'message': 'Execution triggered',
        'build_id': build.id,
        'script': script.name,
        'stream_url': f'/api/builds/{build.id}/stream',
    }), 202
