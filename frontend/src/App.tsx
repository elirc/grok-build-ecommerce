// =============================================================================
// APP.TSX - E-commerce Frontend Root
// =============================================================================
//
// Uses TanStack Query for server state management.
// Feature-based routing for products and orders.
//
// This setup demonstrates clean separation between data fetching and UI.
// =============================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProductsPage } from './features/products/pages/ProductsPage';
import { OrdersPage } from './features/orders/pages/OrdersPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b px-6 py-4">
          <div className="max-w-6xl mx-auto flex gap-6">
            <a href="/" className="font-semibold">E-commerce</a>
            <a href="/products" className="hover:underline">Products</a>
            <a href="/orders" className="hover:underline">Orders</a>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<ProductsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
