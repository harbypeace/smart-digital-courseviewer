import sqlite3
import json
import urllib.request
import re

# 1. Read SQLite DB
conn = sqlite3.connect(r'D:\projects\openclaw\classrooms.db')
cursor = conn.cursor()

# Get all classrooms
cursor.execute("SELECT id, classroom_id, subject, subject_code, grade, lesson_code, lesson_name, zip_url FROM classrooms")
all_classrooms = cursor.fetchall()
print(f"Total rows in classrooms: {len(all_classrooms)}")

# Map by zip_url
by_zip_url = {}
for r in all_classrooms:
    cid, subj, subj_code, grade, lcode, lname, zurl = r[1], r[2], r[3], r[4], r[5], r[6], r[7]
    if zurl:
        clean_z = zurl.replace('https://pub-cbd581fe2d9b4424a5d3855a7a5d13a2.r2.dev/', '').replace('http://pub-cbd581fe2d9b4424a5d3855a7a5d13a2.r2.dev/', '').lstrip('/')
        by_zip_url[clean_z] = {
            "classroom_id": cid,
            "subject_code": subj_code,
            "lesson_code": lcode,
            "lesson_name": lname,
            "grade": grade,
            "subject": subj
        }

# Map by (subject, grade, lesson_code) or (subject_code, lesson_code)
by_subject_grade_lesson = {}
for r in all_classrooms:
    cid, subj, subj_code, grade, lcode, lname, zurl = r[1], r[2], r[3], r[4], r[5], r[6], r[7]
    if subj and grade and lcode:
        k = f"{str(subj).strip().lower()}::grade{grade}::{str(lcode).strip().lower()}"
        if k not in by_subject_grade_lesson:
            by_subject_grade_lesson[k] = []
        by_subject_grade_lesson[k].append({
            "classroom_id": cid,
            "subject_code": subj_code,
            "lesson_code": lcode,
            "lesson_name": lname,
            "zip_url": zurl
        })
    if subj_code and lcode:
        k2 = f"{str(subj_code).strip().lower()}::{str(lcode).strip().lower()}"
        if k2 not in by_subject_grade_lesson:
            by_subject_grade_lesson[k2] = []
        by_subject_grade_lesson[k2].append({
            "classroom_id": cid,
            "subject_code": subj_code,
            "lesson_code": lcode,
            "lesson_name": lname,
            "zip_url": zurl
        })

print(f"Mapped {len(by_zip_url)} by zip_url, {len(by_subject_grade_lesson)} by subject/grade/lesson.")
