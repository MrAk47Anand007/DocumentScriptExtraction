from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("Running migration...")
    
    # Create collections table
    try:
        db.create_all()
        print("Created new tables (if any).")
    except Exception as e:
        print(f"Error creating tables: {e}")

    # Add collection_id to scripts if it doesn't exist
    try:
        with db.engine.connect() as conn:
            # Check if column exists (SQLite specific check)
            result = conn.execute(text("PRAGMA table_info(scripts)"))
            columns = [row[1] for row in result]
            
            if 'collection_id' not in columns:
                print("Adding collection_id column to scripts table...")
                conn.execute(text("ALTER TABLE scripts ADD COLUMN collection_id VARCHAR(36)"))
                conn.commit()
                print("Column added.")
            else:
                print("collection_id column already exists.")
                
    except Exception as e:
        print(f"Error altering table: {e}")

    print("Migration complete.")
