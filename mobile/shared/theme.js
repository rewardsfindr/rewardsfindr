// ─────────────────────────────────────────────
// THEME — design tokens for the app
// All colors, radii, and shadows live here.
// Brand palette based on US dollar bill green.
// ─────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bgPage:        '#f0f7ee',  // very light dollar-green tint
  bgCard:        '#ffffff',
  bgHeader:      '#1a3a1a',  // deep dollar bill dark green
  bgFooter:      '#1a3a1a',

  // Brand — dollar bill green palette
  primary:       '#1a3a1a',  // dark header green
  primaryLight:  '#85bb65',  // dollar bill green (main accent)
  accent:        '#6aaa45',  // slightly deeper accent

  // Text
  textPrimary:   '#1a1a1a',
  textSecondary: '#4b5563',
  textMuted:     '#6b7280',
  textOnDark:    '#ffffff',
  textOnDarkSub: '#b8d4a8',

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
  borderFocus:   '#85bb65',
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
