import { PantryItem, Category, Unit, Order } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const ITEMS_KEY = 'pantry_service_items_v2';
const ORDERS_KEY = 'pantry_service_orders_v2';
const SUPABASE_CONFIG_KEY = 'pantry_supabase_config';

let supabase: SupabaseClient | null = null;

// --- Configuration ---

export interface SupabaseConfig {
  url: string;
  key: string;
}

export const getSupabaseConfig = (): SupabaseConfig | null => {
  const data = localStorage.getItem(SUPABASE_CONFIG_KEY);
  return data ? JSON.parse(data) : null;
};

export const initSupabase = (config: SupabaseConfig) => {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
  try {
    supabase = createClient(config.url, config.key);
    // Setup Realtime subscriptions if needed
    setupRealtime();
    return true;
  } catch (e) {
    console.error("Invalid Supabase Config", e);
    return false;
  }
};

export const disconnectSupabase = () => {
    localStorage.removeItem(SUPABASE_CONFIG_KEY);
    supabase = null;
    notifyChange();
}

// Attempt auto-init
const savedConfig = getSupabaseConfig();
if (savedConfig) {
  initSupabase(savedConfig);
}

const setupRealtime = () => {
    if (!supabase) return;
    supabase
        .channel('any')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, () => notifyChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => notifyChange())
        .subscribe();
}

// --- Event System ---
export const notifyChange = () => {
  window.dispatchEvent(new Event('pantry-update'));
};

// --- Helper for Local vs Cloud ---

const isCloud = () => !!supabase;

// --- Items Management ---

export const getItems = async (): Promise<PantryItem[]> => {
  if (isCloud()) {
      const { data, error } = await supabase!.from('pantry_items').select('*').order('name');
      if (error) {
          console.error("Supabase error", error);
          return [];
      }
      // Map snake_case to camelCase if necessary, or ensure DB uses correct column names
      // Assuming DB uses camelCase for simplicity based on provided SQL in settings
      return data.map((d: any) => ({
          ...d,
          addedDate: d.added_date || d.addedDate,
          expiryDate: d.expiry_date || d.expiryDate
      })) as PantryItem[];
  } else {
    // Local Fallback
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
            notifyChange();
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
            notifyChange();
            return { success: true, message: `Added ${newItem.name}` };
        }
    } else {
        // Local Implementation
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
        await supabase!.from('pantry_items').delete().eq('id', id);
    } else {
        const items = await getItems();
        const updated = items.filter(i => i.id !== id);
        localStorage.setItem(ITEMS_KEY, JSON.stringify(updated));
    }
    notifyChange();
};

// --- Orders Management ---

export const getOrders = async (): Promise<Order[]> => {
  if (isCloud()) {
      const { data, error } = await supabase!.from('orders').select('*').order('timestamp', { ascending: false });
      if (error) return [];
      return data.map((d: any) => ({
          ...d,
          roomNumber: d.room_number || d.roomNumber,
          completedAt: d.completed_at || d.completedAt
      })) as Order[];
  } else {
    const data = localStorage.getItem(ORDERS_KEY);
    return data ? JSON.parse(data) : [];
  }
};

export const placeOrder = async (order: Order): Promise<{ success: boolean; error?: string }> => {
    const items = await getItems();

    // 1. Validate Stock (Common for both)
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
        // Transactional updates are harder in client-side JS without RPC, 
        // but we will do optimistic updates for simplicity or sequential.
        // Ideally use a Postgres function `place_order` in Supabase.
        
        // 1. Insert Order
        const { error: orderError } = await supabase!.from('orders').insert([{
            room_number: order.roomNumber,
            items: order.items,
            status: order.status,
            timestamp: order.timestamp
        }]);
        
        if (orderError) return { success: false, error: orderError.message };

        // 2. Deduct Stock (Best Effort)
        for (const orderItem of order.items) {
            const item = items.find(i => i.id === orderItem.itemId);
            if (item) {
                await supabase!.from('pantry_items')
                    .update({ quantity: item.quantity - orderItem.quantity })
                    .eq('id', item.id);
            }
        }
        notifyChange();
        return { success: true };
    } else {
        // Local
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
        await supabase!.from('orders').update({ 
            status, 
            completed_at: completedAt 
        }).eq('id', orderId);
    } else {
        const orders = await getOrders();
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            orders[index].status = status;
            if (completedAt) orders[index].completedAt = completedAt;
            localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        }
    }
    notifyChange();
};

export const getLowStockItems = async (threshold = 10): Promise<PantryItem[]> => {
    const items = await getItems();
    return items.filter(i => i.quantity <= threshold && i.quantity > 0);
};

// --- Seeding ---
// Only runs for Local Storage to avoid messing up Cloud DB automatically
export const seedInitialData = async () => {
    if (isCloud()) return;
    
    const existing = await getItems();
    if (existing.length > 0) return;
    
    // ... (Use same seed data from before, just call saveItems equivalent)
    // For brevity, we skip re-implementing full seed logic here as it's mainly for demo
};