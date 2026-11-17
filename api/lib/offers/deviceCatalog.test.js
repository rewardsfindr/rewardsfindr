import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentOffer } from './offerFreshness.js';
import {
  amexRecords,
  buildSnapshotRecords,
  capitalOneRecords,
  chaseRecords,
  citiRecords,
  filterOffers,
  replaceCardOffers,
  wellsFargoRecords,
} from './deviceCatalog.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');

test('stores a Chase tile under the bank offer id and drops that card on the next snapshot', () => {
  const first = chaseRecords({
    cardName: 'Sapphire Reserve (...0483)',
    cardLast4: '0483',
    gridFound: true,
    tileCount: 1,
    now: NOW,
    rawOffers: [{
      bankOfferId: 'FIGG:1894293',
      tileId: 'carousel_0_FIGG:1894293',
      merchantName: 'Starbucks',
      valueText: '10% cash back',
      daysLeft: '22d left',
      isActivated: false,
    }],
  });
  assert.equal(first.length, 1);
  assert.equal(first[0].id, 'chase_sapphire-reserve-0483_FIGG:1894293');
  assert.equal(first[0].expiryPrecision, 'day-count');
  assert.equal(first[0].cardLast4, '0483');

  const second = chaseRecords({
    cardName: 'Sapphire Reserve (...0483)',
    gridFound: true,
    tileCount: 1,
    now: NOW,
    rawOffers: [{
      bankOfferId: 'FIGG:2',
      merchantName: 'Target',
      valueText: '$5',
      daysLeft: '',
      isActivated: true,
    }],
  });
  const catalog = replaceCardOffers(first, {
    bank: 'chase',
    cardName: 'Sapphire Reserve (...0483)',
    phase: '',
    records: second,
  });
  assert.deepEqual(catalog.map(offer => offer.merchantName), ['Target']);
  assert.equal(catalog[0].expiryPrecision, 'unknown');
});

test('refuses a partial Chase offer response', () => {
  assert.throws(
    () => chaseRecords({
      cardName: 'Freedom Flex (...1111)',
      gridFound: true,
      partial: true,
      tileCount: 1,
      rawOffers: [{
        bankOfferId: 'FIGG:1',
        merchantName: 'Nike',
        valueText: '5%',
      }],
      now: NOW,
    }),
    /partial offer list/
  );
});

test('refuses a Chase snapshot that saw tiles but no offer ids', () => {
  assert.throws(
    () => chaseRecords({
      cardName: 'Freedom Flex (...1111)',
      gridFound: true,
      tileCount: 2,
      rawOffers: [{ merchantName: 'Nike', valueText: '5%' }],
      now: NOW,
    }),
    /Nothing was changed/
  );
});

test('an empty Chase grid clears that card and leaves the other card alone', () => {
  const existing = [
    { id: 'a', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'b', bank: 'chase', cardName: 'Reserve', phase: '', merchantName: 'Target' },
  ];
  const records = chaseRecords({
    cardName: 'Freedom',
    gridFound: true,
    tileCount: 0,
    rawOffers: [],
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'chase',
    cardName: 'Freedom',
    phase: '',
    records,
  });
  assert.deepEqual(next.map(offer => offer.id), ['b']);
});

test('Amex eligible and enrolled rows for one card stay separate', () => {
  const json = {
    recommendedOffers: {
      offersList: {
        page1: [{
          offerType: 'MERCHANT',
          title: 'Whole Foods',
          shortDescription: '$10 back',
          offerId: 'AX1',
          expiration: { text: '04/30/2026' },
        }],
      },
    },
  };
  const eligible = amexRecords({
    cardName: 'Gold (...2001)',
    cardLast4: '2001',
    json,
    phase: 'eligible',
    now: NOW,
  });
  const enrolled = amexRecords({
    cardName: 'Gold (...2001)',
    json: { addedToCard: { offersList: { page1: [] } } },
    phase: 'enrolled',
    now: NOW,
  });
  const catalog = replaceCardOffers(
    replaceCardOffers([], { bank: 'amex', cardName: 'Gold (...2001)', phase: 'eligible', records: eligible }),
    { bank: 'amex', cardName: 'Gold (...2001)', phase: 'enrolled', records: enrolled }
  );
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].bankOfferId, 'AX1');
  assert.equal(catalog[0].phase, 'eligible');
  assert.equal(catalog[0].expiryPrecision, 'date');
  assert.equal(catalog[0].cashbackAmount, 10);
  assert.equal(catalog[0].cashbackType, 'fixed');
});

