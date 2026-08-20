const fs = require('fs');
const path = require('path');

const finalJsonDir = "E:\\Books\\schoolpook\\OCR-Deployment\\input\\1th\\workflow\\output";
const outputJson = path.join(__dirname, 'public', 'catalog.json');
const outputHtml = path.join(__dirname, 'public', 'catalog.html');

function cleanUnitCode(unit) {
  if (!unit) return 'u1';
  const match = unit.match(/[cu](\d+)/i);
  return match ? `u${match[1]}` : unit.replace(/.*_/, '');
}

function cleanLessonCode(lesson) {
  if (!lesson) return 'l1';
  const match = lesson.match(/[cl](\d+)$/i);
  return match ? `l${match[1]}` : lesson.replace(/.*_/, '');
}

async function main() {
  console.log('🚀 Generating Full Rendered Course Catalog for All Image Pagers, HTML, and Classrooms...\n');

  if (!fs.existsSync(finalJsonDir)) {
    console.error(`Directory not found: ${finalJsonDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(finalJsonDir).filter(f => f.endsWith('_final.json'));
  console.log(`Found ${files.length} course final JSON files.`);

  const catalog = [];
  let totalLessons = 0;
  let totalClassrooms = 0;
  let totalPrinted = 0;
  let totalHtml = 0;

  for (const file of files) {
    const filePath = path.join(finalJsonDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);

      const subjectCode = data.subject_code || data.htmlfolder || file.replace('_final.json', '');
      const subjectName = data.subject || data.subject_name || subjectCode;
      const grade = data.grade || '';
      const part = data.part ?? data.term ?? data.semester ?? 0;
      const coverUrl = `https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/thumbnails/${subjectCode}.webp`;

      const courseEntry = {
        file,
        subjectCode,
        subjectName,
        grade,
        part,
        coverUrl,
        units: [],
      };

      const units = data.units || [];
      for (const u of units) {
        const uCode = cleanUnitCode(u.unit_code || u.unit_id || 'u1');
        const uName = u.unit_name || u.title || `الوحدة ${uCode}`;

        const unitEntry = {
          unitCode: uCode,
          unitName: uName,
          lessons: [],
        };

        const lessons = u.lessons || [];
        for (const l of lessons) {
          totalLessons++;
          const lCode = cleanLessonCode(l.lesson_code || l.lesson_id || 'l1');
          const lName = l.lesson_name || l.title || `الدرس ${lCode}`;
          const startPage = l.start_page || 1;
          const endPage = l.end_page || (startPage + 4);

          // 1. Printed Pages URL
          const hasPrinted = !!(l.start_page && l.end_page);
          if (hasPrinted) totalPrinted++;
          const printedUrl = `/printed-pages?subject=${encodeURIComponent(subjectCode)}&unit=${encodeURIComponent(uCode)}&lesson=${encodeURIComponent(lCode)}&start=${startPage}&end=${endPage}`;

          // 2. HTML Lesson URL
          const customHtml = l.lesson_html || (data.htmlfolder ? `${data.htmlfolder}/${data.htmlfolder}_${uCode}${lCode}.html` : undefined);
          const hasHtml = !!(l.lesson_html || data.htmlfolder);
          if (hasHtml) totalHtml++;
          const htmlUrl = `/html?subject=${encodeURIComponent(subjectCode)}&unit=${encodeURIComponent(uCode)}&lesson=${encodeURIComponent(lCode)}${customHtml ? `&file=${encodeURIComponent(customHtml)}` : ''}`;

          // 3. Classroom URLs
          const classroomsList = l.classrooms || l.classroomsid || (l.classroom_id ? [l.classroom_id] : []);
          const classrooms = [];
          if (classroomsList.length > 0) {
            totalClassrooms += classroomsList.length;
            classroomsList.forEach((cItem, cIdx) => {
              const cId = typeof cItem === 'string' ? cItem : (cItem.id || cItem.classroom_id);
              if (cId) {
                classrooms.push({
                  id: cId,
                  version: `v${cIdx + 1}`,
                  playerUrl: `/classroom?subject=${encodeURIComponent(subjectCode)}&unit=${encodeURIComponent(uCode)}&lesson=${encodeURIComponent(lCode)}&id=${encodeURIComponent(cId)}`,
                  dataUrl: `/api/courses/classrooms/${subjectCode}/${uCode}/${lCode}/${cId}/classdata.json`,
                  zipUrl: `/classroom?mode=zip&zipUrl=/api/courses/classrooms/${subjectCode}/${uCode}/${lCode}/${cId}/classroom.zip`,
                });
              }
            });
          }

          unitEntry.lessons.push({
            lessonCode: lCode,
            lessonName: lName,
            startPage,
            endPage,
            hasPrinted,
            hasHtml,
            printedUrl,
            htmlUrl,
            classrooms,
          });
        }

        courseEntry.units.push(unitEntry);
      }

      catalog.push(courseEntry);
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }

  // Ensure public directory exists
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  fs.writeFileSync(outputJson, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`✅ Saved catalog JSON with ${catalog.length} courses, ${totalLessons} lessons, and ${totalClassrooms} classrooms.`);
  console.log(`   Location: ${outputJson}`);

  // Generate standalone HTML catalog viewer
  const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>دليل الدروس التفاعلية والمطبوعة - Cloudflare Pages</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Cairo', sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #020617; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col">
  <!-- Header -->
  <header class="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-cyan-500/20">
        📚
      </div>
      <div>
        <h1 class="text-lg font-black text-white">دليل الدروس الشامل (OpenMAIC & Cloudflare Pages)</h1>
        <p class="text-xs text-slate-400">بث وعرض صفحات الكتب، الدروس التفاعلية HTML، والغرف الصفية الذكية مع الصوتيات</p>
      </div>
    </div>

    <!-- Search and Grade filter -->
    <div class="flex items-center gap-3 flex-1 max-w-lg">
      <input type="text" id="searchInput" placeholder="بحث بالاسم أو الكود (مثال: adb10p1, الأحياء, المعلقات)..." class="w-full bg-slate-950 text-xs text-slate-200 px-4 py-2 rounded-xl border border-slate-800 outline-none focus:border-cyan-500 font-bold" />
      <select id="gradeFilter" class="bg-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl border border-slate-700 outline-none font-bold">
        <option value="">جميع الصفوف</option>
        <option value="1">الصف 1</option>
        <option value="2">الصف 2</option>
        <option value="3">الصف 3</option>
        <option value="4">الصف 4</option>
        <option value="5">الصف 5</option>
        <option value="6">الصف 6</option>
        <option value="7">الصف 7</option>
        <option value="8">الصف 8</option>
        <option value="9">الصف 9</option>
        <option value="10">الصف 10</option>
        <option value="11">الصف 11</option>
        <option value="12">الصف 12</option>
      </select>
    </div>
  </header>

  <!-- Stats bar -->
  <div class="bg-slate-900/40 border-b border-slate-800/80 px-6 py-2 flex flex-wrap items-center gap-6 text-xs text-slate-400">
    <div>إجمالي المقررات: <span class="font-bold text-white">${catalog.length}</span></div>
    <div>إجمالي الدروس: <span class="font-bold text-cyan-400">${totalLessons}</span></div>
    <div>الغرف الصفية الذكية: <span class="font-bold text-emerald-400">${totalClassrooms}</span></div>
    <div>صفحات الكتب الممسوحة: <span class="font-bold text-amber-400">${totalPrinted}</span></div>
    <div>الدروس التفاعلية HTML: <span class="font-bold text-sky-400">${totalHtml}</span></div>
  </div>

  <!-- Main Container -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar: Courses List -->
    <aside class="w-80 border-l border-slate-800 bg-slate-900/30 overflow-y-auto p-4 space-y-2 shrink-0" id="coursesList">
      <!-- Injected by JS -->
    </aside>

    <!-- Main View: Course Lessons & Live Preview -->
    <main class="flex-1 flex flex-col overflow-y-auto p-6 space-y-6" id="mainContent">
      <div class="p-12 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px]">
        <span class="text-4xl mb-3">👈</span>
        <h3 class="text-sm font-bold text-slate-400">اختر مقرراً ودرساً من القائمة لبدء العرض أو المعاينة المباشرة</h3>
      </div>
    </main>
  </div>

  <script>
    const CATALOG = ${JSON.stringify(catalog)};
    let selectedCourse = null;
    let selectedLesson = null;

    const searchInput = document.getElementById('searchInput');
    const gradeFilter = document.getElementById('gradeFilter');
    const coursesList = document.getElementById('coursesList');
    const mainContent = document.getElementById('mainContent');

    function renderCourses() {
      const q = searchInput.value.toLowerCase().trim();
      const grade = gradeFilter.value;

      const filtered = CATALOG.filter(c => {
        const matchesGrade = !grade || String(c.grade) === grade;
        const matchesSearch = !q || c.subjectName.toLowerCase().includes(q) || c.subjectCode.toLowerCase().includes(q) || c.units.some(u => u.lessons.some(l => l.lessonName.toLowerCase().includes(q)));
        return matchesGrade && matchesSearch;
      });

      coursesList.innerHTML = filtered.map(c => {
        const isSelected = selectedCourse && selectedCourse.subjectCode === c.subjectCode;
        const totalL = c.units.reduce((acc, u) => acc + u.lessons.length, 0);
        const totalC = c.units.reduce((acc, u) => acc + u.lessons.reduce((la, l) => la + l.classrooms.length, 0), 0);
        return \`
          <div onclick="selectCourse('\${c.subjectCode}')" class="p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 \${isSelected ? 'bg-cyan-500/20 border-cyan-500/50 text-white shadow-lg' : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80'}">
            <img src="\${c.coverUrl}" class="w-12 h-12 rounded-xl object-cover bg-slate-950 border border-slate-800" onerror="this.src='/placeholder.png';this.onerror=null;" />
            <div class="flex-1 min-w-0">
              <h4 class="text-xs font-bold truncate">\${c.subjectName}</h4>
              <div class="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>\${c.subjectCode}</span>
                <span>•</span>
                <span>\${totalL} درس</span>
                \${totalC > 0 ? \`<span class="text-emerald-400 font-bold">• \${totalC} غرفة</span>\` : ''}
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    window.selectCourse = (subjectCode) => {
      selectedCourse = CATALOG.find(c => c.subjectCode === subjectCode);
      renderCourses();
      renderCourseDetails();
    };

    window.previewUrl = (url, title) => {
      const previewContainer = document.getElementById('livePreview');
      if (previewContainer) {
        previewContainer.innerHTML = \`
          <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div class="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
              <span class="font-bold text-white flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                \${title}
              </span>
              <a href="\${url}" target="_blank" class="text-cyan-400 hover:underline flex items-center gap-1 font-mono text-[11px]">
                فتح في تبويب مستقل ↗
              </a>
            </div>
            <iframe src="\${url}" class="w-full h-[650px] border-none bg-slate-950" allow="autoplay; fullscreen"></iframe>
          </div>
        \`;
        previewContainer.scrollIntoView({ behavior: 'smooth' });
      }
    };

    function renderCourseDetails() {
      if (!selectedCourse) return;
      const c = selectedCourse;

      mainContent.innerHTML = \`
        <div class="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div class="flex items-center gap-4">
            <img src="\${c.coverUrl}" class="w-16 h-16 rounded-2xl object-cover bg-slate-950 border border-slate-800 shadow-md" onerror="this.src='/placeholder.png';this.onerror=null;" />
            <div>
              <h2 class="text-lg font-black text-white flex items-center gap-2">
                <span>\${c.subjectName}</span>
                <span class="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-mono font-bold border border-cyan-500/40">
                  \${c.subjectCode}
                </span>
              </h2>
              <p class="text-xs text-slate-400 mt-1">الصف: \${c.grade || 'غير محدد'} • الجزء: \${c.part || 1} • \${c.units.length} وحدات دراسية</p>
            </div>
          </div>
        </div>

        <!-- Units & Lessons Accordion / List -->
        <div class="space-y-4">
          \${c.units.map((u, uIdx) => \`
            <div class="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4">
              <h3 class="text-sm font-black text-slate-200 flex items-center gap-2">
                <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold font-mono">
                  \${uIdx + 1}
                </span>
                <span>\${u.unitName}</span>
              </h3>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                \${u.lessons.map(l => \`
                  <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition">
                    <div>
                      <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                        <span class="text-cyan-400 font-bold">\${l.lessonCode}</span>
                        <span>ص \${l.startPage} - \${l.endPage}</span>
                      </div>
                      <h4 class="text-xs font-bold text-white">\${l.lessonName}</h4>
                    </div>

                    <!-- Action buttons -->
                    <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
                      <button onclick="previewUrl('\${l.printedUrl}', 'صفحات الكتاب: \${l.lessonName}')" class="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 font-bold border border-emerald-500/30 transition flex items-center gap-1">
                        📖 الكتاب المطبوع
                      </button>

                      <button onclick="previewUrl('\${l.htmlUrl}', 'الدرس التفاعلي: \${l.lessonName}')" class="px-2.5 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 font-bold border border-sky-500/30 transition flex items-center gap-1">
                        🖥️ الدرس HTML
                      </button>

                      \${l.classrooms.map((cr, crIdx) => \`
                        <button onclick="previewUrl('\${cr.playerUrl}', 'الغرفة الصفية الذكية (\${cr.version}): \${l.lessonName}')" class="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 font-bold border border-purple-500/30 transition flex items-center gap-1">
                          🎙️ غرفة \${cr.version}
                        </button>
                      \`).join('')}
                    </div>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`).join('')}
        </div>

        <!-- Live Preview Target -->
        <div id="livePreview" class="pt-4"></div>
      \`;
    }

    searchInput.addEventListener('input', renderCourses);
    gradeFilter.addEventListener('change', renderCourses);

    // Initial render
    renderCourses();
    if (CATALOG.length > 0) selectCourse(CATALOG[0].subjectCode);
  </script>
</body>
</html>`;

  fs.writeFileSync(outputHtml, htmlContent, 'utf8');
  console.log(`✅ Saved standalone interactive HTML catalog: ${outputHtml}`);
  console.log(`==================================================`);
  console.log(`🎉 CATALOG & RENDER PAGES GENERATION COMPLETE!`);
  console.log(`==================================================\n`);
}

main();
