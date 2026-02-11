import os
import uuid
import json
from flask import Blueprint, request, jsonify, render_template, send_from_directory, current_app, Response
from extensions import db
from models.rule import ExtractionRule
from models.template import ExtractionTemplate
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


# --- Template Management ---

@extraction_bp.route('/api/templates', methods=['GET', 'POST'])
def manage_templates():
    if request.method == 'GET':
        templates = ExtractionTemplate.query.all()
        return jsonify([t.to_dict() for t in templates])
    
    elif request.method == 'POST':
        data = request.json
        name = data.get('name')
        description = data.get('description')
        
        if not name:
            return jsonify({'error': 'Name is required'}), 400
            
        template = ExtractionTemplate(name=name, description=description)
        db.session.add(template)
        try:
            db.session.commit()
            return jsonify(template.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

@extraction_bp.route('/api/templates/<template_id>', methods=['PUT', 'DELETE'])
def template_detail(template_id):
    template = ExtractionTemplate.query.get_or_404(template_id)
    
    if request.method == 'PUT':
        data = request.json
        template.name = data.get('name', template.name)
        template.description = data.get('description', template.description)
        db.session.commit()
        return jsonify(template.to_dict())
        
    elif request.method == 'DELETE':
        db.session.delete(template)
        db.session.commit()
        return jsonify({'message': 'Template deleted'})

# --- Rule Management ---

@extraction_bp.route('/api/templates/<template_id>/rules', methods=['GET', 'POST'])
def manage_template_rules(template_id):
    template = ExtractionTemplate.query.get_or_404(template_id)
    
    if request.method == 'GET':
        rules = ExtractionRule.query.filter_by(template_id=template_id).all()
        return jsonify([r.to_dict() for r in rules])
        
    elif request.method == 'POST':
        data = request.json
        rule = ExtractionRule(
            field_name=data.get('field_name'),
            regex=data.get('regex'),
            template_id=template_id
        )
        db.session.add(rule)
        db.session.commit()
        return jsonify(rule.to_dict()), 201

@extraction_bp.route('/api/templates/<template_id>/rules/<rule_id>', methods=['PUT', 'DELETE'])
def manage_template_rule_detail(template_id, rule_id):
    rule = ExtractionRule.query.get_or_404(rule_id)
    
    # Enforce template ownership
    if str(rule.template_id) != str(template_id):
         return jsonify({'error': 'Rule does not belong to this template'}), 403

    if request.method == 'PUT':
        data = request.json
        rule.field_name = data.get('field_name', rule.field_name)
        rule.regex = data.get('regex', rule.regex)
        db.session.commit()
        return jsonify(rule.to_dict())

    elif request.method == 'DELETE':
        db.session.delete(rule)
        db.session.commit()
        return jsonify({'message': 'Rule deleted', 'id': rule_id})

@extraction_bp.route('/rules', methods=['GET', 'POST', 'DELETE'])
def manage_rules():
    # Legacy endpoint kept for compatibility or direct rule management if needed
    # But updated to handle updating existing rules
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
                # rule.template_id = data.get('template_id', rule.template_id) # Optional update
            else:
                return jsonify({'error': 'Rule not found'}), 404
        else:
            # Creating rule without template (Global) or with if provided
            rule = ExtractionRule(
                field_name=data.get('field_name'),
                regex=data.get('regex'),
                template_id=data.get('template_id')
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
    template_id = data.get('template_id')

    if not filename:
        return jsonify({'error': 'Filename is required'}), 400

    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404

    try:
        # Filter rules by template if provided, else use all (or maybe specific global ones?)
        # For now, if template provided, use ONLY template rules.
        # If not provided, fetch ALL rules (backward compatibility)
        if template_id:
            rules = ExtractionRule.query.filter_by(template_id=template_id).all()
        else:
            rules = ExtractionRule.query.all()
            
        rules_dicts = [r.to_dict() for r in rules]
        text = extract_text_from_pdf(filepath)
        extracted_data = apply_rules(text, rules_dicts)
        return jsonify({'text': text, 'data': extracted_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@extraction_bp.route('/export', methods=['POST'])
def export_data():
    data = request.json
    extracted_data = data.get('data')
    filename = data.get('filename', 'export')
    
    if not extracted_data:
        return jsonify({'error': 'No data to export'}), 400
        
    json_str = json.dumps(extracted_data, indent=4)
    
    return Response(
        json_str,
        mimetype="application/json",
        headers={"Content-disposition": f"attachment; filename={filename}.json"}
    )
