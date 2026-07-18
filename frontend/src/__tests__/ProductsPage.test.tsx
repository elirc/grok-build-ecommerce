// =============================================================================
// ProductsPage Test Example
// =============================================================================
//
// This demonstrates basic component testing with React Testing Library + Vitest.
// 
// Mid-level focus:
// - Test what the user sees, not implementation details
// - Mock API calls when needed
// - Keep tests fast and reliable
// =============================================================================

import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsPage } from '../features/products/pages/ProductsPage';
import { vi } from 'vitest';

// Mock the API client
vi.mock('../../api/client', () => ({
  fetchProducts: vi.fn().mockResolvedValue({
    data: [{ id: '1', name: 'Test Product', price: 29.99, stock: 10 }]
  })
}));

const queryClient = new QueryClient();

test('renders products from API', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <ProductsPage />
    </QueryClientProvider>
  );

  expect(await screen.findByText('Test Product')).toBeInTheDocument();
});
