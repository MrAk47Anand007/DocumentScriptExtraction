import os
import json
import uuid
import pandas as pd
from flask import Flask, render_template, request, jsonify, send_from_directory
from extraction_engine import extract_text_from_pdf, apply_rules

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['RULES_FILE'] = 'config/rules.json'

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Ensure rules file exists
if not os.path.exists(app.config['RULES_FILE']):
    with open(app.config['RULES_FILE'], 'w') as f:
        json.dump([], f)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        filename = str(uuid.uuid4()) + "_" + file.filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'message': 'File uploaded successfully', 'filepath': filepath, 'filename': filename})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/rules', methods=['GET', 'POST', 'DELETE'])
def manage_rules():
    if request.method == 'GET':
        try:
            with open(app.config['RULES_FILE'], 'r') as f:
                rules = json.load(f)
            return jsonify(rules)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'POST':
        new_rule = request.json
        try:
            with open(app.config['RULES_FILE'], 'r') as f:
                rules = json.load(f)
            
            # If it has an ID, update it, else add new
            if 'id' in new_rule:
                for i, rule in enumerate(rules):
                    if rule.get('id') == new_rule['id']:
                        rules[i] = new_rule
                        break
            else:
                new_rule['id'] = str(uuid.uuid4())
                rules.append(new_rule)
            
            with open(app.config['RULES_FILE'], 'w') as f:
                json.dump(rules, f, indent=4)
            return jsonify({'message': 'Rule saved', 'rule': new_rule})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    elif request.method == 'DELETE':
        rule_id = request.args.get('id')
        try:
            with open(app.config['RULES_FILE'], 'r') as f:
                rules = json.load(f)
            
            rules = [r for r in rules if r.get('id') != rule_id]
            
            with open(app.config['RULES_FILE'], 'w') as f:
                json.dump(rules, f, indent=4)
            return jsonify({'message': 'Rule deleted'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/extract', methods=['POST'])
def extract_data():
    data = request.json
    filename = data.get('filename')
    
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400
        
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
        
    try:
        # Load rules
        with open(app.config['RULES_FILE'], 'r') as f:
            rules = json.load(f)
            
        text = extract_text_from_pdf(filepath)
        extracted_data = apply_rules(text, rules)
        
        return jsonify({'text': text, 'data': extracted_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Script Management System ---

app.config['SCRIPTS_FOLDER'] = 'scripts'
app.config['BUILDS_FOLDER'] = 'builds'

os.makedirs(app.config['SCRIPTS_FOLDER'], exist_ok=True)
os.makedirs(app.config['BUILDS_FOLDER'], exist_ok=True)

@app.route('/scripts')
def scripts_page():
    return render_template('scripts.html')

@app.route('/api/scripts', methods=['GET', 'POST'])
def handle_scripts():
    if request.method == 'GET':
        scripts = []
        if os.path.exists(app.config['SCRIPTS_FOLDER']):
            for f in os.listdir(app.config['SCRIPTS_FOLDER']):
                if f.endswith('.py'):
                    scripts.append({'id': f, 'name': f, 'content': ''}) # Content loaded on demand
        return jsonify(scripts)
    
    elif request.method == 'POST':
        data = request.json
        script_name = data.get('name')
        content = data.get('content')
        
        if not script_name.endswith('.py'):
            script_name += '.py'
        
        filepath = os.path.join(app.config['SCRIPTS_FOLDER'], script_name)
        
        with open(filepath, 'w') as f:
            f.write(content)
            
        return jsonify({'message': 'Script saved', 'id': script_name})

@app.route('/api/scripts/<script_id>')
def get_script_content(script_id):
    filepath = os.path.join(app.config['SCRIPTS_FOLDER'], script_id)
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        return jsonify({'id': script_id, 'name': script_id, 'content': content})
    return jsonify({'error': 'Script not found'}), 404

@app.route('/api/scripts/<script_id>/run', methods=['POST'])
def run_script(script_id):
    import subprocess
    import time
    
    script_path = os.path.join(app.config['SCRIPTS_FOLDER'], script_id)
    if not os.path.exists(script_path):
        return jsonify({'error': 'Script not found'}), 404
    
    build_id = f"{script_id}_{int(time.time())}"
    build_dir = os.path.join(app.config['BUILDS_FOLDER'], script_id)
    os.makedirs(build_dir, exist_ok=True)
    
    output_file = os.path.join(build_dir, f"{build_id}.log")
    
    # Run the script in a separate process and capture output
    try:
        # We run this asynchronously in a real Jenkins, but for now we'll do blocking for simplicity
        # or we could use subprocess.Popen to run it in background. 
        # Let's do blocking for immediate feedback in this MVP, 
        # but redirect output to file.
        
        with open(output_file, 'w') as log:
            process = subprocess.Popen(['python', script_path], stdout=log, stderr=subprocess.STDOUT)
            process.wait() # Wait for completion for now
            
        return jsonify({'message': 'Execution completed', 'build_id': build_id, 'status': 'success' if process.returncode == 0 else 'failure'})
    except Exception as e:
         with open(output_file, 'a') as log:
            log.write(f"\nExecution Failed: {str(e)}")
         return jsonify({'error': str(e)}), 500

@app.route('/api/builds/<script_id>')
def list_builds(script_id):
    build_dir = os.path.join(app.config['BUILDS_FOLDER'], script_id)
    builds = []
    if os.path.exists(build_dir):
        for f in os.listdir(build_dir):
            if f.endswith('.log'):
                builds.append({'id': f.replace('.log', ''), 'timestamp': os.path.getmtime(os.path.join(build_dir, f))})
    
    # Sort by timestamp desc
    builds.sort(key=lambda x: x['timestamp'], reverse=True)
    return jsonify(builds)

@app.route('/api/builds/output/<script_id>/<build_id>')
def get_build_output(script_id, build_id):
    build_file = os.path.join(app.config['BUILDS_FOLDER'], script_id, f"{build_id}.log")
    if os.path.exists(build_file):
        with open(build_file, 'r') as f:
            content = f.read()
        return jsonify({'output': content})
    return jsonify({'error': 'Build log not found'}), 404

if __name__ == '__main__':
    app.run(debug=True)
