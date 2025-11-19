import { PantryItem, Category, Unit, Order } from '../types';

const ITEMS_KEY = 'pantry_service_items_v2';
const ORDERS_KEY = 'pantry_service_orders_v2';

// --- Event System for Real-time feel ---
export const notifyChange = () => {
  window.dispatchEvent(new Event('pantry-update'));
};

// --- Items (Menu) Management ---

export const getItems = (): PantryItem[] => {
  try {
    const data = localStorage.getItem(ITEMS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load items", e);
    return [];
  }
};

export const saveItems = (items: PantryItem[]) => {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  notifyChange();
};

// SMART ADD: Merges duplicates or adds new
export const addOrUpdateItem = (newItem: Omit<PantryItem, 'id' | 'addedDate'>): { success: true; message: string } => {
    const items = getItems();
    
    // Normalize name for comparison (trim, lowercase)
    const normalizedName = newItem.name.trim().toLowerCase();
    const existingItemIndex = items.findIndex(
        i => i.name.trim().toLowerCase() === normalizedName && i.unit === newItem.unit
    );

    if (existingItemIndex >= 0) {
        // Item exists: Update quantity and refresh properties if provided
        const existing = items[existingItemIndex];
        existing.quantity += newItem.quantity;
        
        // Update metadata if it's "fresher" or changed
        if (newItem.category !== Category.OTHER) existing.category = newItem.category;
        if (newItem.expiryDate) existing.expiryDate = newItem.expiryDate;
        
        items[existingItemIndex] = existing;
        saveItems(items);
        return { success: true, message: `Restocked ${existing.name}. New Quantity: ${existing.quantity}` };
    } else {
        // New Item: Create fresh entry
        const item: PantryItem = {
            ...newItem,
            id: crypto.randomUUID(),
            addedDate: new Date().toISOString(),
        };
        items.unshift(item); // Add to top
        saveItems(items);
        return { success: true, message: `Added new item: ${newItem.name}` };
    }
};

export const getLowStockItems = (threshold = 10): PantryItem[] => {
    const items = getItems();
    return items.filter(i => i.quantity <= threshold && i.quantity > 0);
};

// --- Orders Management ---

export const getOrders = (): Order[] => {
  try {
    const data = localStorage.getItem(ORDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

// Transactional Order Placement
export const placeOrder = (order: Order): { success: boolean; error?: string } => {
    const items = getItems();
    const orders = getOrders();

    // 1. Validate Stock
    for (const orderItem of order.items) {
        const item = items.find(i => i.id === orderItem.itemId);
        if (!item) {
            return { success: false, error: `Item ${orderItem.name} no longer exists.` };
        }
        if (item.quantity < orderItem.quantity) {
            return { success: false, error: `Not enough stock for ${item.name}. Only ${item.quantity} left.` };
        }
    }

    // 2. Deduct Stock
    for (const orderItem of order.items) {
        const item = items.find(i => i.id === orderItem.itemId);
        if (item) {
            item.quantity -= orderItem.quantity;
        }
    }

    // 3. Save Data
    orders.unshift(order); // Add to top
    
    try {
        localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
        localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
        notifyChange();
        return { success: true };
    } catch (e) {
        return { success: false, error: "Storage error. Please try again." };
    }
};

export const updateOrderStatus = (orderId: string, status: Order['status']) => {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === orderId);
  if (index !== -1) {
    orders[index].status = status;
    if (status === 'delivered' || status === 'cancelled') {
      orders[index].completedAt = new Date().toISOString();
    }
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    notifyChange();
  }
};

// --- Seeding ---

const daysFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
};

export const seedInitialData = (): PantryItem[] => {
  const existing = getItems();
  if (existing.length > 0) return existing;

  const initial: PantryItem[] = [
    // Hot Beverages
    { id: 'b1', name: 'Fresh Brewed Coffee', quantity: 100, unit: Unit.CUP, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(7) },
    { id: 'b2', name: 'Decaf Coffee', quantity: 50, unit: Unit.CUP, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(7) },
    { id: 'b3', name: 'English Breakfast Tea', quantity: 100, unit: Unit.CUP, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(365) },
    { id: 'b4', name: 'Green Tea', quantity: 100, unit: Unit.CUP, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(365) },
    { id: 'b5', name: 'Earl Grey Tea', quantity: 25, unit: Unit.CUP, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(365) },
    { id: 'b6', name: 'Hot Chocolate', quantity: 15, unit: Unit.CUP, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(180) },

    // Cold Beverages
    { id: 'cb1', name: 'Still Water (500ml)', quantity: 48, unit: Unit.BOTTLE, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(365) },
    { id: 'cb2', name: 'Sparkling Water (330ml)', quantity: 8, unit: Unit.CAN, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(365) },
    { id: 'cb3', name: 'Coca Cola', quantity: 24, unit: Unit.CAN, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(180) },
    { id: 'cb4', name: 'Diet Coke', quantity: 24, unit: Unit.CAN, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(180) },
    { id: 'cb5', name: 'Orange Juice', quantity: 5, unit: 'jug', category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(7) },
    { id: 'cb6', name: 'Iced Coffee', quantity: 20, unit: Unit.BOTTLE, category: Category.BEVERAGES, addedDate: new Date().toISOString(), expiryDate: daysFromNow(14) },

    // Snacks - Biscuits & Cookies
    { id: 's1', name: 'Digestive Biscuits', quantity: 50, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(60) },
    { id: 's2', name: 'Custard Creams', quantity: 8, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(60) },
    { id: 's3', name: 'Chocolate Chip Cookies', quantity: 30, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(45) },
    { id: 's4', name: 'Shortbread', quantity: 25, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(90) },
    { id: 's5', name: 'Lotus Biscoff', quantity: 100, unit: Unit.PIECE, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(120) },

    // Snacks - Savory & Healthy
    { id: 'h1', name: 'Salted Peanuts', quantity: 20, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(90) },
    { id: 'h2', name: 'Cashew Nuts', quantity: 5, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(90) },
    { id: 'h3', name: 'Potato Chips (Sea Salt)', quantity: 20, unit: Unit.PACK, category: Category.SNACKS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(60) },
    { id: 'h4', name: 'Fruit Bowl (Mixed)', quantity: 3, unit: Unit.PLATE, category: Category.FOOD, addedDate: new Date().toISOString(), expiryDate: daysFromNow(2) },

    // Food
    { id: 'f1', name: 'Club Sandwiches', quantity: 10, unit: Unit.PLATE, category: Category.FOOD, addedDate: new Date().toISOString(), expiryDate: daysFromNow(1) },
    { id: 'f2', name: 'Vegetarian Wraps', quantity: 10, unit: Unit.PLATE, category: Category.FOOD, addedDate: new Date().toISOString(), expiryDate: daysFromNow(1) },
    { id: 'f3', name: 'Butter Croissants', quantity: 12, unit: Unit.PIECE, category: Category.FOOD, addedDate: new Date().toISOString(), expiryDate: daysFromNow(1) },
    
    // Stationery & Supplies
    { id: 'st1', name: 'Notepad (A4)', quantity: 20, unit: Unit.PIECE, category: Category.STATIONERY, addedDate: new Date().toISOString(), expiryDate: daysFromNow(999) },
    { id: 'st2', name: 'Ballpoint Pen (Blue)', quantity: 15, unit: Unit.PIECE, category: Category.STATIONERY, addedDate: new Date().toISOString(), expiryDate: daysFromNow(999) },
    { id: 'st3', name: 'Whiteboard Markers', quantity: 5, unit: 'set', category: Category.STATIONERY, addedDate: new Date().toISOString(), expiryDate: daysFromNow(999) },
    
    // Electronics / Cables
    { id: 'e1', name: 'HDMI Adapter', quantity: 2, unit: Unit.PIECE, category: Category.ELECTRONICS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(999) },
    { id: 'e2', name: 'Phone Charger (USB-C)', quantity: 3, unit: Unit.PIECE, category: Category.ELECTRONICS, addedDate: new Date().toISOString(), expiryDate: daysFromNow(999) },
    
    // Other
    { id: 'o1', name: 'Napkins', quantity: 100, unit: Unit.PACK, category: Category.OTHER, addedDate: new Date().toISOString(), expiryDate: daysFromNow(999) },
    { id: 'o2', name: 'Hand Sanitizer', quantity: 8, unit: Unit.BOTTLE, category: Category.OTHER, addedDate: new Date().toISOString(), expiryDate: daysFromNow(700) },
  ];

  saveItems(initial);
  return initial;
};