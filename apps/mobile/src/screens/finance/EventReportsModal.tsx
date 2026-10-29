import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { supabase } from '../../config/supabase';

interface EventItem {
  id: string;
  name: string;
  budget_target?: number;
  start_date?: string;
  end_date?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  event: EventItem | null;
}

interface EventExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  payer_name?: string | null;
  split_status?: string | null;
}

export const EventReportsModal: React.FC<Props> = ({ visible, onClose, event }) => {
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<EventExpense[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);

  const budgetTarget = Number(event?.budget_target) || 0;
  const remainingBudget = budgetTarget - totalSpent;

  useEffect(() => {
    if (visible && event?.id) {
      fetchEventExpenses();
    }
  }, [visible, event]);

  const fetchEventExpenses = async () => {
    if (!event?.id) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('event_expenses')
        .select('*')
        .eq('event_id', event.id)
        .order('expense_date', { ascending: false });

      if (error) throw error;

      const items: EventExpense[] = (data || []).map((row: any) => ({
        id: row.id,
        description: row.description || 'Gasto avulso',
        amount: Number(row.amount) || 0,
        category: row.category || 'Geral',
        date: row.expense_date || row.date || '',
        payer_name: row.spent_for_name || row.payer_name || 'Eu',
        split_status: row.split_status || 'none',
      }));

      const total = items.reduce((acc, curr) => acc + curr.amount, 0);
      setExpenses(items);
      setTotalSpent(total);
    } catch (err: any) {
      console.warn('Erro ao carregar gastos do evento:', err.message);
      Alert.alert('Erro', 'Não foi possível carregar as despesas do evento.');
    } finally {
      setLoading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!event) return;

    let text = `*RELATÓRIO DE VIAGEM / EVENTO: ${event.name.toUpperCase()}*\n`;
    if (event.start_date) {
      text += `Período: ${event.start_date.split('-').reverse().join('/')} ${event.end_date ? `até ${event.end_date.split('-').reverse().join('/')}` : ''}\n`;
    }
    text += `\nTeto Orçado: R$ ${budgetTarget.toFixed(2)}\n`;
    text += `Total Gasto: R$ ${totalSpent.toFixed(2)}\n`;
    text += `Saldo Disponível: R$ ${remainingBudget.toFixed(2)} (${remainingBudget >= 0 ? 'Dentro do orçamento' : 'Orçamento estourado'})\n\n`;

    if (expenses.length > 0) {
      text += `*Discriminação das Despesas:*\n`;
      expenses.forEach((ex) => {
        const dFormat = ex.date ? ex.date.split('-').reverse().join('/') : '';
        text += `• ${dFormat} | ${ex.description} (${ex.category}): R$ ${ex.amount.toFixed(2)} [${ex.payer_name}]\n`;
      });
    } else {
      text += `Nenhuma despesa lançada nesta viagem.\n`;
    }

    try {
      await Share.share({ message: text });
    } catch (err: any) {
      Alert.alert('Erro ao partilhar', err.message);
    }
  };

  const handleExportExcel = async () => {
    if (!event || expenses.length === 0) {
      Alert.alert('Aviso', 'Não há despesas cadastradas neste evento para exportar.');
      return;
    }

    try {
      const dataRows: any[] = expenses.map((ex) => ({
        'Data': ex.date ? ex.date.split('-').reverse().join('/') : '',
        'Descrição': ex.description,
        'Categoria': ex.category,
        'Valor (R$)': ex.amount,
        'Responsável / Pagador': ex.payer_name,
        'Situação do Acerto': ex.split_status === 'pending' ? 'Pendente' : ex.split_status === 'settled' ? 'Acertado' : 'Próprio / Fechado',
      }));

      dataRows.push(
        { 'Data': '', 'Descrição': '', 'Categoria': '', 'Valor (R$)': '', 'Responsável / Pagador': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'ORÇAMENTO PLANEJADO (TETO)', 'Categoria': '', 'Valor (R$)': budgetTarget, 'Responsável / Pagador': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'TOTAL GASTO REALIZADO', 'Categoria': '', 'Valor (R$)': totalSpent, 'Responsável / Pagador': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'SALDO RESTANTE DA VIAGEM', 'Categoria': '', 'Valor (R$)': remainingBudget, 'Responsável / Pagador': '', 'Situação do Acerto': '' }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 32 },
        { wch: 20 },
        { wch: 18 },
        { wch: 24 },
        { wch: 22 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Prestação de Contas');

      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const safeName = event.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Viagem_${safeName}_${Date.now()}.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Relatório de Viagem - ${event.name}`,
          UTI: 'com.microsoft.excel.xlsx',
        });
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar Excel', err.message);
    }
  };

  const handleExportCSV = async () => {
    if (!event || expenses.length === 0) {
      Alert.alert('Aviso', 'Não há despesas cadastradas neste evento para exportar.');
      return;
    }

    try {
      let csv = '\uFEFFData;Descrição;Categoria;Valor;Responsável / Pagador;Situação do Acerto\n';

      expenses.forEach((ex) => {
        const dFormat = ex.date ? ex.date.split('-').reverse().join('/') : '';
        const vFormat = `R$ ${ex.amount.toFixed(2).replace('.', ',')}`;
        csv += `${dFormat};"${ex.description.replace(/"/g, '""')}";"${ex.category}";"${vFormat}";"${ex.payer_name}";"${ex.split_status || '—'}"\n`;
      });

      csv += `;\n`;
      csv += `RESUMO;"ORÇAMENTO PLANEJADO";;"R$ ${budgetTarget.toFixed(2).replace('.', ',')}";;\n`;
      csv += `RESUMO;"TOTAL GASTO";;"R$ ${totalSpent.toFixed(2).replace('.', ',')}";;\n`;
      csv += `RESUMO;"SALDO RESTANTE";;"R$ ${remainingBudget.toFixed(2).replace('.', ',')}";;\n`;

      const safeName = event.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Viagem_${safeName}_${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Relatório CSV - ${event.name}`,
          UTI: 'public.comma-separated-values-text',
        });
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar CSV', err.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="bar-chart-2" size={15} color="#38BDF8" />
                <Text style={styles.title} numberOfLines={1}>
                  {event?.name || 'Relatório de Viagem'}
                </Text>
              </View>
              <Text style={styles.sub}>Fecho e prestação de contas do orçamento isolado</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 30 }}
          >
            {loading ? (
              <ActivityIndicator size="large" color="#10B981" style={{ marginVertical: 32 }} />
            ) : (
              <>
                <View style={styles.budgetOverviewCard}>
                  <View style={styles.budgetCol}>
                    <Text style={styles.budgetLabel}>ORÇAMENTO TETO</Text>
                    <Text style={[styles.budgetVal, { color: '#38BDF8' }]}>
                      R$ {budgetTarget.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.budgetDivider} />
                  <View style={styles.budgetCol}>
                    <Text style={styles.budgetLabel}>TOTAL GASTO</Text>
                    <Text style={[styles.budgetVal, { color: '#F87171' }]}>
                      R$ {totalSpent.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.budgetDivider} />
                  <View style={styles.budgetCol}>
                    <Text style={styles.budgetLabel}>SALDO</Text>
                    <Text
                      style={[
                        styles.budgetVal,
                        { color: remainingBudget >= 0 ? '#34D399' : '#F59E0B' },
                      ]}
                    >
                      R$ {remainingBudget.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sectionLabel}>
                  Despesas da Viagem ({expenses.length} lançamentos)
                </Text>

                {expenses.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma despesa vinculada a este evento.</Text>
                ) : (
                  expenses.slice(0, 6).map((ex) => (
                    <View key={ex.id} style={styles.expenseItemRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.expenseDesc} numberOfLines={1}>{ex.description}</Text>
                        <Text style={styles.expenseSub}>
                          {ex.category} • {ex.date ? ex.date.split('-').reverse().join('/') : ''} • Por: {ex.payer_name}
                        </Text>
                      </View>
                      <Text style={styles.expenseVal}>- R$ {ex.amount.toFixed(2)}</Text>
                    </View>
                  ))
                )}

                {expenses.length > 6 && (
                  <Text style={styles.moreItemsText}>
                    + {expenses.length - 6} outras despesas incluídas na exportação completa.
                  </Text>
                )}

                <View style={styles.actionsColumn}>
                  <TouchableOpacity
                    style={styles.btnExcel}
                    onPress={handleExportExcel}
                    activeOpacity={0.8}
                  >
                    <Feather name="file-text" size={14} color="#0B0F19" style={{ marginRight: 6 }} />
                    <Text style={styles.btnExcelText}>Exportar Planilha Excel (.xlsx)</Text>
                  </TouchableOpacity>

                  <View style={styles.secondaryRow}>
                    <TouchableOpacity
                      style={styles.btnWhatsApp}
                      onPress={handleShareWhatsApp}
                      activeOpacity={0.7}
                    >
                      <Feather name="share-2" size={12} color="#38BDF8" style={{ marginRight: 6 }} />
                      <Text style={styles.btnWhatsAppText}>Partilhar Texto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnCSV}
                      onPress={handleExportCSV}
                      activeOpacity={0.7}
                    >
                      <Feather name="download" size={12} color="#F8FAFC" style={{ marginRight: 6 }} />
                      <Text style={styles.btnCSVText}>Exportar CSV</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={styles.closeModalBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.closeModalBtnText}>Concluído</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  dragHandleBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.3 },
  sub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetOverviewCard: {
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  budgetCol: { flex: 1, alignItems: 'center' },
  budgetDivider: { width: 1, height: 24, backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  budgetLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 },
  budgetVal: { fontSize: 13, fontWeight: '800' },
  sectionLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 8,
  },
  expenseItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  expenseDesc: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  expenseSub: { color: '#64748B', fontSize: 10, marginTop: 1 },
  expenseVal: { color: '#F87171', fontSize: 12, fontWeight: '700' },
  moreItemsText: { color: '#64748B', fontSize: 11, textAlign: 'center', marginVertical: 6 },
  emptyText: { color: '#64748B', fontSize: 11, textAlign: 'center', marginVertical: 14 },
  actionsColumn: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  btnExcel: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnExcelText: { color: '#0B0F19', fontWeight: '800', fontSize: 13 },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnWhatsApp: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnWhatsAppText: { color: '#38BDF8', fontWeight: '700', fontSize: 12 },
  btnCSV: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  btnCSVText: { color: '#F8FAFC', fontWeight: '600', fontSize: 12 },
  closeModalBtn: {
    backgroundColor: '#131927',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeModalBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 12 },
});