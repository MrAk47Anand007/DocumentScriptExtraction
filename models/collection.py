import uuid
from datetime import datetime
from extensions import db

class Collection(db.Model):
    __tablename__ = 'collections'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to scripts
    scripts = db.relationship('Script', backref='collection', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'script_count': len(self.scripts)  # Useful for UI
        }
