import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BasketProduct {
  id: string;
  display_name: string;
  min_price: number;
  image_url: string | null;
  cheapest_store: string;
}

interface BasketContextData {
  items: BasketProduct[];
  addItem: (product: BasketProduct) => void;
  removeItem: (id: string) => void;
  clearBasket: () => void;
  isInBasket: (id: string) => boolean;
}

const STORAGE_KEY = '@manacost_basket_items';

const BasketContext = createContext<BasketContextData>({} as BasketContextData);

export const BasketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<BasketProduct[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          setItems(JSON.parse(data));
        } catch {
          setItems([]);
        }
      }
    });
  }, []);

  const saveItems = async (newItems: BasketProduct[]) => {
    setItems(newItems);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
  };

  const addItem = (product: BasketProduct) => {
    if (!items.some((i) => i.id === product.id)) {
      saveItems([...items, product]);
    }
  };

  const removeItem = (id: string) => {
    saveItems(items.filter((i) => i.id !== id));
  };

  const clearBasket = () => {
    saveItems([]);
  };

  const isInBasket = (id: string) => items.some((i) => i.id === id);

  return (
    <BasketContext.Provider value={{ items, addItem, removeItem, clearBasket, isInBasket }}>
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);