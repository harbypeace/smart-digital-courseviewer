/** Design-token system for the OpenMAIC viewer.
 *  All visual constants live here so components never hardcode colours. */

export interface Theme {
  colors: {
    bg: string;
    bgAlt: string;
    surface: string;
    surfaceHover: string;
    surfaceActive: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    primary: string;
    primaryHover: string;
    primaryGlow: string;
    accent: string;
    accentHover: string;
    border: string;
    borderSubtle: string;
    success: string;
    successBg: string;
    error: string;
    errorBg: string;
    warning: string;
    overlay: string;
    glassBg: string;
    glassBorder: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
    circle: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    glow: string;
    inset: string;
  };
  transitions: {
    fast: string;
    normal: string;
    slow: string;
    spring: string;
  };
  fonts: {
    sans: string;
    mono: string;
  };
}

const shared = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radii: { sm: 6, md: 10, lg: 14, xl: 20, pill: 999, circle: '50%' },
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
    glow: '0 0 15px rgba(99, 102, 241, 0.4)',
    inset: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  },
  transitions: {
    fast: 'all 0.15s cubic-bezier(.4,0,.2,1)',
    normal: 'all 0.25s cubic-bezier(.4,0,.2,1)',
    slow: 'all 0.4s cubic-bezier(.4,0,.2,1)',
    spring: 'all 0.35s cubic-bezier(.34,1.56,.64,1)',
  },
  fonts: {
    sans: "'Inter', 'Noto Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  },
} as const;

const lightTheme: Theme = {
  ...shared,
  colors: {
    bg: '#f8fafc',
    bgAlt: '#f1f5f9',
    surface: '#ffffff',
    surfaceHover: '#f8fafc',
    surfaceActive: '#eef2ff',
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    primaryGlow: 'rgba(99,102,241,0.25)',
    accent: '#06b6d4',
    accentHover: '#0891b2',
    border: '#e2e8f0',
    borderSubtle: '#f1f5f9',
    success: '#10b981',
    successBg: 'rgba(16,185,129,0.08)',
    error: '#ef4444',
    errorBg: 'rgba(239,68,68,0.08)',
    warning: '#f59e0b',
    overlay: 'rgba(15,23,42,0.6)',
    glassBg: 'rgba(255,255,255,0.85)',
    glassBorder: 'rgba(226,232,240,0.6)',
  },
};

const darkTheme: Theme = {
  ...shared,
  colors: {
    bg: '#0f172a',
    bgAlt: '#0b1120',
    surface: '#1e293b',
    surfaceHover: '#253449',
    surfaceActive: '#1e1b4b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    primary: '#818cf8',
    primaryHover: '#6366f1',
    primaryGlow: 'rgba(129,140,248,0.3)',
    accent: '#22d3ee',
    accentHover: '#06b6d4',
    border: '#334155',
    borderSubtle: '#1e293b',
    success: '#34d399',
    successBg: 'rgba(52,211,153,0.12)',
    error: '#f87171',
    errorBg: 'rgba(248,113,113,0.12)',
    warning: '#fbbf24',
    overlay: 'rgba(0,0,0,0.75)',
    glassBg: 'rgba(15,23,42,0.85)',
    glassBorder: 'rgba(51,65,85,0.6)',
  },
};

export function getTheme(darkMode: boolean): Theme {
  return darkMode ? darkTheme : lightTheme;
}
