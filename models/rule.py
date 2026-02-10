import uuid
from datetime import datetime
from extensions import db


class ExtractionRule(db.Model):
    __tablename__ = 'extraction_rules'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    field_name = db.Column(db.String(255), nullable=False)
    regex = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'field_name': self.field_name,
            'regex': self.regex,
        }
