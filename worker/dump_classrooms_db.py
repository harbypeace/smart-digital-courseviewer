import sqlite3
import json

conn = sqlite3.connect(r'D:\projects\openclaw\classrooms.db')
cursor = conn.cursor()

# Get all classrooms
cursor.execute("SELECT id, classroom_id, subject, subject_code, grade, lesson_code, lesson_name, url, zip_url, status FROM classrooms")
rows = cursor.fetchall()
classrooms = []
for r in rows:
    classrooms.append({
        "id": r[0],
        "classroom_id": r[1],
        "subject": r[2],
        "subject_code": r[3],
        "grade": r[4],
        "lesson_code": r[5],
        "lesson_name": r[6],
        "url": r[7],
        "zip_url": r[8],
        "status": r[9]
    })

# Also get account_classrooms
cursor.execute("SELECT id, classroom_id, lesson_code, lesson_name, subject, grade, unit_name, account, url, status FROM account_classrooms")
ac_rows = cursor.fetchall()
account_classrooms = []
for r in ac_rows:
    account_classrooms.append({
        "id": r[0],
        "classroom_id": r[1],
        "lesson_code": r[2],
        "lesson_name": r[3],
        "subject": r[4],
        "grade": r[5],
        "unit_name": r[6],
        "account": r[7],
        "url": r[8],
        "status": r[9]
    })

with open(r'D:\projects\courseviewer\create worker\classrooms_db_dump.json', 'w', encoding='utf-8') as f:
    json.dump({
        "classrooms": classrooms,
        "account_classrooms": account_classrooms
    }, f, ensure_ascii=False, indent=2)

print(f"Dumped {len(classrooms)} classrooms and {len(account_classrooms)} account classrooms to classrooms_db_dump.json")
