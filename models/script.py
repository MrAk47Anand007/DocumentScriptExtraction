import uuid
import secrets
from datetime import datetime
from extensions import db


class Script(db.Model):
    __tablename__ = 'scripts'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False, unique=True)
    filename = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    webhook_token = db.Column(db.String(64), unique=True, nullable=True,
                              default=lambda: secrets.token_urlsafe(32))
    schedule_cron = db.Column(db.String(100), nullable=True)
    schedule_enabled = db.Column(db.Boolean, default=False)

    builds = db.relationship('Build', backref='script', lazy=True,
                             cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'filename': self.filename,
            'description': self.description,
            'webhook_token': self.webhook_token,
            'schedule_cron': self.schedule_cron,
            'schedule_enabled': self.schedule_enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Build(db.Model):
    __tablename__ = 'builds'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    script_id = db.Column(db.String(36), db.ForeignKey('scripts.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, running, success, failure
    triggered_by = db.Column(db.String(50), default='manual')  # manual, webhook, scheduler
    log_file = db.Column(db.String(500), nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    exit_code = db.Column(db.Integer, nullable=True)
    webhook_payload = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'script_id': self.script_id,
            'status': self.status,
            'triggered_by': self.triggered_by,
            'exit_code': self.exit_code,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None,
            'timestamp': self.started_at.timestamp() if self.started_at else None,
        }