test('search returns a current prefix match and hides an expired offer', () => {
  const offers = [
    {
      merchantName: 'Starbucks',
      merchantNameLower: 'starbucks',
      expiryPrecision: 'date',
      expiresAt: NOW.getTime() + 86_400_000,
    },
    {
      merchantName: 'Starbucks Reserve',
      merchantNameLower: 'starbucks reserve',
      expiryPrecision: 'date',
      expiresAt: NOW.getTime() - 86_400_000,
    },
    {
      merchantName: 'Target',
      merchantNameLower: 'target',
      expiryPrecision: 'unknown',
      expiresAt: null,
    },
  ];
  const found = filterOffers(offers, 'star', NOW);
  assert.deepEqual(found.map(offer => offer.merchantName), ['Starbucks']);
});

function wellsDealsFixture() {
  return {
    checkSum: 'CHECKSUM-SECRET',
    availableDeals: {
      cardlyticsEligibleDeals: [
        {
          vendorName: 'VENDOR-SECRET',
          multiCardFlag: true,
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'PCTOFFER01',
            merchantName: 'Starbucks',
            dealAmount: 10,
            amountType: '%',
            shortDescription: 'Special offer',
            expirationDate: '2026-06-30',
            endDate: '2026-06-30',
            daysLeft: 20,
            status: 'AVAILABLE',
            longDescription: 'LONG-SECRET',
            imageUrl: 'https://images.example/secret.png',
            checkSum: 'DETAIL-CHECKSUM',
          },
        },
        {
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'DOLLAR0001',
            merchantName: 'Target',
            dealAmount: 5,
            amountType: '$',
            shortDescription: 'Statement credit',
            expirationDate: '04/01/2026',
          },
        },
        {
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'NODATE0001',
            merchantName: 'Uber',
            dealAmount: 2,
            amountType: '$',
            shortDescription: '$2 back',
          },
        },
        {
          isActivated: false,
          merchantDealDetails: {
            merchantName: 'Missing Id',
            dealAmount: 9,
            amountType: '%',
            checkSum: 'NOTANOFFER',
          },
        },
      ],
      activatedDeals: [
        {
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'ACTIVATED1',
            merchantName: 'Nike',
            dealAmount: 15,
            amountType: '%',
            shortDescription: '15% back',
            expirationDate: '2026-08-15T00:00:00.000Z',
          },
        },
        {
          merchantDealDetails: {
            merchantOfferId: 'PCTOFFER01',
            merchantName: 'Starbucks Duplicate',
            dealAmount: 1,
            amountType: '%',
          },
        },
      ],
    },
    earnedDeals: {
      deals: [
        {
          merchantDealDetails: {
            merchantOfferId: 'EARNED0001',
            merchantName: 'Lyft',
            dealAmount: 4,
            amountType: '$',
            shortDescription: '$4 back',
          },
        },
        {
          merchantDealDetails: {
            merchantOfferId: 'NOREWARD01',
            merchantName: 'No Reward Shop',
          },
        },
      ],
    },
    expiredDeals: {
      deals: [
        {
          merchantDealDetails: {
            merchantOfferId: 'EXPIRED001',
            merchantName: 'Old Navy',
            dealAmount: 40,
            amountType: '%',
            shortDescription: 'expired',
          },
        },
      ],
    },
  };
}

