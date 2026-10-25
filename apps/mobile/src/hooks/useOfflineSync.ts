import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getOfflineQueue, processOfflineSyncQueue } from '../services/offlineSync';

export function useOfflineSync(onSyncFinished?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = async () => {
    const queue = await getOfflineQueue();
    setPendingCount(queue.length);
  };

  useEffect(() => {
    refreshPendingCount();

    // Listener de mudança de rede
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      // Se acabou de reconectar, processa a fila pendente
      if (online) {
        const result = await processOfflineSyncQueue();
        if (result.syncedCount > 0) {
          await refreshPendingCount();
          if (onSyncFinished) onSyncFinished();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return { isOnline, pendingCount, refreshPendingCount };
}