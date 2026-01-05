import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Mock firebase/firestore and ./firebase
jest.mock('../firebase', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => {
  const collection = jest.fn();
  const getDocs = jest.fn();

  // simple fake data
  const cards = [
    {
      id: '1',
      cardName: 'Test Card',
      issuer: 'Test Bank',
      categoryRates: { grocery: 5, default: 1 }
    }
  ];
  const stores = [
    {
      storeName: 'Whole Foods',
      category: 'grocery'
    }
  ];

  getDocs.mockImplementation((colRef) => {
    const path = colRef._path?.segments?.[0] || ''; // CRA jest hack
    if (path === 'cards') {
      return Promise.resolve({
        docs: cards.map(c => ({ id: c.id, data: () => c }))
      });
    }
    if (path === 'stores') {
      return Promise.resolve({
        docs: stores.map(s => ({ id: s.storeName, data: () => s }))
      });
    }
    return Promise.resolve({ docs: [] });
  });

  return {
    collection: (...args) => ({ _path: { segments: [args[1]] } }),
    getDocs
  };
});

test('renders best card for Whole Foods search', async () => {
  render(<App />);

  // wait for loading to finish
  await waitFor(() =>
    expect(screen.queryByText(/Connecting to Firebase/i)).not.toBeInTheDocument()
  );

  const input = screen.getByPlaceholderText(/Search for any store/i);
  fireEvent.change(input, { target: { value: 'Whole Foods' } });

  const button = screen.getByRole('button', { name: '' }); // search icon button
  fireEvent.click(button);

  await waitFor(() =>
    expect(screen.getByText(/Best Cards for Whole Foods/i)).toBeInTheDocument()
  );
  expect(screen.getByText(/Test Card/i)).toBeInTheDocument();
});
