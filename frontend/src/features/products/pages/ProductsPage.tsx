// =============================================================================
// PRODUCTS PAGE
// =============================================================================
//
// Main customer-facing product listing.
//
// Educational focus:
// - Uses TanStack Query for data fetching
// - Clean separation: data logic in api layer
// - Ready for filters, search, pagination in later phases
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { fetchProducts } from '../../api/client';

export function ProductsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  });

  if (isLoading) return <div>Loading products...</div>;
  if (error) return <div>Error loading products</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.data?.map((product: any) => (
          <div key={product.id} className="border bg-white p-4 rounded">
            <h3 className="font-semibold">{product.name}</h3>
            <p>${product.price}</p>
            <p className="text-sm text-gray-500">Stock: {product.stock}</p>
            <button className="mt-2 bg-blue-600 text-white px-3 py-1 rounded text-sm">
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
