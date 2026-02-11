import sqlite3
import os

# Database path (adjust if necessary)
DB_PATH = 'instance/app.db'

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 1. Create 'settings' table if it doesn't exist
        print("Creating 'settings' table...")
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(50) PRIMARY KEY,
            value TEXT,
            description VARCHAR(255),
            is_encrypted BOOLEAN,
            updated_at DATETIME
        )
        ''')

        # 2. Add columns to 'scripts' table
        print("Adding columns to 'scripts' table...")
        columns_to_add = [
            ('gist_id', 'VARCHAR(100)'),
            ('gist_url', 'VARCHAR(255)'),
            ('sync_to_gist', 'BOOLEAN DEFAULT 0')
        ]

        # Get existing columns
        cursor.execute("PRAGMA table_info(scripts)")
        existing_columns = [info[1] for info in cursor.fetchall()]

        for col_name, col_type in columns_to_add:
            if col_name not in existing_columns:
                print(f"Adding column {col_name}...")
                cursor.execute(f"ALTER TABLE scripts ADD COLUMN {col_name} {col_type}")
            else:
                print(f"Column {col_name} already exists.")

        conn.commit()
        print("Migration completed successfully.")

    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
