import React, { useState, useEffect } from 'react';
import { getOrders } from '../services/storageService';
import { Order } from '../types';
import { Clock, CheckCircle, Loader2, XCircle, Package } from 'lucide-react';

interface ShoppingListProps {
  // No specific props needed
}

const ShoppingList: React.FC<ShoppingListProps> = () => {
  const [orders, setOrders] = useState<Order[]>([]);

  const refreshOrders = async () => {
      console.log('🔄 Refreshing guest orders...');
      const all = await getOrders();
      setOrders(all);
      console.log(`📋 Loaded ${all.length} orders for guest view`);
  };

  useEffect(() => {
    refreshOrders();
    
    // Listen for real-time updates
    const handleUpdate = () => {
        console.log('🔔 Guest orders received update notification');
        refreshOrders();
    };
    
    window.addEventListener('pantry-update', handleUpdate);
    
    return () => {
        window.removeEventListener('pantry-update', handleUpdate);
    };
  }, []);

  const getStatusIcon = (status: string) => {
      switch(status) {
          case 'pending': return <Clock className="w-5 h-5 text-amber-500" />;
          case 'preparing': return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
          case 'delivered': return <CheckCircle className="w-5 h-5 text-green-500" />;
          default: return <XCircle className="w-5 h-5 text-slate-400" />;
      }
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'pending': return 'border-l-amber-400 bg-amber-50/30';
          case 'preparing': return 'border-l-blue-400 bg-blue-50/30';
          case 'delivered': return 'border-l-green-400 bg-green-50/30';
          default: return 'border-l-slate-300 bg-slate-50/30';
      }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full">
       <header>
            <h1 className="text-2xl font-bold text-slate-800">My Orders</h1>
            <p className="text-slate-500">Track the status of your service requests • Live Updates Active</p>
      </header>

      <div className="space-y-4">
        {orders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">You haven't placed any orders yet.</p>
                <p className="text-sm text-slate-400 mt-2">Browse the Service Menu to get started!</p>
            </div>
        ) : (
            orders.map(order => (
                <div key={order.id} className={`bg-white p-6 rounded-2xl border-l-4 ${getStatusColor(order.status)} border-t border-r border-b border-slate-100 shadow-sm transition-all hover:shadow-md`}>
                    <div className="flex justify-between items-start mb-4 border-b border-slate-50 pb-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                {getStatusIcon(order.status)}
                                <span className="font-bold text-slate-800 capitalize text-lg">{order.status}</span>
                            </div>
                            <p className="text-xs text-slate-400">
                                Order #{order.id.slice(0, 8)} • Room {order.roomNumber}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-sm text-slate-600 font-medium">
                                {new Date(order.timestamp).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                            {order.completedAt && (
                                <p className="text-xs text-slate-400 mt-1">
                                    Completed at {new Date(order.completedAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm bg-slate-50 rounded-lg p-3">
                                <div className="flex items-center gap-3">
                                    <span className="bg-slate-200 text-slate-700 font-bold text-xs w-6 h-6 rounded flex items-center justify-center">
                                        {item.quantity}
                                    </span>
                                    <span className="text-slate-700 font-medium">{item.name}</span>
                                </div>
                                <span className="text-slate-400 text-xs">{item.unit}</span>
                            </div>
                        ))}
                    </div>
                    
                    {order.status === 'preparing' && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-sm text-blue-600 font-medium flex items-center">
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Your order is being prepared...
                            </p>
                        </div>
                    )}
                    
                    {order.status === 'delivered' && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-sm text-green-600 font-medium flex items-center">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Order delivered successfully!
                            </p>
                        </div>
                    )}
                </div>
            ))
        )}
      </div>
    </div>
  );
};

export default ShoppingList;
