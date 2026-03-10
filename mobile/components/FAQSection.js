// ─────────────────────────────────────────────
// FAQ SECTION + FOOTER
// Collapsible accordion FAQ items.
// Dark green footer with tagline + contact.
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { colors, radii } from '../shared/theme.js';
import { FAQ_ITEMS } from '../shared/constants.js';

function FAQItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity style={s.item} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
      <View style={s.itemHeader}>
        <Text style={s.question}>{item.q}</Text>
        <Text style={s.chevron}>{open ? '▲' : '▼'}</Text>
      </View>
      {open && <Text style={s.answer}>{item.a}</Text>}
    </TouchableOpacity>
  );
}

export default function FAQSection() {
  return (
    <View>
      <View style={s.faqWrap}>
        <Text style={s.faqTitle}>Frequently Asked Questions</Text>
        {FAQ_ITEMS.map((item, i) => <FAQItem key={i} item={item} />)}
      </View>

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerTagline}>RewardsFindr – Find the best credit card rewards for any store</Text>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:hello@rewardsfindr.com')}>
          <Text style={s.footerEmail}>hello@rewardsfindr.com</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  faqWrap:       { paddingHorizontal: 16, paddingBottom: 24 },
  faqTitle:      { fontSize: 18, fontWeight: '800', color: colors.textPrimary,
                   textAlign: 'center', marginBottom: 16 },
  item:          { backgroundColor: colors.bgCard, borderRadius: radii.md,
                   padding: 14, marginBottom: 8 },
  itemHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  question:      { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: 8 },
  chevron:       { fontSize: 10, color: colors.textMuted },
  answer:        { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: 8 },
  footer:        { backgroundColor: colors.bgFooter, padding: 24, alignItems: 'center', gap: 8 },
  footerTagline: { fontSize: 13, color: colors.textOnDark, textAlign: 'center', fontWeight: '500', lineHeight: 20 },
  footerEmail:   { fontSize: 13, color: colors.textOnDarkSub },
});
