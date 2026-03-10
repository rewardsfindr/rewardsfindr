// ─────────────────────────────────────────────
// THEME — design tokens for the app
// All colors, radii, and shadows live here.
// ─────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bgPage:        '#e8ede4',
  bgCard:        '#ffffff',
  bgHeader:      '#2d4a2d',
  bgFooter:      '#2d4a2d',

  // Brand
  primary:       '#2d4a2d',
  primaryLight:  '#4a7c4a',
  accent:        '#5a8a5a',

  // Text
  textPrimary:   '#1a1a1a',
  textSecondary: '#4b5563',
  textMuted:     '#6b7280',
  textOnDark:    '#ffffff',
  textOnDarkSub: '#a8c5a8',

  // Banks
  chase:         '#1a3a6b',
  amex:          '#007ac1',
  disabled:      '#9ca3af',
  disabledBg:    '#f3f4f6',

  // States
  error:         '#c00',
  errorBg:       '#fee',
  successBg:     '#d1fae5',
  successText:   '#065f46',

  // Borders
  border:        '#e5e7eb',
  borderFocus:   '#2d4a2d',
};

export const radii = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 999,
};

export const shadow = {
  sm: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,  elevation: 2 },
  md: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  lg: { shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 14, elevation: 5 },
};
