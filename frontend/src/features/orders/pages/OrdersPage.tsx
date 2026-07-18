// =============================================================================
// ORDERS PAGE
// =============================================================================
//
// Simple order history view.
//
// Shows how to fetch and display order data using TanStack Query.
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { fetchOrders } from '../../api/client';

export function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
  });

  if (isLoading) return <div>Loading orders...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Your Orders</h1>
      <div className="space-y-4">
        {data?.data?.length > 0 ? (
          data.data.map((order: any) => (
            <div key={order.id} className="border bg-white p-4 rounded">
              <div>Order #{order.id}</div>
              <div>Status: {order.status}</div>
              <div>Total: ${order.total}</div>
            </div>
          ))
        ) : (
          <p>No orders yet.</p>
        )}
      </div>
    </div>
  );
}
