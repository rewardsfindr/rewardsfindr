// ─────────────────────────────────────────────
// CONTACT SUPPORT FORM
// Subject + concern → in-app success only (no mailto / backend).
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  SUPPORT_SUBJECTS,
  SUPPORT_SUCCESS_COPY,
  canSubmitSupportForm,
  submitSupportForm,
} from '../../lib/contactSupport.js';
import HomeBottomTabBar from '../../components/HomeBottomTabBar.js';
import { ACCOUNT_TAB_INDEX } from '../../components/homeLayout.js';
import { colors, radii } from '../../shared/theme.js';

export default function ContactSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState('');
  const [concern, setConcern] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const valid = canSubmitSupportForm({ subject, concern });
  const subjectError = showErrors && !String(subject).trim();
  const concernError = showErrors && !String(concern).trim();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/account');
  };

  const onSubmit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    const result = submitSupportForm({ subject, concern });
    if (result.ok) setSubmitted(true);
  };

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Contact support</Text>
          <Text style={s.subtitle}>We’re here to help</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={s.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {submitted ? (
          <View style={s.formPad}>
            <View style={s.successCard}>
              <View style={s.successIcon}>
                <Ionicons name="checkmark" size={22} color={colors.successText} />
              </View>
              <Text style={s.successCopy}>{SUPPORT_SUCCESS_COPY}</Text>
            </View>
            <View style={s.spacer} />
            <TouchableOpacity
              style={s.submit}
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={s.submitText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.formPad}>
            <Text style={s.label}>Subject</Text>
            <TouchableOpacity
              style={[s.subjectField, subjectError && s.fieldError]}
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose a topic"
            >
              <Text style={[s.subjectValue, !subject && s.placeholder]}>
                {subject || 'Choose a topic'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            {subjectError ? <Text style={s.errorText}>Pick a subject</Text> : null}

            <Text style={[s.label, s.labelSpaced]}>Your concern</Text>
            <TextInput
              style={[s.concernField, concernError && s.fieldError]}
              value={concern}
              onChangeText={setConcern}
              placeholder="Tell us what happened…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Your concern"
            />
            {concernError ? <Text style={s.errorText}>Add a short description</Text> : null}

            <View style={s.spacer} />
            <TouchableOpacity
              style={[s.submit, !valid && s.submitMuted]}
              onPress={onSubmit}
              accessibilityRole="button"
              accessibilityLabel="Submit"
              accessibilityState={{ disabled: !valid }}
            >
              <Text style={s.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <HomeBottomTabBar selectedIndex={ACCOUNT_TAB_INDEX} />

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={s.overlay}>
          <Pressable style={s.backdrop} onPress={() => setPickerOpen(false)} />
          <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Choose a topic</Text>
            <ScrollView bounces={false}>
              {SUPPORT_SUBJECTS.map((option) => {
                const selected = option === subject;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[s.optionRow, selected && s.optionSelected]}
                    onPress={() => {
                      setSubject(option);
                      setPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={s.optionText}>{option}</Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgHeader },
  header: {
    backgroundColor: colors.bgHeader,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: { paddingVertical: 4, paddingRight: 2 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: colors.textOnDark, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textOnDarkSub, fontSize: 12, marginTop: 2 },
  body: { flex: 1, backgroundColor: colors.bgPage },
  formPad: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  labelSpaced: { marginTop: 12 },
  subjectField: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  subjectValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  placeholder: { fontWeight: '500', color: colors.textMuted },
  concernField: {
    flex: 1,
    minHeight: 160,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  fieldError: { borderColor: colors.error },
  errorText: { fontSize: 11, color: colors.error, marginTop: 6 },
  spacer: { flexGrow: 1, minHeight: 16 },
  submit: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitMuted: { backgroundColor: '#c5d9b8' },
  submitText: { fontWeight: '800', fontSize: 15, color: colors.bgHeader },
  successCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCopy: {
    fontWeight: '700',
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: 260,
  },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(26, 58, 26, 0.55)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: 14,
    paddingTop: 12,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  optionRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionSelected: { backgroundColor: colors.bgPage },
  optionText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, flex: 1, paddingRight: 8 },
});
