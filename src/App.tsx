import React, { useState, useEffect } from 'react';
import { PrintedPagesViewer } from './pages/PrintedPagesViewer';
import { ClassroomPlayerPage } from './pages/ClassroomPlayerPage';
import { HtmlLessonViewer } from './pages/HtmlLessonViewer';
import { TestShowcase } from './pages/TestShowcase';

function getInitialRoute(): string {
  if (typeof window === 'undefined') return 'test';
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode')?.toLowerCase();
  const view = params.get('view')?.toLowerCase();

  if (path.includes('/printed-pages') || path.includes('/lesson/') || mode === 'printed' || view === 'printed') {
    return 'printed';
  }
  if (path.includes('/classroom') || mode === 'classroom' || mode === 'classid' || mode === 'zip' || mode === 'json' || view === 'classroom') {
    return 'classroom';
  }
  if (path.includes('/html') || mode === 'html' || view === 'html') {
    return 'html';
  }
  return 'test';
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute);

  useEffect(() => {
    const route = getInitialRoute();
    if (route !== currentRoute) {
      setCurrentRoute(route);
    }
  }, [currentRoute]);

  if (currentRoute === 'printed') {
    return <PrintedPagesViewer />;
  }

  if (currentRoute === 'classroom') {
    return <ClassroomPlayerPage />;
  }

  if (currentRoute === 'html') {
    return <HtmlLessonViewer />;
  }

  return <TestShowcase />;
}
