// ─────────────────────────────────────────────
// BANK LOGO ICON
// Branded local logo tiles for each bank.
// No remote URLs — always renders reliably.
// Each bank has its real brand color + wordmark.
// ─────────────────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const BANK_BRAND = {
  chase: {
    bg: '#1a3a6b',
    lines: ['CHASE'],
    textColor: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  amex: {
    bg: '#007ac1',
    lines: ['AMEX'],
    textColor: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  capital_one: {
    bg: '#c0392b',
    lines: ['CAPITAL', 'ONE'],
    textColor: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  citi: {
    bg: '#003b8e',
    lines: ['citi'],
    textColor: '#ffffff',
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 1,
  },
  discover: {
    bg: '#ffffff',
    lines: ['DISC\u25cf VER'],
    textColor: '#231f20',
    fontSize: 9,
    fontWeight: '800',
    border: '#e0e0e0',
  },
  wells_fargo: {
    bg: '#c0392b',
    lines: ['WELLS', 'FARGO'],
    textColor: '#fed700',
    fontSize: 10,
    fontWeight: '900',
  },
  bofa: {
    bg: '#e31837',
    lines: ['BANK OF', 'AMERICA'],
    textColor: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
  },
};

export default function BankLogoIcon({ bankId, size = 44 }) {
  const brand = BANK_BRAND[bankId] || { bg: '#9ca3af', lines: [bankId?.slice(0,2).toUpperCase()], textColor: '#fff', fontSize: 14, fontWeight: '800' };

  return (
    <View style={[
      s.wrap,
      {
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: brand.bg,
        borderWidth: brand.border ? 1 : 0,
        borderColor: brand.border || 'transparent',
      },
    ]}>
      {brand.lines.map((line, i) => (
        <Text
          key={i}
          style={[
            s.text,
            {
              color: brand.textColor,
              fontSize: brand.fontSize,
              fontWeight: brand.fontWeight,
              letterSpacing: brand.letterSpacing || 0,
              lineHeight: brand.fontSize + 3,
            },
          ]}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});
