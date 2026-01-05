import { findBestStoreMatch, buildResultsForCategory } from '../searchUtils';

describe('findBestStoreMatch', () => {
  const storeCategories = {
    'whole foods': 'grocery',
    'starbucks': 'dining'
  };
  const storeNames = ['Whole Foods', 'Starbucks'];

  test('returns exact key match', () => {
    expect(findBestStoreMatch('whole foods', storeCategories, storeNames))
      .toBe('whole foods');
  });

  test('matches by startsWith', () => {
    expect(findBestStoreMatch('Starb', storeCategories, storeNames))
      .toBe('starbucks');
  });

  test('matches by contains', () => {
    expect(findBestStoreMatch('bucks', storeCategories, storeNames))
      .toBe('starbucks');
  });

  test('returns null when no match', () => {
    expect(findBestStoreMatch('xyz', storeCategories, storeNames))
      .toBeNull();
  });
});

describe('buildResultsForCategory', () => {
  const cards = [
    {
      id: '1',
      cardName: 'Card A',
      categoryRates: { grocery: 3, default: 1 }
    },
    {
      id: '2',
      cardName: 'Card B',
      categoryRates: { grocery: 5, default: 1 }
    }
  ];

  test('computes rate and sorts descending', () => {
    const results = buildResultsForCategory(cards, 'grocery');
    expect(results[0].cardName).toBe('Card B');
    expect(results[0].rate).toBe(5);
    expect(results[1].cardName).toBe('Card A');
    expect(results[1].rate).toBe(3);
  });

  test('falls back to default rate', () => {
    const results = buildResultsForCategory(cards, 'dining');
    expect(results[0].rate).toBe(1);
    expect(results[1].rate).toBe(1);
  });
});
