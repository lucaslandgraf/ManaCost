import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { supabase } from '../config/supabase';
import { Alert } from 'react-native';

const formatDateBR = (isoDate?: string | null): string => {
  if (!isoDate) return '—';
  const clean = isoDate.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
};

const translateBucket = (bucket?: string | null): string => {
  switch (bucket) {
    case 'needs':
      return 'Necessidades (50%)';
    case 'wants':
      return 'Desejos (30%)';
    case 'savings':
      return 'Reserva (20%)';
    default:
      return 'Geral';
  }
};

const translateSplit = (split?: string | null, name?: string | null): string => {
  if (!name) return '—';
  switch (split) {
    case 'pending':
      return `Pendente (${name})`;
    case 'settled':
      return `Pago (${name})`;
    case 'gift':
      return `Presente (${name})`;
    default:
      return name;
  }
};

export async function exportFullDataBackup(userId: string) {
  try {
    // 1. Busca todas as tabelas em paralelo
    const [txRes, billsRes, eventsRes, expensesRes, checklistsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('description, amount, type, date, is_settled, split_status, spent_for_name, budget_bucket, categories(name)')
        .eq('user_id', userId)
        .order('date', { ascending: false }),
      supabase
        .from('bills_to_pay')
        .select('title, amount, due_date, is_paid, barcode_or_pix')
        .eq('user_id', userId)
        .order('due_date', { ascending: true }),
      supabase
        .from('budget_events')
        .select('id, title, target_budget, currency, is_archived, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_expenses')
        .select('event_id, amount'),
      supabase
        .from('event_checklists')
        .select('id, event_id, title, description, is_completed')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]);

    const rawTx = txRes.data || [];
    const rawBills = billsRes.data || [];
    const rawEvents = eventsRes.data || [];
    const rawExpenses = expensesRes.data || [];
    const rawChecklists = checklistsRes.data || [];

    // Mapeia o total gasto por cada viagem a partir da tabela 'event_expenses'
    const spentMap: Record<string, number> = {};
    rawExpenses.forEach((exp: any) => {
      spentMap[exp.event_id] = (spentMap[exp.event_id] || 0) + Number(exp.amount || 0);
    });

    // --- ABA 1: LANÇAMENTOS DO EXTRATO ---
    let rowsTx: any[] = [];
    if (rawTx.length > 0) {
      rowsTx = rawTx.map((item: any) => {
        const catObj = Array.isArray(item.categories) ? item.categories[0] : item.categories;
        const catName = catObj?.name || 'Geral';
        const isIncome = item.type === 'income';

        return {
          'Data': formatDateBR(item.date),
          'Tipo': isIncome ? 'Receita' : 'Despesa',
          'Descrição': item.description,
          'Categoria': catName,
          'Teto Orçamentário': translateBucket(item.budget_bucket),
          'Valor (R$)': Number(item.amount) || 0,
          'Situação': item.is_settled ? 'Efetivado' : 'Pendente',
          'Divisão / Responsável': translateSplit(item.split_status, item.spent_for_name),
        };
      });
    } else {
      rowsTx.push({
        'Data': '—',
        'Tipo': '—',
        'Descrição': 'Nenhum lançamento encontrado',
        'Categoria': '—',
        'Teto Orçamentário': '—',
        'Valor (R$)': 0,
        'Situação': '—',
        'Divisão / Responsável': '—',
      });
    }

    // --- ABA 2: CONTAS A PAGAR & BOLETOS ---
    let rowsBills: any[] = [];
    if (rawBills.length > 0) {
      rowsBills = rawBills.map((b: any) => ({
        'Vencimento': formatDateBR(b.due_date),
        'Conta / Boleto': b.title,
        'Valor (R$)': Number(b.amount) || 0,
        'Situação': b.is_paid ? 'PAGA' : 'PENDENTE',
        'Pix / Linha Digitável': b.barcode_or_pix || '—',
      }));
    } else {
      rowsBills.push({
        'Vencimento': '—',
        'Conta / Boleto': 'Nenhuma conta cadastrada',
        'Valor (R$)': 0,
        'Situação': '—',
        'Pix / Linha Digitável': '—',
      });
    }

    // --- ABA 3: VIAGENS, EVENTOS & CHECKLISTS ---
    const rowsEvents: any[] = [];
    if (rawEvents.length > 0) {
      rawEvents.forEach((ev: any) => {
        const itemsOfEvent = rawChecklists.filter((i: any) => i.event_id === ev.id);
        const metaVal = Number(ev.target_budget || 0);
        const gastoVal = Number(spentMap[ev.id] || 0);
        const eventTitle = ev.title || 'Sem título';
        const eventCurrency = ev.currency || 'BRL';

        // Linha Principal do Evento
        rowsEvents.push({
          'Viagem / Evento': eventTitle,
          'Moeda': eventCurrency,
          'Meta (Orçamento)': metaVal,
          'Total Gasto': gastoVal,
          'Item do Checklist': itemsOfEvent.length > 0 ? `— Resumo (${itemsOfEvent.length} itens) —` : '— Sem itens cadastrados —',
          'Estado do Item': ev.is_archived ? 'Viagem Concluída' : 'Em Andamento',
          'Observações / Detalhes': '',
        });

        // Linhas de Itens de Bagagem da Viagem
        itemsOfEvent.forEach((it: any) => {
          rowsEvents.push({
            'Viagem / Evento': `  └ ${eventTitle}`,
            'Moeda': eventCurrency,
            'Meta (Orçamento)': '',
            'Total Gasto': '',
            'Item do Checklist': it.title,
            'Estado do Item': it.is_completed ? '✓ PRONTO' : 'PENDENTE',
            'Observações / Detalhes': it.description || '—',
          });
        });
      });
    } else {
      rowsEvents.push({
        'Viagem / Evento': 'Nenhum evento registado',
        'Moeda': '—',
        'Meta (Orçamento)': 0,
        'Total Gasto': 0,
        'Item do Checklist': '—',
        'Estado do Item': '—',
        'Observações / Detalhes': '—',
      });
    }

    // 2. Cria a pasta de trabalho do Excel
    const workbook = XLSX.utils.book_new();

    const wsTx = XLSX.utils.json_to_sheet(rowsTx);
    wsTx['!cols'] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 32 },
      { wch: 20 },
      { wch: 24 },
      { wch: 16 },
      { wch: 14 },
      { wch: 26 },
    ];

    const wsBills = XLSX.utils.json_to_sheet(rowsBills);
    wsBills['!cols'] = [
      { wch: 14 },
      { wch: 32 },
      { wch: 16 },
      { wch: 14 },
      { wch: 40 },
    ];

    const wsEvents = XLSX.utils.json_to_sheet(rowsEvents);
    wsEvents['!cols'] = [
      { wch: 30 }, // Viagem / Evento
      { wch: 10 }, // Moeda
      { wch: 18 }, // Meta (Orçamento)
      { wch: 16 }, // Total Gasto
      { wch: 34 }, // Item do Checklist
      { wch: 18 }, // Estado do Item
      { wch: 45 }, // Observações / Detalhes
    ];

    XLSX.utils.book_append_sheet(workbook, wsTx, 'Extrato');
    XLSX.utils.book_append_sheet(workbook, wsBills, 'Contas a Pagar');
    XLSX.utils.book_append_sheet(workbook, wsEvents, 'Viagens e Eventos');

    // 3. Grava e exporta
    const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const now = new Date();
    const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `ManaCost_Backup_${dateTag}.xlsx`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Exportar Cópia de Segurança Completa',
        UTI: 'com.microsoft.excel.xlsx',
      });
    } else {
      Alert.alert('Sucesso', `Ficheiro guardado em: ${fileUri}`);
    }
  } catch (err: any) {
    console.error('Erro no backup:', err);
    Alert.alert('Erro no Backup', err.message || 'Falha ao consolidar dados.');
  }
}