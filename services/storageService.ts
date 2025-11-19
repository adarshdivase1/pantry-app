import { PantryItem, Category, Unit, Order } from '../types';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

const ITEMS_KEY = 'pantry_service_items_v2';
const ORDERS_KEY = 'pantry_service_orders_v2';

let supabase: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;

// --- Auto-Initialize from Environment Variables ---
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

// Declare setupRealtime before using it
const setupRealtime = () => {
    if (!supabase) return;
    
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
    }
    
    console.log('🔄 Setting up real-time subscriptions...');
    
    realtimeChannel = supabase
        .channel('db-changes')
        .on(
            'postgres_changes',
            { 
                event: '*', 
                schema: 'public', 
                table: 'pantry_items' 
            },
            (payload) => {
                console.log('📦 Pantry items changed:', payload);
                notifyChange();
            }
        )
        .on(
            'postgres_changes',
            { 
                event: '*', 
                schema: 'public', 
                table: 'orders' 
            },
            (payload) => {
                console.log('🛎️ Orders changed:', payload);
                notifyChange();
            }
        )
        .subscribe((status) => {
            console.log('Real-time subscription status:', status);
            if (status === 'SUBSCRIBED') {
                console.log('✅ Real-time sync is active!');
            }
        });
};

// Initialize Supabase automatically if env vars are present
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    console.log('🔌 Initializing Supabase from environment variables...');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    setupRealtime();
    console.log('✅ Supabase connected successfully!');
  } catch (e) {
    console.error('❌ Failed to initialize Supabase:', e);
  }
} else {
  console.warn('⚠️ No Supabase credentials found. Running in local-only mode.');
}

// Export functions for SettingsModal
export const initSupabase = (config: { url: string; key: string }): boolean => {
  try {
    supabase = createClient(config.url, config.key, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    setupRealtime();
    // Store config in localStorage for persistence
    localStorage.setItem('supabase_config', JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Failed to initialize Supabase:', e);
    return false;
  }
};

export const getSupabaseConfig = (): { url: string; key: string } | null => {
  const stored = localStorage.getItem('supabase_config');
  if (stored) {
    return JSON.parse(stored);
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  }
  return null;
};

export const disconnectSupabase = () => {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
  }
  supabase = null;
  localStorage.removeItem('supabase_config');
};

export const notifyChange = () => {
  console.log('🔔 Broadcasting data update...');
  window.dispatchEvent(new Event('pantry-update'));
};

const isCloud = () => !!supabase;

export const isUsingCloudStorage = () => isCloud();

export const getItems = async (): Promise<PantryItem[]> => {
  if (isCloud()) {
      const { data, error } = await supabase!.from('pantry_items').select('*').order('name');
      if (error) {
          console.error("Supabase error", error);
          return [];
      }
      return data.map((d: any) => ({
          id: d.id,
          name: d.name,
          quantity: d.quantity,
          unit: d.unit,
          category: d.category,
          addedDate: d.added_date,
          expiryDate: d.expiry_date,
          notes: d.notes,
          imageUrl: d.image_url
      })) as PantryItem[];
  } else {
    const data = localStorage.getItem(ITEMS_KEY);
    return data ? JSON.parse(data) : [];
  }
};

export const addOrUpdateItem = async (newItem: Omit<PantryItem, 'id' | 'addedDate'>): Promise<{ success: boolean; message: string }> => {
    const items = await getItems();
    
    const normalizedName = newItem.name.trim().toLowerCase();
    const existingItem = items.find(
        i => i.name.trim().toLowerCase() === normalizedName && i.unit === newItem.unit
    );

    if (isCloud()) {
        if (existingItem) {
            const { error } = await supabase!
                .from('pantry_items')
                .update({ 
                    quantity: existingItem.quantity + newItem.quantity,
                    category: newItem.category !== Category.OTHER ? newItem.category : existingItem.category,
                    expiry_date: newItem.expiryDate
                })
                .eq('id', existingItem.id);
            
            if (error) return { success: false, message: error.message };
            return { success: true, message: `Restocked ${existingItem.name}` };
        } else {
            const { error } = await supabase!
                .from('pantry_items')
                .insert([{
                    name: newItem.name,
                    quantity: newItem.quantity,
                    unit: newItem.unit,
                    category: newItem.category,
                    added_date: new Date().toISOString(),
                    expiry_date: newItem.expiryDate
                }]);
            if (error) return { success: false, message: error.message };
            return { success: true, message: `Added ${newItem.name}` };
        }
    } else {
        if (existingItem) {
            existingItem.quantity += newItem.quantity;
            if (newItem.category !== Category.OTHER) existingItem.category = newItem.category;
            if (newItem.expiryDate) existingItem.expiryDate = newItem.expiryDate;
            
            const updatedItems = items.map(i => i.id === existingItem.id ? existingItem : i);
            localStorage.setItem(ITEMS_KEY, JSON.stringify(updatedItems));
            notifyChange();
            return { success: true, message: `Restocked ${existingItem.name}` };
        } else {
            const item: PantryItem = {
                ...newItem,
                id: crypto.randomUUID(),
                addedDate: new Date().toISOString(),
            };
            items.unshift(item);
            localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
            notifyChange();
            return { success: true, message: `Added new item: ${newItem.name}` };
        }
    }
};

export const deleteItem = async (id: string) => {
    if (isCloud()) {
        const { error } = await supabase!.from('pantry_items').delete().eq('id', id);
        if (error) console.error('Delete error:', error);
    } else {
        const items = await getItems();
        const updated = items.filter(i => i.id !== id);
        localStorage.setItem(ITEMS_KEY, JSON.stringify(updated));
        notifyChange();
    }
};

export const getOrders = async (): Promise<Order[]> => {
  if (isCloud()) {
      const { data, error } = await supabase!.from('orders').select('*').order('timestamp', { ascending: false });
      if (error) {
          console.error("Get orders error:", error);
          return [];
      }
      return data.map((d: any) => ({
          id: d.id,
          roomNumber: d.room_number,
          items: d.items,
          status: d.status,
          timestamp: d.timestamp,
          completedAt: d.completed_at
      })) as Order[];
  } else {
    const data = localStorage.getItem(ORDERS_KEY);
    return data ? JSON.parse(data) : [];
  }
};

export const placeOrder = async (order: Order): Promise<{ success: boolean; error?: string }> => {
    const items = await getItems();

    for (const orderItem of order.items) {
        const item = items.find(i => i.id === orderItem.itemId);
        if (!item) {
            return { success: false, error: `Item ${orderItem.name} no longer exists.` };
        }
        if (item.quantity < orderItem.quantity) {
            return { success: false, error: `Not enough stock for ${item.name}. Only ${item.quantity} left.` };
        }
    }

    if (isCloud()) {
        console.log('📝 Placing order:', order);
        
        const { error: orderError } = await supabase!.from('orders').insert([{
            id: order.id,
            room_number: order.roomNumber,
            items: order.items,
            status: order.status,
            timestamp: order.timestamp
        }]);
        
        if (orderError) {
            console.error('Order insert error:', orderError);
            return { success: false, error: orderError.message };
        }

        for (const orderItem of order.items) {
            const item = items.find(i => i.id === orderItem.itemId);
            if (item) {
                const { error: updateError } = await supabase!.from('pantry_items')
                    .update({ quantity: item.quantity - orderItem.quantity })
                    .eq('id', item.id);
                    
                if (updateError) {
                    console.error('Stock update error:', updateError);
                }
            }
        }
        
        console.log('✅ Order placed successfully!');
        return { success: true };
    } else {
        const orders = await getOrders();
        for (const orderItem of order.items) {
            const item = items.find(i => i.id === orderItem.itemId);
            if (item) item.quantity -= orderItem.quantity;
        }
        orders.unshift(order);
        localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
        localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        notifyChange();
        return { success: true };
    }
};

export const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    const completedAt = (status === 'delivered' || status === 'cancelled') ? new Date().toISOString() : null;
    
    if (isCloud()) {
        console.log(`🔄 Updating order ${orderId} to ${status}`);
        const { error } = await supabase!.from('orders').update({ 
            status, 
            completed_at: completedAt 
        }).eq('id', orderId);
        
        if (error) {
            console.error('Update status error:', error);
        } else {
            console.log('✅ Order status updated!');
        }
    } else {
        const orders = await getOrders();
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            orders[index].status = status;
            if (completedAt) orders[index].completedAt = completedAt;
            localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        }
        notifyChange();
    }
};

