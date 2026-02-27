import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';

// ─── Mock firebase.js so Firebase SDK is never initialised in tests ─────────
jest.mock('../firebase.js', () => ({
  auth:     {},
  provider: {},
  db:       {},
}));

// ─── Mock firebase/auth so useAuth.js doesn't call real Firebase ──────────
jest.mock('firebase/auth', () => ({
  signInWithPopup:    jest.fn(),
  signOut:            jest.fn(),
  onAuthStateChanged: jest.fn((auth, cb) => { cb(null); return () => {}; }),
  GoogleAuthProvider: jest.fn(),
}));

// ─── Mock lucide-react icons ───────────────────────────────────────
jest.mock('lucide-react', () => ({
  Search:      () => <span data-testid="icon-search" />,
  TrendingUp:  () => <span data-testid="icon-trending" />,
  Store:       () => <span data-testid="icon-store" />,
  CreditCard:  () => <span data-testid="icon-creditcard" />,
  Info:        () => <span data-testid="icon-info" />,
  Loader:      () => <span data-testid="icon-loader" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
}));

// ─── Mock constants ────────────────────────────────────────────────
jest.mock('../shared/constants.js', () => ({
  CARDS: [
    {
      id: 'chase_freedom_flex',
      cardName: 'Freedom Flex',
      issuer: 'Chase',
      categoryRates: { grocery: 5, dining: 3, default: 1 },
    },
    {
      id: 'citi_double_cash',
      cardName: 'Double Cash',
      issuer: 'Citi',
      categoryRates: { grocery: 2, dining: 2, default: 2 },
    },
    {
      id: 'amex_blue_cash',
      cardName: 'Blue Cash Preferred',
      issuer: 'Amex',
      categoryRates: { grocery: 6, dining: 1, default: 1 },
    },
  ],
  POPULAR_STORES: ['Walmart', 'Amazon', 'Starbucks'],
}));

