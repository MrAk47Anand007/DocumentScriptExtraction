import sqlite3
import os

db_path = os.path.join('instance', 'app.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

print(f"Connecting to {db_path}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create collections table
try:
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS collections (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at DATETIME
    )
    """)
    print("Ensured collections table exists.")
except Exception as e:
    print(f"Error creating collections table: {e}")

# Add collection_id to scripts
try:
    cursor.execute("PRAGMA table_info(scripts)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'collection_id' not in columns:
        print("Adding collection_id column to scripts table...")
        cursor.execute("ALTER TABLE scripts ADD COLUMN collection_id VARCHAR(36) REFERENCES collections(id)")
        conn.commit()
        print("Column added.")
    else:
        print("collection_id column already exists.")

except Exception as e:
    print(f"Error altering scripts table: {e}")

conn.close()
print("Migration complete.")
