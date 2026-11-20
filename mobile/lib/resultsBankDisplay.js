// Pure bank pill helpers for the results screen (unit-tested).

export const BANK_COLORS = {
  chase:       '#1a3a6b',
  amex:        '#007ac1',
  capital_one: '#c0392b',
  citi:        '#003b8e',
  us_bank:     '#0c2074',
  wells_fargo: '#c0392b',
  bofa:        '#e31837',
  bilt:        '#1a1a1a',
};

const BANK_LABELS = {
  chase: 'CHASE',
  amex: 'AMEX',
  capital_one: 'CAPITAL ONE',
  citi: 'CITI',
  us_bank: 'US BANK',
  wells_fargo: 'WELLS FARGO',
  bofa: 'BOFA',
  bilt: 'BILT',
};

export function bankLabel(bank) {
  if (!bank) return '';
  return BANK_LABELS[bank] || bank.toUpperCase();
}
