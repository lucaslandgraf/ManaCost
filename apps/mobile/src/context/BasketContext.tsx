import React, { createContext, useContext, useState } from 'react';

export interface BasketItem {
  id: string;
  descricao: string;
  valor: number;
  estabelecimento: {
    nome: string;
    endereco: string;
  };
  quantidade: number;
}

interface BasketContextData {
  items: BasketItem[];
  addItem: (item: Omit<BasketItem, 'quantidade'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  clearBasket: () => void;
  totalItems: number;
  totalPrice: number;
}

const BasketContext = createContext<BasketContextData>({} as BasketContextData);

export const BasketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<BasketItem[]>([]);

  const addItem = (newItem: Omit<BasketItem, 'quantidade'>) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === newItem.id);
      if (existing) {
        return prev.map((i) =>
          i.id === newItem.id ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      return [...prev, { ...newItem, quantidade: 1 }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => {
          if (i.id === id) {
            const nextQty = i.quantidade + delta;
            return nextQty > 0 ? { ...i, quantidade: nextQty } : null;
          }
          return i;
        })
        .filter(Boolean) as BasketItem[]
    );
  };

  const clearBasket = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantidade, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.valor * item.quantidade, 0);

  return (
    <BasketContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearBasket,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </BasketContext.Provider>
  );
};

export const useBasket = () => useContext(BasketContext);