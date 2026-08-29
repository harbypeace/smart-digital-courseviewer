import React, { useState, useEffect } from 'react';
import { PrintedPagesViewer } from './pages/PrintedPagesViewer';
import { ClassroomPlayerPage } from './pages/ClassroomPlayerPage';
import { TestShowcase } from './pages/TestShowcase';

function getInitialRoute(): string {
  if (typeof window === 'undefined') return 'classroom';
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode')?.toLowerCase();
  const view = params.get('view')?.toLowerCase();

  if (path.includes('/printed-pages') || path.includes('/lesson/') || mode === 'printed' || view === 'printed') {
    return 'printed';
  }
  if (path.includes('/test') || mode === 'test' || view === 'test') {
    return 'test';
  }
  return 'classroom';
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (currentRoute === 'printed') {
    return <PrintedPagesViewer />;
  }

  if (currentRoute === 'test') {
    return <TestShowcase />;
  }

  return <ClassroomPlayerPage />;
}
