import os
import sys
import sqlite3

sys.stdout.reconfigure(encoding='utf-8')

def check_dir(dirpath):
    if not os.path.exists(dirpath):
        return
    for item in os.listdir(dirpath):
        fp = os.path.join(dirpath, item)
        if os.path.isfile(fp) and (fp.endswith('.db') or fp.endswith('.sqlite') or fp.endswith('.sqlite3')):
            inspect_db(fp)
        elif os.path.isdir(fp) and item not in ['node_modules', '.git', '.wrangler', '.venv', 'venv']:
            try:
                for sub in os.listdir(fp):
                    subfp = os.path.join(fp, sub)
                    if os.path.isfile(subfp) and (subfp.endswith('.db') or subfp.endswith('.sqlite') or subfp.endswith('.sqlite3')):
                        inspect_db(subfp)
            except:
                pass

def inspect_db(db_path):
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in c.fetchall()]
        print(f"\n[DB] {db_path}")
        print(f"  Tables: {tables}")
        for t in tables:
            c.execute(f"PRAGMA table_info({t});")
            cols = [col[1] for col in c.fetchall()]
            c.execute(f"SELECT COUNT(*) FROM {t}")
            cnt = c.fetchone()[0]
            print(f"  Table '{t}' ({cnt} rows): {cols}")
            if 'page' in t.lower():
                c.execute(f"SELECT * FROM {t} LIMIT 3")
                print("    Sample rows:", c.fetchall())
        conn.close()
    except Exception as e:
        print(f"  Error {db_path}: {e}")

for d in [r'D:\projects\openclaw', r'D:\projects\courseviewer', r'E:\Books\schoolpook\OCR-Deployment', r'D:\projects']:
    check_dir(d)
