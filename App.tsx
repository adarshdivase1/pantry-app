import React, { useState, useEffect } from 'react';
import { View, PantryItem } from './types';
import { getItems, saveItems, seedInitialData, addOrUpdateItem } from './services/storageService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard'; // Order Queue (Staff)
import Inventory from './components/Inventory'; // Catalog (Room) or Menu Manager (Staff)
import ShoppingList from './components/ShoppingList'; // Order History (Room)
import AddItemModal from './components/AddItemModal';

const App: React.FC = () => {
  // Role State: 'room' (default) or 'staff'
  const [isStaff, setIsStaff] = useState(false);
  
  const [currentView, setCurrentView] = useState<View>('inventory');
  const [items, setItems] = useState<PantryItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Initial load
  useEffect(() => {
    const data = seedInitialData();
    setItems(data);
    
    if (isStaff) setCurrentView('dashboard');
    else setCurrentView('inventory');
  }, [isStaff]);

  // Real-time Synchronization
  useEffect(() => {
    const handleStorageChange = () => {
      console.log("Refreshing data from storage...");
      setItems(getItems());
    };

    // Listen for local changes (same tab)
    window.addEventListener('pantry-update', handleStorageChange);
    
    // Listen for cross-tab changes
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('pantry-update', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleAddItem = (newItem: Omit<PantryItem, 'id' | 'addedDate'>) => {
    // Use the new smart service that handles deduplication
    const result = addOrUpdateItem(newItem);
    
    // Refresh UI immediately (though event listener will also catch it)
    setItems(getItems());
    
    if (result.success) {
        // Optional: Show a toast notification here
        console.log(result.message);
    }
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('Delete this item from the menu?')) {
      const updated = items.filter(i => i.id !== id);
      saveItems(updated);
    }
  };

  const renderView = () => {
    switch (currentView) {
      // Staff Views
      case 'dashboard':
        return <Dashboard />;
      // Shared Views (Inventory acts as Catalog for Room, Menu for Staff)
      case 'inventory':
        return <Inventory items={items} isStaff={isStaff} onDelete={handleDeleteItem} />;
      // Room Views
      case 'orders':
        return <ShoppingList />;
      default:
        return <Inventory items={items} isStaff={isStaff} onDelete={handleDeleteItem} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans">
      <Sidebar 
        currentView={currentView} 
        setView={setCurrentView} 
        onAddClick={() => setIsAddModalOpen(true)}
        isStaff={isStaff}
        toggleRole={() => setIsStaff(!isStaff)}
      />
      
      <main className="flex-1 overflow-y-auto h-full relative">
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full h-full flex flex-col">
          {renderView()}
        </div>
      </main>

      <AddItemModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={handleAddItem} 
      />
    </div>
  );
};

export default App;