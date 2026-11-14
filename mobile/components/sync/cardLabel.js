export const parseCardLabel = (label) => {
  if (!label) return { cardName: null, cardLast4: null };
  const match = label.match(/^(.+?)\s*\(\.\.\.([\w\d]+)\)\s*$/);
  if (match) return { cardName: match[1].trim(), cardLast4: match[2] };
  return { cardName: label.trim(), cardLast4: null };
};
