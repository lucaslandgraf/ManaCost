import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configuração do comportamento da notificação com a app aberta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

/**
 * Solicita permissões de notificação ao utilizador e configura o canal no Android
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lembretes de Contas',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38BDF8',
    });
  }

  return finalStatus === 'granted';
}

/**
 * Agenda um lembrete para as 09:00 da manhã da data de vencimento da conta
 */
export async function scheduleBillReminder(
  title: string,
  amount: number,
  dueDateStr: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return null;

  // Espera formato AAAA-MM-DD
  const parts = dueDateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  // Agenda para as 09:00 da manhã do dia do vencimento
  const triggerDate = new Date(year, month, day, 9, 0, 0);

  // Não agenda se a data e hora já tiverem passado
  if (triggerDate.getTime() <= Date.now()) return null;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ Conta a Pagar Hoje!',
      body: `${title} - R$ ${amount.toFixed(2)} vence hoje.`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  return notificationId;
}

/**
 * Cancela uma notificação agendada específica pelo identificador
 */
export async function cancelScheduledReminder(notificationId: string | null | undefined): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (err) {
    console.warn('Erro ao cancelar notificação:', err);
  }
}

/**
 * Reagenda alertas para todas as contas abertas que ainda vão vencer.
 * Pode ser invocada ao carregar a lista de contas ou ao iniciar a aplicação.
 */
export async function syncAllPendingBillsReminders(
  bills: Array<{ title: string; amount: number; due_date: string; is_paid: boolean }>
): Promise<void> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Limpa notificações pendentes antigas para evitar duplicados
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const bill of bills) {
    if (!bill.is_paid && bill.due_date) {
      await scheduleBillReminder(bill.title, Number(bill.amount) || 0, bill.due_date);
    }
  }
}