import os
import json
from flask import Flask
from config import Config
from extensions import db


def create_app(config_object=None):
    app = Flask(__name__)
    app.config.from_object(config_object or Config)

    # Ensure required folders exist
    for folder in [app.config['UPLOAD_FOLDER'], app.config['SCRIPTS_FOLDER'], app.config['BUILDS_FOLDER']]:
        os.makedirs(folder, exist_ok=True)

    # Ensure legacy rules file exists (used by migration)
    rules_file = app.config['RULES_FILE']
    os.makedirs(os.path.dirname(rules_file), exist_ok=True)
    if not os.path.exists(rules_file):
        with open(rules_file, 'w') as f:
            json.dump([], f)

    db.init_app(app)

    # Register blueprints
    from blueprints.extraction import extraction_bp
    from blueprints.scripts import scripts_bp
    from blueprints.webhooks import webhooks_bp
    from blueprints.scheduler_bp import scheduler_bp
    from blueprints.public_api import public_api_bp
    app.register_blueprint(extraction_bp)
    app.register_blueprint(scripts_bp)
    app.register_blueprint(webhooks_bp)
    app.register_blueprint(scheduler_bp)
    app.register_blueprint(public_api_bp)

    with app.app_context():
        db.create_all()
        _migrate_existing_data(app)

    # Start scheduler and re-register persisted jobs (outside app_context — scheduler is global)
    from services.scheduler_service import init_scheduler
    init_scheduler(app)

    # Enable CORS
    from flask_cors import CORS
    CORS(app)

    return app


def _migrate_existing_data(app):
    """One-time migration: import rules.json and scripts/*.py into the database."""
    from models.rule import ExtractionRule
    from models.script import Script

    # Migrate rules from config/rules.json
    rules_file = app.config['RULES_FILE']
    if os.path.exists(rules_file):
        try:
            with open(rules_file, 'r') as f:
                rules = json.load(f)
            for rule in rules:
                if rule.get('field_name') and rule.get('regex'):
                    exists = ExtractionRule.query.filter_by(
                        field_name=rule['field_name'],
                        regex=rule['regex']
                    ).first()
                    if not exists:
                        db.session.add(ExtractionRule(
                            id=rule.get('id'),
                            field_name=rule['field_name'],
                            regex=rule['regex'],
                        ))
            db.session.commit()
        except Exception as e:
            print(f"Warning: could not migrate rules: {e}")

    # Migrate scripts/*.py files
    scripts_folder = app.config['SCRIPTS_FOLDER']
    if os.path.exists(scripts_folder):
        for filename in os.listdir(scripts_folder):
            if filename.endswith('.py'):
                exists = Script.query.filter_by(filename=filename).first()
                if not exists:
                    db.session.add(Script(name=filename, filename=filename))
        db.session.commit()


if __name__ == '__main__':
    create_app().run(debug=True, use_reloader=False)
