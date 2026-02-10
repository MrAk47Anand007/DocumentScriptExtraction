import os
import uuid
from flask import Blueprint, request, jsonify, render_template, send_from_directory, current_app
from extensions import db
from models.rule import ExtractionRule
from extraction_engine import extract_text_from_pdf, apply_rules

extraction_bp = Blueprint('extraction', __name__)


@extraction_bp.route('/')
def index():
    return render_template('index.html')


@extraction_bp.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filename = str(uuid.uuid4()) + '_' + file.filename
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    return jsonify({'message': 'File uploaded successfully', 'filepath': filepath, 'filename': filename})


@extraction_bp.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)


@extraction_bp.route('/rules', methods=['GET', 'POST', 'DELETE'])
def manage_rules():
    if request.method == 'GET':
        rules = ExtractionRule.query.all()
        return jsonify([r.to_dict() for r in rules])

    elif request.method == 'POST':
        data = request.json
        rule_id = data.get('id')

        if rule_id:
            rule = ExtractionRule.query.get(rule_id)
            if rule:
                rule.field_name = data.get('field_name', rule.field_name)
                rule.regex = data.get('regex', rule.regex)
            else:
                return jsonify({'error': 'Rule not found'}), 404
        else:
            rule = ExtractionRule(
                field_name=data.get('field_name'),
                regex=data.get('regex'),
            )
            db.session.add(rule)

        db.session.commit()
        return jsonify({'message': 'Rule saved', 'rule': rule.to_dict()})

    elif request.method == 'DELETE':
        rule_id = request.args.get('id')
        rule = ExtractionRule.query.get(rule_id)
        if rule:
            db.session.delete(rule)
            db.session.commit()
        return jsonify({'message': 'Rule deleted'})


@extraction_bp.route('/extract', methods=['POST'])
def extract_data():
    data = request.json
    filename = data.get('filename')

    if not filename:
        return jsonify({'error': 'Filename is required'}), 400

    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    try:
        rules = ExtractionRule.query.all()
        rules_dicts = [r.to_dict() for r in rules]
        text = extract_text_from_pdf(filepath)
        extracted_data = apply_rules(text, rules_dicts)
        return jsonify({'text': text, 'data': extracted_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