test('maps a Wells Fargo getDeals list into one card snapshot', () => {
  const records = wellsFargoRecords({ json: wellsDealsFixture(), now: NOW });
  assert.deepEqual(records.map(offer => offer.merchantName), [
    'Starbucks', 'Target', 'Uber', 'Nike', 'Lyft',
  ]);
  assert.equal(records[0].bank, 'wells_fargo');
  assert.equal(records[0].cardName, 'Wells Fargo');
  assert.equal(records[0].phase, '');
  assert.equal(records[0].bankOfferId, 'PCTOFFER01');
  assert.equal(records[0].id, 'wells_fargo_wells-fargo_PCTOFFER01');
  assert.equal(records[0].offerDescription, 'Special offer');
  assert.equal(records[0].isActivated, false);
  assert.equal(records[0].expiryPrecision, 'date');
  assert.equal(records[0].expiryDate, '2026-06-30T00:00:00.000Z');
  assert.equal(records[1].cashbackAmount, 5);
  assert.equal(records[1].cashbackType, 'fixed');
  assert.equal(records[1].offerDescription, 'Statement credit');
  assert.equal(records[1].expiryDate, '2026-04-01T00:00:00.000Z');
  assert.equal(records[3].isActivated, true);
  assert.equal(records[3].bankOfferId, 'ACTIVATED1');
  assert.equal(records[4].isActivated, true);
  assert.equal(records[4].cashbackAmount, 4);
  const saved = JSON.stringify(records);
  for (const secret of ['CHECKSUM-SECRET', 'DETAIL-CHECKSUM', 'VENDOR-SECRET', 'LONG-SECRET', 'secret.png', 'NOTANOFFER', 'Old Navy', 'No Reward Shop']) {
    assert.equal(saved.includes(secret), false);
  }
});

test('a percent reward and a dollar reward both map', () => {
  const records = wellsFargoRecords({ json: wellsDealsFixture(), now: NOW });
  const percent = records.find(offer => offer.merchantName === 'Starbucks');
  const dollars = records.find(offer => offer.merchantName === 'Target');
  assert.equal(percent.cashbackAmount, 10);
  assert.equal(percent.cashbackType, 'percent');
  assert.equal(dollars.cashbackAmount, 5);
  assert.equal(dollars.cashbackType, 'fixed');
});

test('a Wells Fargo offer with no expiration stays searchable and is not expiring soon', () => {
  const records = wellsFargoRecords({ json: wellsDealsFixture(), now: NOW });
  const uber = records.find(offer => offer.merchantName === 'Uber');
  assert.equal(uber.expiryPrecision, 'unknown');
  assert.equal(uber.expiryDate, null);
  assert.equal(uber.expiresAt, null);
  assert.equal(isCurrentOffer(uber, NOW), true);
  assert.deepEqual(filterOffers(records, 'uber', NOW).map(offer => offer.merchantName), ['Uber']);
});

