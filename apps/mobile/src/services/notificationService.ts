import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const CHANNEL_ID = 'bills-reminders';

// Verifica se está rodando no cliente genérico do Expo Go
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Configuração do comportamento da notificação com o app aberto
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as any),
  });
} catch (_) {}

/**
 * Solicita permissões e cria canal se estiver no Android nativo (ignora com segurança no Expo Go)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (Platform.OS === 'android' && !isExpoGo) {
      try {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Lembretes de Contas',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#10B981',
          enableVibrate: true,
          showBadge: true,
        });
      } catch (channelErr) {
        // Silencia em ambientes onde o NotificationChannelManager nativo não estiver instanciado
      }
    }

    return finalStatus === 'granted';
  } catch (error) {
    return false;
  }
}

/**
 * Agenda um lembrete para as 09:00 da manhã da data de vencimento
 */
export async function scheduleBillReminder(
  title: string,
  amount: number,
  dueDateStr: string
): Promise<string | null> {
  try {
    // No Expo Go Android, agendamento nativo com canais costuma falhar
    if (Platform.OS === 'android' && isExpoGo) {
      return null;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return null;

    const parts = dueDateStr.split('-');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const triggerDate = new Date(year, month, day, 9, 0, 0);
    if (triggerDate.getTime() <= Date.now()) return null;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Conta a Pagar Hoje!',
        body: `${title} - R$ ${amount.toFixed(2)} vence hoje.`,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    return notificationId;
  } catch (err) {
    return null;
  }
}

/**
 * Cancela notificação agendada específica
 */
export async function cancelScheduledReminder(notificationId: string | null | undefined): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (_) {}
}

/**
 * Reagenda alertas de todas as contas pendentes
 */
export async function syncAllPendingBillsReminders(
  bills: Array<{ title: string; amount: number; due_date: string; is_paid: boolean }>
): Promise<void> {
  try {
    if (Platform.OS === 'android' && isExpoGo) {
      return;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    for (const bill of bills) {
      if (!bill.is_paid && bill.due_date) {
        await scheduleBillReminder(bill.title, Number(bill.amount) || 0, bill.due_date);
      }
    }
  } catch (_) {}
}