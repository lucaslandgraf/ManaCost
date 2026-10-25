import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../config/supabase';

const QUEUE_STORAGE_KEY = '@manacost_offline_queue_v1';

export interface PendingAction {
  id: string; // uuid temporário
  table: 'transactions' | 'event_expenses';
  payload: any;
  created_at: string;
}

// 1. Verificar se há conexão ativa com a internet
export const checkIsOnline = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
};

// 2. Recuperar itens pendentes da fila
export const getOfflineQueue = async (): Promise<PendingAction[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// 3. Adicionar uma ação à fila offline
export const enqueueOfflineAction = async (
  table: 'transactions' | 'event_expenses',
  payload: any
): Promise<PendingAction> => {
  const queue = await getOfflineQueue();
  const newItem: PendingAction = {
    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    table,
    payload,
    created_at: new Date().toISOString(),
  };

  queue.push(newItem);
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  return newItem;
};

// 4. Executar e esvaziar a sincronização com o Supabase
export const processOfflineSyncQueue = async (
  onItemSynced?: (action: PendingAction) => void
): Promise<{ syncedCount: number; errorsCount: number }> => {
  const isOnline = await checkIsOnline();
  if (!isOnline) return { syncedCount: 0, errorsCount: 0 };

  const queue = await getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0, errorsCount: 0 };

  const remainingQueue: PendingAction[] = [];
  let syncedCount = 0;
  let errorsCount = 0;

  for (const item of queue) {
    try {
      const { error } = await supabase.from(item.table).insert([item.payload]);
      if (error) throw error;

      syncedCount++;
      if (onItemSynced) onItemSynced(item);
    } catch (err) {
      console.warn(`[SyncQueue] Erro ao sincronizar item ${item.id}:`, err);
      // Se deu erro real (e não de duplicidade), mantém na fila para tentar depois
      remainingQueue.push(item);
      errorsCount++;
    }
  }

  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));
  return { syncedCount, errorsCount };
};