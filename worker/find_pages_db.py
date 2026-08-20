import os
import sqlite3

def find_sqlite_dbs(root_dirs):
    found = []
    for r in root_dirs:
        if not os.path.exists(r):
            continue
        for root, dirs, files in os.walk(r):
            # don't go too deep into node_modules or .git
            dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '.wrangler', '.venv', 'venv', '__pycache__']]
            for f in files:
                if f.endswith('.db') or f.endswith('.sqlite') or f.endswith('.sqlite3'):
                    fp = os.path.join(root, f)
                    found.append(fp)
    return found

search_dirs = [r'D:\projects', r'E:\Books']
dbs = find_sqlite_dbs(search_dirs)
print(f"Found {len(dbs)} databases:")

for db in dbs:
    try:
        conn = sqlite3.connect(db)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cursor.fetchall()]
        print(f"\n📂 DB: {db}")
        print(f"   Tables: {tables}")
        for t in tables:
            if 'page' in t.lower() or 'course' in t.lower() or 'lesson' in t.lower():
                cursor.execute(f"PRAGMA table_info({t});")
                cols = [c[1] for c in cursor.fetchall()]
                cursor.execute(f"SELECT COUNT(*) FROM {t}")
                cnt = cursor.fetchone()[0]
                print(f"   📋 Table {t} ({cnt} rows): {cols}")
        conn.close()
    except Exception as e:
        print(f"   ❌ Error reading {db}: {e}")