export const getLowStockItems = async (threshold = 10): Promise<PantryItem[]> => {
    const items = await getItems();
    return items.filter(i => i.quantity <= threshold && i.quantity > 0);
};

export const seedInitialData = async () => {
    const existing = await getItems();
    if (existing.length > 0) return;
    
    const sampleItems = [
        { name: 'Coffee', quantity: 50, unit: Unit.CUP, category: Category.BEVERAGES, expiryDate: '2025-12-31' },
        { name: 'Tea Bags', quantity: 100, unit: Unit.PIECE, category: Category.BEVERAGES, expiryDate: '2025-12-31' },
        { name: 'Bottled Water', quantity: 75, unit: Unit.BOTTLE, category: Category.BEVERAGES, expiryDate: '2026-01-31' },
        { name: 'Orange Juice', quantity: 30, unit: Unit.BOTTLE, category: Category.BEVERAGES, expiryDate: '2025-01-15' },
        { name: 'Soft Drinks', quantity: 60, unit: Unit.CAN, category: Category.BEVERAGES, expiryDate: '2025-06-30' },
        { name: 'Chocolate Bar', quantity: 40, unit: Unit.PIECE, category: Category.SNACKS, expiryDate: '2025-08-01' },
        { name: 'Potato Chips', quantity: 35, unit: Unit.PACK, category: Category.SNACKS, expiryDate: '2025-07-01' },
        { name: 'Cookies', quantity: 45, unit: Unit.PACK, category: Category.SNACKS, expiryDate: '2025-05-15' },
        { name: 'Nuts Mix', quantity: 25, unit: Unit.PACK, category: Category.SNACKS, expiryDate: '2025-09-01' },
        { name: 'Energy Bar', quantity: 30, unit: Unit.PIECE, category: Category.SNACKS, expiryDate: '2025-10-01' },
        { name: 'Sandwich', quantity: 20, unit: Unit.PIECE, category: Category.FOOD, expiryDate: '2024-11-20' },
        { name: 'Fruit Salad', quantity: 15, unit: Unit.CUP, category: Category.FOOD, expiryDate: '2024-11-20' },
        { name: 'Instant Noodles', quantity: 40, unit: Unit.CUP, category: Category.FOOD, expiryDate: '2025-12-01' },
        { name: 'Notepads', quantity: 50, unit: Unit.PIECE, category: Category.STATIONERY, expiryDate: '2030-01-01' },
        { name: 'Pens', quantity: 100, unit: Unit.PIECE, category: Category.STATIONERY, expiryDate: '2030-01-01' },
        { name: 'Phone Charger', quantity: 15, unit: Unit.PIECE, category: Category.ELECTRONICS, expiryDate: '2030-01-01' },
        { name: 'USB Cable', quantity: 20, unit: Unit.PIECE, category: Category.ELECTRONICS, expiryDate: '2030-01-01' },
    ];

    for (const item of sampleItems) {
        await addOrUpdateItem(item);
    }
    
    console.log('✅ Sample data seeded successfully!');
};
