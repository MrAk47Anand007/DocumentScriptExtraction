from flask import Blueprint, request, jsonify
from models.setting import Setting
from extensions import db

settings_bp = Blueprint('settings', __name__)

@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    settings = Setting.query.all()
    # Convert list to dict for easier frontend consumption
    settings_dict = {s.key: s.value for s in settings}
    return jsonify(settings_dict)

@settings_bp.route('/api/settings', methods=['POST'])
def update_settings():
    data = request.json
    try:
        for key, value in data.items():
            setting = Setting.query.get(key)
            if setting:
                setting.value = value
            else:
                setting = Setting(key=key, value=value)
                db.session.add(setting)
        
        db.session.commit()
        return jsonify({'message': 'Settings updated successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