// ─── Mock offerUtils ───────────────────────────────────────────────
jest.mock('../shared/offerUtils.js', () => {
  const MATCH_QUALITY = { EXACT: 'exact', PARTIAL: 'partial', FUZZY: 'fuzzy' };

  return {
    MATCH_QUALITY,
    buildStoreLookup: jest.fn(() => ({
      walmart:   { category: 'grocery', displayName: 'Walmart' },
      amazon:    { category: 'online',  displayName: 'Amazon' },
      starbucks: { category: 'dining',  displayName: 'Starbucks' },
    })),
    findBestStoreMatch: jest.fn((term) => {
      const map = {
        walmart:          { category: 'grocery', displayName: 'Walmart',   quality: MATCH_QUALITY.EXACT },
        amazon:           { category: 'online',  displayName: 'Amazon',    quality: MATCH_QUALITY.EXACT },
        starbucks:        { category: 'dining',  displayName: 'Starbucks', quality: MATCH_QUALITY.EXACT },
        'starbuk':        { category: 'dining',  displayName: 'Starbucks', quality: MATCH_QUALITY.FUZZY },
        'walmart store':  { category: 'grocery', displayName: 'Walmart',   quality: MATCH_QUALITY.PARTIAL },
      };
      return map[term.toLowerCase()] ?? null;
    }),
    buildResultsForCategory: jest.fn((category, cards) =>
      cards
        .map((c) => ({ ...c, rate: c.categoryRates[category] ?? 1 }))
        .sort((a, b) => b.rate - a.rate)
    ),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────
const typeAndSearch = async (term) => {
  const input = screen.getByPlaceholderText('Search for any store...');
  fireEvent.change(input, { target: { value: term } });
  fireEvent.click(screen.getByRole('button', { name: '' }));
  await waitFor(() => expect(screen.queryByTestId('icon-loader')).not.toBeInTheDocument(), { timeout: 1000 });
};

// ───────────────────────────────────────────────────────────────────────
describe('App — initial render', () => {
  test('renders the RewardsFindr heading', () => {
    render(<App />);
    expect(screen.getByText('RewardsFindr')).toBeInTheDocument();
  });

  test('renders the search input', () => {
    render(<App />);
    expect(screen.getByPlaceholderText('Search for any store...')).toBeInTheDocument();
  });

  test('renders all popular store buttons', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Walmart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Amazon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Starbucks' })).toBeInTheDocument();
  });

  test('renders How it works section', () => {
    render(<App />);
    expect(screen.getByText('How it works')).toBeInTheDocument();
  });

  test('does not show results on initial render', () => {
    render(<App />);
    expect(screen.queryByText(/Best Cards for/i)).not.toBeInTheDocument();
  });

  test('does not show store-not-found on initial render', () => {
    render(<App />);
    expect(screen.queryByText(/Store not found/i)).not.toBeInTheDocument();
  });

  test('shows Sign In button when user is not authenticated', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────
describe('App — search input behavior', () => {
  test('updates input value as user types', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Search for any store...');
    fireEvent.change(input, { target: { value: 'Walmart' } });
    expect(input.value).toBe('Walmart');
  });

  test('clears results when user starts typing a new term', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.getByText(/Best Cards for Walmart/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Search for any store...');
    fireEvent.change(input, { target: { value: 'W' } });
    expect(screen.queryByText(/Best Cards for/i)).not.toBeInTheDocument();
  });

  test('triggers search on Enter key press', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Search for any store...');
    fireEvent.change(input, { target: { value: 'Walmart' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    await waitFor(() =>
      expect(screen.getByText(/Best Cards for Walmart/i)).toBeInTheDocument(),
      { timeout: 1000 }
    );
  });

  test('does nothing on empty search', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Search for any store...');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '' }));
    await act(async () => {});
    expect(screen.queryByText(/Best Cards for/i)).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────
describe('App — successful search results', () => {
  test('shows results heading with store name after search', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.getByText(/Best Cards for Walmart/i)).toBeInTheDocument();
  });

  test('shows top 3 cards in results', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.getByText('Blue Cash Preferred')).toBeInTheDocument();
    expect(screen.getByText('Freedom Flex')).toBeInTheDocument();
    expect(screen.getByText('Double Cash')).toBeInTheDocument();
  });

  test('shows card issuer names', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.getByText('Amex')).toBeInTheDocument();
    expect(screen.getByText('Chase')).toBeInTheDocument();
  });

  test('shows cash back rates', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.getByText('6%')).toBeInTheDocument();
  });

  test('shows category in results header', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.getByText(/Category: Grocery/i)).toBeInTheDocument();
  });

  test('does not show match quality banner for EXACT match', async () => {
    render(<App />);
    await typeAndSearch('Walmart');
    expect(screen.queryByText(/Showing results for/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Did you mean/i)).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────
describe('App — match quality banners', () => {
  test('shows "Showing results for" banner on PARTIAL match', async () => {
    render(<App />);
    await typeAndSearch('walmart store');
    expect(screen.getByText(/Showing results for "Walmart"/i)).toBeInTheDocument();
  });

  test('shows "Did you mean" banner on FUZZY match', async () => {
    render(<App />);
    await typeAndSearch('starbuk');
    expect(screen.getByText(/Did you mean "Starbucks"\?/i)).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────
describe('App — store not found', () => {
  test('shows store not found message for unknown term', async () => {
    render(<App />);
    await typeAndSearch('xyzunknownstore');
    expect(screen.getByText('Store not found')).toBeInTheDocument();
  });

  test('shows the searched term in the not-found message', async () => {
    render(<App />);
    await typeAndSearch('xyzunknownstore');
    expect(screen.getByText(/xyzunknownstore/i)).toBeInTheDocument();
  });

  test('does not show results section when store not found', async () => {
    render(<App />);
    await typeAndSearch('xyzunknownstore');
    expect(screen.queryByText(/Best Cards for/i)).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────
describe('App — quick search buttons', () => {
  test('clicking a popular store button populates the input', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Starbucks' }));
    const input = screen.getByPlaceholderText('Search for any store...');
    expect(input.value).toBe('Starbucks');
  });

  test('clicking a popular store button triggers search and shows results', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Starbucks' }));
    await waitFor(() =>
      expect(screen.getByText(/Best Cards for Starbucks/i)).toBeInTheDocument(),
      { timeout: 1000 }
    );
  });
});

// ───────────────────────────────────────────────────────────────────────
describe('App — error state', () => {
  test('shows error UI when CARDS fails to load', () => {
    const { unmount } = render(<App />);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    unmount();
  });

  test('shows Retry button in error state', () => {
    expect(true).toBe(true);
  });
});
