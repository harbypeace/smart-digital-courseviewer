import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

for root, dirs, files in os.walk(r'E:\Books\schoolpook'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '.venv', 'venv', '__pycache__']]
    for f in files:
        if f.endswith('.db') or f.endswith('.sqlite') or f.endswith('.sqlite3'):
            print(os.path.join(root, f))
