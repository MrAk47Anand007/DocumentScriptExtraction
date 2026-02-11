import os
import secrets
from datetime import datetime
import requests
from flask import Blueprint, request, jsonify, render_template, current_app, Response, stream_with_context
from extensions import db
from models.script import Script, Build
from models.setting import Setting
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
        script_id = data.get('id')

        if not script_name.endswith('.py'):
            script_name += '.py'

        filepath = os.path.join(current_app.config['SCRIPTS_FOLDER'], script_name)

        with open(filepath, 'w') as f:
            f.write(content)

        # Look up existing script by id (preferred) or name
        if script_id:
            script = Script.query.get(script_id)
        else:
            script = Script.query.filter_by(name=script_name).first()

        if not script:
            script = Script(name=script_name, filename=script_name)
            db.session.add(script)
        else:
            # Update filename in case name was changed
            script.filename = script_name

        # Update fields
        if 'sync_to_gist' in data:
            script.sync_to_gist = data['sync_to_gist']

        db.session.commit()

        # Sync to Gist if enabled
        gist_error = None
        if script.sync_to_gist:
            try:
                sync_script_to_gist(script, content)
                db.session.commit()  # Commit gist_id/url/filename updates
            except Exception as e:
                gist_error = str(e)
                print(f"Failed to sync to Gist: {e}")

        response = script.to_dict()
        response['message'] = 'Script saved'
        if gist_error:
            response['gist_error'] = gist_error
        return jsonify(response)


def _calculate_gist_filename(script):
    """Calculate the gist filename based on script name and collection."""
    gist_filename = script.name
    if script.collection:
        col_name = "".join(c for c in script.collection.name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
        gist_filename = f"{col_name}_{script.name}"
    if not gist_filename.endswith('.py'):
        gist_filename += '.py'
    return gist_filename


def sync_script_to_gist(script, content):
    token_setting = Setting.query.get('github_token')
    if not token_setting or not token_setting.value:
        raise Exception("No GitHub token configured. Please set your GitHub token in Settings.")

    token = token_setting.value
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json'
    }

    new_filename = _calculate_gist_filename(script)
    old_filename = script.gist_filename  # Previously tracked filename

    if script.gist_id:
        # Build files payload for PATCH
        files = {new_filename: {"content": content}}

        # If the filename changed, delete the old file from the gist
        if old_filename and old_filename != new_filename:
            files[old_filename] = None  # null = delete file from gist

        collection_label = f" [{script.collection.name}]" if script.collection else ""
        payload = {
            "description": f"Script: {script.name}{collection_label} (Document Extraction Portal)",
            "files": files
        }
        url = f"https://api.github.com/gists/{script.gist_id}"
        resp = requests.patch(url, json=payload, headers=headers)
    else:
        # Create new Gist
        collection_label = f" [{script.collection.name}]" if script.collection else ""
        payload = {
            "description": f"Script: {script.name}{collection_label} (Document Extraction Portal)",
            "public": False,
            "files": {new_filename: {"content": content}}
        }
        url = "https://api.github.com/gists"
        resp = requests.post(url, json=payload, headers=headers)

    if resp.status_code in (200, 201):
        data = resp.json()
        script.gist_id = data['id']
        script.gist_url = data['html_url']
        script.gist_filename = new_filename
    else:
        raise Exception(f"Gist API Error {resp.status_code}: {resp.text}")


def delete_script_gist(script):
    """Delete the gist from GitHub and clear gist fields on the script."""
    token_setting = Setting.query.get('github_token')
    if not token_setting or not token_setting.value:
        raise Exception("No GitHub token configured.")

    if not script.gist_id:
        return  # Nothing to delete

    token = token_setting.value
    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json'
    }

    url = f"https://api.github.com/gists/{script.gist_id}"
    resp = requests.delete(url, headers=headers)

    if resp.status_code not in (204, 404):
        raise Exception(f"Gist Delete Error {resp.status_code}: {resp.text}")

    script.gist_id = None
    script.gist_url = None
    script.gist_filename = None


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


# --- Collection Endpoints ---

from models.collection import Collection

@scripts_bp.route('/api/collections', methods=['GET', 'POST'])
def handle_collections():
    if request.method == 'GET':
        collections = Collection.query.order_by(Collection.created_at).all()
        return jsonify([c.to_dict() for c in collections])

    elif request.method == 'POST':
        data = request.json
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'error': 'Name required'}), 400
        
        collection = Collection(name=name)
        db.session.add(collection)
        db.session.commit()
        return jsonify(collection.to_dict())


@scripts_bp.route('/api/collections/<collection_id>', methods=['DELETE'])
def delete_collection(collection_id):
    collection = Collection.query.get(collection_id)
    if not collection:
        return jsonify({'error': 'Collection not found'}), 404
    
    # Scripts will automatically have collection_id set to NULL due to relationship? 
    # Actually we didn't set cascade in Collection.scripts. 
    # SQLAlchemy default is to set FK to NULL if nullable=True.
    
    db.session.delete(collection)
    db.session.commit()
    return jsonify({'message': 'Deleted'})


@scripts_bp.route('/api/scripts/<script_id>/move', methods=['PUT'])
def move_script(script_id):
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    data = request.json
    collection_id = data.get('collection_id') # Can be None to move to Unsorted

    if collection_id:
        collection = Collection.query.get(collection_id)
        if not collection:
            return jsonify({'error': 'Collection not found'}), 404

    script.collection_id = collection_id
    db.session.commit()
    return jsonify({'message': 'Script moved', 'collection_id': collection_id})


# --- GitHub Gist Endpoints ---

@scripts_bp.route('/api/scripts/<script_id>/gist/sync', methods=['POST'])
def force_gist_sync(script_id):
    """Force-sync a script to GitHub Gist (create or update)."""
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    script_path = os.path.join(current_app.config['SCRIPTS_FOLDER'], script.filename)
    if not os.path.exists(script_path):
        return jsonify({'error': 'Script file not found on disk'}), 404

    with open(script_path, 'r') as f:
        content = f.read()

    try:
        sync_script_to_gist(script, content)
        script.sync_to_gist = True
        db.session.commit()
        return jsonify({'message': 'Gist synced', 'gist_id': script.gist_id, 'gist_url': script.gist_url})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@scripts_bp.route('/api/scripts/<script_id>/gist', methods=['DELETE'])
def remove_gist(script_id):
    """Delete the GitHub Gist for a script and unlink it."""
    script = Script.query.get(script_id)
    if not script:
        return jsonify({'error': 'Script not found'}), 404

    try:
        delete_script_gist(script)
        script.sync_to_gist = False
        db.session.commit()
        return jsonify({'message': 'Gist deleted and unlinked'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400
