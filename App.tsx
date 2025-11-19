import React, { useState, useEffect } from 'react';
import { View, PantryItem } from './types';
import { getItems, seedInitialData, addOrUpdateItem, deleteItem } from './services/storageService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import ShoppingList from './components/ShoppingList';
import AddItemModal from './components/AddItemModal';

const App: React.FC = () => {
  const [isStaff, setIsStaff] = useState(false);
  const [currentView, setCurrentView] = useState<View>('inventory');
  const [items, setItems] = useState<PantryItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadItems = async () => {
      const data = await getItems();
      setItems(data);
      setIsLoading(false);
  };

  useEffect(() => {
    seedInitialData();
    loadItems();
    
    if (isStaff) setCurrentView('dashboard');
    else setCurrentView('inventory');
  }, [isStaff]);

  useEffect(() => {
    const handleStorageChange = () => {
      console.log("Refreshing data...");
      loadItems();
    };

    window.addEventListener('pantry-update', handleStorageChange);
    
    return () => {
      window.removeEventListener('pantry-update', handleStorageChange);
    };
  }, []);

  const handleAddItem = async (newItem: Omit<PantryItem, 'id' | 'addedDate'>) => {
    const result = await addOrUpdateItem(newItem);
    if (result.success) {
        loadItems();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (window.confirm('Delete this item from the menu?')) {
      await deleteItem(id);
      loadItems();
    }
  };

  const renderView = () => {
    if (isLoading) return <div className="h-full flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <Inventory items={items} isStaff={isStaff} onDelete={handleDeleteItem} />;
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
