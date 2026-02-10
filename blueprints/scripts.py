import os
import secrets
from datetime import datetime
from flask import Blueprint, request, jsonify, render_template, current_app, Response, stream_with_context
from extensions import db
from models.script import Script, Build
from services.script_runner import execute_script_async, get_output_queue

scripts_bp = Blueprint('scripts', __name__)


@scripts_bp.route('/scripts')
def scripts_page():
    return render_template('scripts.html')


@scripts_bp.route('/api/scripts', methods=['GET', 'POST'])
def handle_scripts():
    if request.method == 'GET':
        scripts = Script.query.order_by(Script.name).all()
        return jsonify([s.to_dict() for s in scripts])

    elif request.method == 'POST':
        data = request.json
        script_name = data.get('name', '').strip()
        content = data.get('content', '')

        if not script_name.endswith('.py'):
            script_name += '.py'

        filepath = os.path.join(current_app.config['SCRIPTS_FOLDER'], script_name)

        with open(filepath, 'w') as f:
            f.write(content)

        script = Script.query.filter_by(filename=script_name).first()
        if not script:
            script = Script(name=script_name, filename=script_name)
            db.session.add(script)
        db.session.commit()

        return jsonify({'message': 'Script saved', 'id': script.id, 'name': script.name})


@scripts_bp.route('/api/scripts/<script_id>')
def get_script_content(script_id):
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    filepath = os.path.join(current_app.config['SCRIPTS_FOLDER'], script.filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Script file not found on disk'}), 404

    with open(filepath, 'r') as f:
        content = f.read()

    result = script.to_dict()
    result['content'] = content
    return jsonify(result)


@scripts_bp.route('/api/scripts/<script_id>/run', methods=['POST'])
def run_script(script_id):
    """
    Start async script execution.
    Returns immediately with build_id — client should then open the SSE stream.
    """
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    script_path = os.path.join(current_app.config['SCRIPTS_FOLDER'], script.filename)
    if not os.path.exists(script_path):
        return jsonify({'error': 'Script file not found on disk'}), 404

    build = Build(script_id=script.id, status='pending', triggered_by='manual')
    db.session.add(build)
    db.session.commit()

    build_dir = os.path.join(current_app.config['BUILDS_FOLDER'], script.filename)
    os.makedirs(build_dir, exist_ok=True)

    app = current_app._get_current_object()
    execute_script_async(app, build.id, script_path, build_dir)

    return jsonify({'build_id': build.id, 'status': 'started'})


@scripts_bp.route('/api/builds/<build_id>/stream')
def stream_build_output(build_id):
    """
    SSE endpoint for real-time script output.
    Streams lines as they are produced. If the build already finished,
    serves the log file instead.
    Sends 'data: [DONE]\\n\\n' when complete.
    """
    app = current_app._get_current_object()

    def generate():
        q = get_output_queue(build_id)

        if q is None:
            # Build already finished (or never existed) — serve from log file
            with app.app_context():
                build = db.session.get(Build, build_id)
            if build and build.log_file and os.path.exists(build.log_file):
                with open(build.log_file, 'r', encoding='utf-8', errors='replace') as f:
                    for line in f:
                        yield f"data: {line}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Stream live output from the queue
        while True:
            try:
                line = q.get(timeout=30)  # 30s timeout guards against hung scripts
            except Exception:
                yield "data: [DONE]\n\n"
                break

            if line is None:  # Sentinel — script finished
                yield "data: [DONE]\n\n"
                break

            yield f"data: {line}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',   # Disable nginx buffering
            'Connection': 'keep-alive',
        }
    )


@scripts_bp.route('/api/scripts/<script_id>/webhook/regenerate', methods=['POST'])
def regenerate_webhook(script_id):
    """Generate a new webhook token for a script, invalidating the old one."""
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    script.webhook_token = secrets.token_urlsafe(32)
    db.session.commit()
    return jsonify({'webhook_token': script.webhook_token})


@scripts_bp.route('/api/builds/<script_id>')
def list_builds(script_id):
    script = Script.query.get(script_id)
    if not script:
        return jsonify([])

    builds = Build.query.filter_by(script_id=script.id)\
        .order_by(Build.started_at.desc().nullslast())\
        .all()
    return jsonify([b.to_dict() for b in builds])


@scripts_bp.route('/api/builds/output/<script_id>/<build_id>')
def get_build_output(script_id, build_id):
    build = Build.query.get(build_id)
    if not build:
        return jsonify({'error': 'Build not found'}), 404

    if build.log_file and os.path.exists(build.log_file):
        with open(build.log_file, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        return jsonify({'output': content})

    return jsonify({'output': ''})
