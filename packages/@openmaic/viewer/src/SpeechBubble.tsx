'use client';

interface SpeechBubbleProps { text: string; darkMode: boolean; }

export function SpeechBubble({ text, darkMode }: SpeechBubbleProps) {
  if (!text) return null;
  const bg = darkMode ? 'rgba(15,52,96,0.97)' : 'rgba(255,255,255,0.97)';
  const fg = darkMode ? '#e0e0e0' : '#1a1a1a';
  const accent = darkMode ? '#64b5f6' : '#1565c0';

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      maxWidth: '78%', padding: '16px 28px', borderRadius: 18,
      background: bg, color: fg,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)',
      fontSize: 17, lineHeight: 1.7, textAlign: 'center',
      zIndex: 100, backdropFilter: 'blur(12px)',
      border: `1px solid ${darkMode ? 'rgba(100,181,246,0.2)' : 'rgba(21,101,192,0.1)'}`,
      borderLeft: `4px solid ${accent}`,
      animation: 'viewer-fadeIn 0.3s ease-out',
      fontWeight: 450, letterSpacing: '0.01em',
    }}>
      {text}
      <style>{`@keyframes viewer-fadeIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }`}</style>
    </div>
  );
}