test('replacing the Wells Fargo card leaves Chase and Amex rows', () => {
  const existing = [
    { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'a', bank: 'amex', cardName: 'Gold', phase: 'eligible', merchantName: 'Whole Foods' },
    { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop' },
  ];
  const records = wellsFargoRecords({
    json: {
      availableDeals: {
        cardlyticsEligibleDeals: [{
          isActivated: false,
          merchantDealDetails: {
            merchantOfferId: 'DOLLAR0001',
            merchantName: 'Target',
            dealAmount: 5,
            amountType: '$',
            shortDescription: 'Statement credit',
            expirationDate: '2026-04-01',
          },
        }],
      },
    },
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'wells_fargo',
    cardName: 'Wells Fargo',
    phase: '',
    records,
  });
  assert.deepEqual(next.map(offer => `${offer.bank}:${offer.merchantName}`), [
    'chase:Nike',
    'amex:Whole Foods',
    'wells_fargo:Target',
  ]);

  const cleared = replaceCardOffers(next, {
    bank: 'wells_fargo',
    cardName: 'Wells Fargo',
    phase: '',
    records: wellsFargoRecords({
      json: { availableDeals: { cardlyticsEligibleDeals: [] } },
      now: NOW,
    }),
  });
  assert.deepEqual(cleared.map(offer => offer.bank), ['chase', 'amex']);
});

test('an unrecognized Wells Fargo body or deals without an offer id are refused before storage is written', () => {
  const storage = {
    value: JSON.stringify([
      { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
      { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop' },
    ]),
  };
  function persist(json) {
    const existing = JSON.parse(storage.value);
    const records = buildSnapshotRecords({
      bank: 'wells_fargo',
      cardName: 'Wells Fargo',
      phase: '',
      json,
    });
    const next = replaceCardOffers(existing, {
      bank: 'wells_fargo',
      cardName: 'Wells Fargo',
      phase: '',
      records,
    });
    storage.value = JSON.stringify(next);
  }

  const before = storage.value;
  assert.throws(
    () => persist({ status: 'error', body: 'do-not-store' }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /Nothing was changed/.test(err.message) && !/do-not-store/.test(err.message)
  );
  assert.throws(
    () => persist({
      availableDeals: {
        cardlyticsEligibleDeals: [{
          merchantDealDetails: {
            merchantName: 'Nike',
            dealAmount: 5,
            amountType: '%',
            checkSum: 'NOTANOFFER',
          },
        }],
      },
    }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /no offer id/.test(err.message) && !/NOTANOFFER/.test(err.message)
  );
  assert.equal(storage.value, before);
});

test('deals that have an offer id and no merchant name are refused and leave stored rows', () => {
  const offerId = 'NAMEDOFFER1';
  const storage = {
    value: JSON.stringify([
      { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
      { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop', bankOfferId: 'OLD0000001' },
    ]),
  };
  function persist(json) {
    const existing = JSON.parse(storage.value);
    const records = buildSnapshotRecords({
      bank: 'wells_fargo',
      cardName: 'Wells Fargo',
      phase: '',
      json,
    });
    const next = replaceCardOffers(existing, {
      bank: 'wells_fargo',
      cardName: 'Wells Fargo',
      phase: '',
      records,
    });
    storage.value = JSON.stringify(next);
  }

  const before = storage.value;
  assert.throws(
    () => persist({
      availableDeals: {
        cardlyticsEligibleDeals: [{
          merchantDealDetails: {
            merchantOfferId: offerId,
            merchantName: '',
            dealAmount: 10,
            amountType: '%',
            shortDescription: '10% cash back',
          },
        }],
      },
    }),
    (err) => err.code === 'SNAPSHOT_REFUSED'
      && /incomplete/.test(err.message)
      && !err.message.includes(offerId)
  );
  assert.equal(storage.value, before);
});

function citiOffersFixture() {
  return {
    selectedCard: {
      displayProductName: 'Citi Strata® Card - 4832',
      cardType: 'CREDIT',
    },
    merchantOffers: [
      {
        displayOffersCategory: 'Featured',
        offers: [
          {
            offerId: '8cfb0cc0-0ba6-41ec-bbd5-c3280862a6e0',
            offerStatus: 'AVAILABLE',
            merchantName: 'CVS',
            offerEndDate: 'Nov 30, 2026',
            offerDiscountType: 'ABSOLUTE',
            offerTitle: '$5 Back',
          },
          {
            offerId: '15d21ca1-170a-4758-b7a3-02220186aeb3',
            offerStatus: 'ENROLLED',
            merchantName: 'Starbucks',
            offerEndDate: 'Nov 30, 2026',
            offerDiscountType: 'ABSOLUTE',
            offerTitle: '$5 Back',
          },
          {
            offerId: 'RN-311510',
            offerStatus: 'AVAILABLE',
            merchantName: 'Tea Monks - Escondido',
            offerEndDate: 'Dec 31, 2026',
            offerDiscountType: 'PERCENTAGE',
            offerTitle: '5% Back',
          },
        ],
      },
      {
        displayOffersCategory: 'Dining',
        offers: [
          {
            offerId: '15d21ca1-170a-4758-b7a3-02220186aeb3',
            offerStatus: 'ENROLLED',
            merchantName: 'Starbucks',
            offerEndDate: 'Nov 30, 2026',
            offerDiscountType: 'ABSOLUTE',
            offerTitle: '$5 Back',
          },
        ],
      },
    ],
  };
}

test('maps a Citi merchantOffers list into one card snapshot and dedupes offerId', () => {
  const records = citiRecords({
    cardName: 'Citi Strata® Card',
    cardLast4: '4832',
    json: citiOffersFixture(),
    now: NOW,
  });
  assert.equal(records.length, 3);
  assert.equal(records[0].bank, 'citi');
  assert.equal(records[0].cardName, 'Citi Strata® Card');
  assert.equal(records[0].phase, '');
  assert.equal(records[0].bankOfferId, '8cfb0cc0-0ba6-41ec-bbd5-c3280862a6e0');
  assert.equal(records[0].cashbackAmount, 5);
  assert.equal(records[0].cashbackType, 'fixed');
  assert.equal(records[0].isActivated, false);
  assert.equal(records[0].expiryDate, '2026-11-30T00:00:00.000Z');
  const enrolled = records.find(offer => offer.merchantName === 'Starbucks');
  assert.equal(enrolled.isActivated, true);
  const percent = records.find(offer => offer.merchantName === 'Tea Monks - Escondido');
  assert.equal(percent.cashbackType, 'percent');
  assert.equal(percent.cashbackAmount, 5);
  assert.equal(records.filter(offer => offer.bankOfferId === '15d21ca1-170a-4758-b7a3-02220186aeb3').length, 1);
});

test('a Citi offer with no end date stays searchable and is not expiring soon', () => {
  const records = citiRecords({
    cardName: 'Citi Strata® Card',
    json: {
      merchantOffers: [{
        displayOffersCategory: 'Featured',
        offers: [{
          offerId: 'NODATE0001',
          offerStatus: 'AVAILABLE',
          merchantName: 'Uber',
          offerDiscountType: 'ABSOLUTE',
          offerTitle: '$2 Back',
        }],
      }],
    },
    now: NOW,
  });
  assert.equal(records[0].expiryPrecision, 'unknown');
  assert.equal(records[0].expiryDate, null);
  assert.equal(isCurrentOffer(records[0], NOW), true);
  assert.deepEqual(filterOffers(records, 'uber', NOW).map(offer => offer.merchantName), ['Uber']);
});

test('replacing the Citi card leaves Chase, Amex, and Wells Fargo rows', () => {
  const existing = [
    { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
    { id: 'a', bank: 'amex', cardName: 'Gold', phase: 'eligible', merchantName: 'Whole Foods' },
    { id: 'w', bank: 'wells_fargo', cardName: 'Wells Fargo', phase: '', merchantName: 'Old Shop' },
    { id: 'ci', bank: 'citi', cardName: 'Citi Strata® Card', phase: '', merchantName: 'Old Citi' },
  ];
  const records = citiRecords({
    cardName: 'Citi Strata® Card',
    json: {
      merchantOffers: [{
        displayOffersCategory: 'Featured',
        offers: [{
          offerId: 'NEWOFFER01',
          offerStatus: 'AVAILABLE',
          merchantName: 'Target',
          offerDiscountType: 'ABSOLUTE',
          offerTitle: '$10 Back',
          offerEndDate: 'Apr 1, 2026',
        }],
      }],
    },
    now: NOW,
  });
  const next = replaceCardOffers(existing, {
    bank: 'citi',
    cardName: 'Citi Strata® Card',
    phase: '',
    records,
  });
  assert.deepEqual(next.map(offer => `${offer.bank}:${offer.merchantName}`), [
    'chase:Nike',
    'amex:Whole Foods',
    'wells_fargo:Old Shop',
    'citi:Target',
  ]);
});

test('an unrecognized Citi body or offers without an offer id are refused before storage is written', () => {
  const storage = {
    value: JSON.stringify([
      { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
      { id: 'ci', bank: 'citi', cardName: 'Citi Strata® Card', phase: '', merchantName: 'Old Citi' },
    ]),
  };
  function persist(json) {
    const existing = JSON.parse(storage.value);
    const records = buildSnapshotRecords({
      bank: 'citi',
      cardName: 'Citi Strata® Card',
      phase: '',
      json,
    });
    const next = replaceCardOffers(existing, {
      bank: 'citi',
      cardName: 'Citi Strata® Card',
      phase: '',
      records,
    });
    storage.value = JSON.stringify(next);
  }

  const before = storage.value;
  assert.throws(
    () => persist({ status: 'error', body: 'do-not-store' }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /Nothing was changed/.test(err.message) && !/do-not-store/.test(err.message)
  );
  assert.throws(
    () => persist({
      merchantOffers: [{
        displayOffersCategory: 'Featured',
        offers: [{
          merchantName: 'Nike',
          offerDiscountType: 'PERCENTAGE',
          offerTitle: '5% Back',
          accountId: 'NOTANOFFER',
        }],
      }],
    }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /no offer id/.test(err.message) && !/NOTANOFFER/.test(err.message)
  );
  assert.equal(storage.value, before);
});

test('an empty Citi merchantOffers payload is refused and leaves stored Citi rows', () => {
  const storage = {
    value: JSON.stringify([
      { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
      { id: 'ci', bank: 'citi', cardName: 'Citi Strata® Card', phase: '', merchantName: 'Old Citi', bankOfferId: 'OLD-CITI-1' },
    ]),
  };
  function persist(json) {
    const existing = JSON.parse(storage.value);
    const records = buildSnapshotRecords({
      bank: 'citi',
      cardName: 'Citi Strata® Card',
      phase: '',
      json,
    });
    const next = replaceCardOffers(existing, {
      bank: 'citi',
      cardName: 'Citi Strata® Card',
      phase: '',
      records,
    });
    storage.value = JSON.stringify(next);
  }

  const before = storage.value;
  assert.throws(
    () => persist({ merchantOffers: [] }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /empty/.test(err.message)
  );
  assert.throws(
    () => persist({
      merchantOffers: [
        { displayOffersCategory: 'Featured', offers: [] },
        { displayOffersCategory: 'Dining', offers: [] },
      ],
    }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /empty/.test(err.message)
  );
  assert.equal(storage.value, before);
  assert.deepEqual(JSON.parse(storage.value).map(offer => `${offer.bank}:${offer.merchantName}`), [
    'chase:Nike',
    'citi:Old Citi',
  ]);
});

test('maps Capital One stripped offers under stable bankOfferId and replaces one card', () => {
  const records = capitalOneRecords({
    json: {
      offers: [
        {
          bankOfferId: 'adidas.com|standard|affiliate',
          merchantName: 'adidas',
          rewardText: 'Up to 15X miles',
          offerSources: ['affiliate'],
          isActivated: false,
        },
        {
          bankOfferId: 'expedia.com|showcase|affiliate',
          merchantName: 'Expedia',
          rewardText: 'Up to 5X miles',
          expiryText: 'Offer ends Dec 31, 2026',
          offerSources: ['affiliate'],
          isActivated: false,
        },
      ],
    },
    now: NOW,
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].bank, 'capital_one');
  assert.equal(records[0].cardName, 'Capital One');
  assert.equal(records[0].cashbackType, 'points');
  assert.equal(records[0].cashbackAmount, 15);
  assert.equal(records[0].isActivated, false);
  assert.equal(records[1].expiryDate, '2026-12-31T00:00:00.000Z');

  const viaBuild = buildSnapshotRecords({
    bank: 'capital_one',
    cardName: 'Capital One',
    phase: '',
    json: { offers: records.map(r => ({
      bankOfferId: r.bankOfferId,
      merchantName: r.merchantName,
      rewardText: r.offerDescription,
      isActivated: false,
    })) },
    now: NOW,
  });
  assert.equal(viaBuild.length, 2);

  const next = replaceCardOffers(
    [
      { id: 'c', bank: 'chase', cardName: 'Freedom', phase: '', merchantName: 'Nike' },
      { id: 'old', bank: 'capital_one', cardName: 'Capital One', phase: '', merchantName: 'Old' },
    ],
    { bank: 'capital_one', cardName: 'Capital One', phase: '', records }
  );
  assert.equal(next.some(o => o.bank === 'chase'), true);
  assert.equal(next.some(o => o.bank === 'capital_one' && o.merchantName === 'Old'), false);
  assert.equal(next.filter(o => o.bank === 'capital_one').length, 2);
});

test('refuses empty or unrecognized Capital One payloads so saved rows stay', () => {
  assert.throws(
    () => capitalOneRecords({ json: null, now: NOW }),
    (err) => err.code === 'SNAPSHOT_REFUSED'
  );
  assert.throws(
    () => capitalOneRecords({ json: { offers: [] }, now: NOW }),
    (err) => err.code === 'SNAPSHOT_REFUSED' && /empty/.test(err.message)
  );
});
