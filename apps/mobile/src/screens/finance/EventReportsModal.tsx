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
      // Ajuste o nome da tabela/coluna se estiver usando 'event_expenses' ou 'transactions' com 'event_id'
      const { data, error } = await supabase
        .from('event_expenses')
        .select('*')
        .eq('event_id', event.id)
        .order('date', { ascending: false });

      if (error) throw error;

      const items: EventExpense[] = (data || []).map((row: any) => ({
        id: row.id,
        description: row.description || 'Gasto avulso',
        amount: Number(row.amount) || 0,
        category: row.category || 'Geral',
        date: row.date || '',
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

    let text = `✈️ *RELATÓRIO DE VIAGEM / EVENTO: ${event.name.toUpperCase()}*\n`;
    if (event.start_date) {
      text += `🗓️ Período: ${event.start_date.split('-').reverse().join('/')} ${event.end_date ? `até ${event.end_date.split('-').reverse().join('/')}` : ''}\n`;
    }
    text += `\n🎯 *Teto Orçado:* R$ ${budgetTarget.toFixed(2)}\n`;
    text += `💸 *Total Gasto:* R$ ${totalSpent.toFixed(2)}\n`;
    text += `📊 *Saldo Disponível:* R$ ${remainingBudget.toFixed(2)} (${remainingBudget >= 0 ? 'Dentro do orçamento' : 'Orçamento estourado'})\n\n`;

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
      Alert.alert('Erro ao compartilhar', err.message);
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

      // Bloco de Totais Consolidados no rodapé
      dataRows.push(
        { 'Data': '', 'Descrição': '', 'Categoria': '', 'Valor (R$)': '', 'Responsável / Pagador': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'ORÇAMENTO PLANEJADO (TETO)', 'Categoria': '', 'Valor (R$)': budgetTarget, 'Responsável / Pagador': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'TOTAL GASTO REALIZADO', 'Categoria': '', 'Valor (R$)': totalSpent, 'Responsável / Pagador': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'SALDO RESTANTE DA VIAGEM', 'Categoria': '', 'Valor (R$)': remainingBudget, 'Responsável / Pagador': '', 'Situação do Acerto': '' }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);

      worksheet['!cols'] = [
        { wch: 14 }, // Data
        { wch: 32 }, // Descrição
        { wch: 20 }, // Categoria
        { wch: 18 }, // Valor
        { wch: 24 }, // Responsável
        { wch: 22 }, // Situação do Acerto
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
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                📊 {event?.name || 'Relatório de Viagem'}
              </Text>
              <Text style={styles.sub}>Fechamento e prestação de contas do orçamento isolado</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
          >
            {loading ? (
              <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 30 }} />
            ) : (
              <>
                {/* Resumo do Orçamento Isolado */}
                <View style={styles.budgetOverviewCard}>
                  <View style={styles.budgetCol}>
                    <Text style={styles.budgetLabel}>Orçamento Estipulado</Text>
                    <Text style={[styles.budgetVal, { color: '#38BDF8' }]}>
                      R$ {budgetTarget.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.budgetCol}>
                    <Text style={styles.budgetLabel}>Total Gasto</Text>
                    <Text style={[styles.budgetVal, { color: '#EF4444' }]}>
                      R$ {totalSpent.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.budgetCol}>
                    <Text style={styles.budgetLabel}>Saldo</Text>
                    <Text
                      style={[
                        styles.budgetVal,
                        { color: remainingBudget >= 0 ? '#10B981' : '#F59E0B' },
                      ]}
                    >
                      R$ {remainingBudget.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Lista rápida de itens */}
                <Text style={styles.sectionLabel}>
                  Despesas da Viagem ({expenses.length} itens)
                </Text>
                {expenses.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma despesa vinculada a este evento.</Text>
                ) : (
                  expenses.slice(0, 6).map((ex) => (
                    <View key={ex.id} style={styles.expenseItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.expenseDesc}>{ex.description}</Text>
                        <Text style={styles.expenseSub}>
                          {ex.category} • {ex.date ? ex.date.split('-').reverse().join('/') : ''} • Por: {ex.payer_name}
                        </Text>
                      </View>
                      <Text style={styles.expenseVal}>R$ {ex.amount.toFixed(2)}</Text>
                    </View>
                  ))
                )}
                {expenses.length > 6 && (
                  <Text style={styles.moreItemsText}>
                    + {expenses.length - 6} outras despesas incluídas na exportação completa.
                  </Text>
                )}

                {/* Ações de Exportação */}
                <View style={styles.actionsColumn}>
                  <TouchableOpacity
                    style={styles.btnExcel}
                    onPress={handleExportExcel}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnExcelText}>📊 Exportar Planilha Excel (.xlsx)</Text>
                  </TouchableOpacity>

                  <View style={styles.secondaryRow}>
                    <TouchableOpacity
                      style={styles.btnWhatsApp}
                      onPress={handleShareWhatsApp}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnWhatsAppText}>💬 WhatsApp / Texto</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnCSV}
                      onPress={handleExportCSV}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnCSVText}>📄 Exportar CSV</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
                  <Text style={styles.closeModalBtnText}>Fechar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
          <View style={styles.bottomBarBarrier} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  bottomBarBarrier: {
    height: Platform.OS === 'android' ? 68 : 0,
    backgroundColor: '#1E293B',
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: 'bold', color: '#F8FAFC' },
  sub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  closeBtn: { padding: 4 },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  budgetOverviewCard: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  budgetCol: { flex: 1, alignItems: 'center' },
  budgetLabel: { color: '#94A3B8', fontSize: 10, marginBottom: 4 },
  budgetVal: { fontSize: 13, fontWeight: 'bold' },
  sectionLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
  },
  expenseItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  expenseDesc: { color: '#F8FAFC', fontSize: 13, fontWeight: '500' },
  expenseSub: { color: '#64748B', fontSize: 10, marginTop: 2 },
  expenseVal: { color: '#EF4444', fontSize: 13, fontWeight: 'bold' },
  moreItemsText: { color: '#64748B', fontSize: 11, textAlign: 'center', marginVertical: 6 },
  emptyText: { color: '#64748B', fontSize: 12, textAlign: 'center', marginVertical: 14 },
  actionsColumn: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  btnExcel: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnExcelText: { color: '#0F172A', fontWeight: 'bold', fontSize: 13 },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnWhatsApp: {
    flex: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnWhatsAppText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 12 },
  btnCSV: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCSVText: { color: '#F8FAFC', fontWeight: '600', fontSize: 12 },
  closeModalBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeModalBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});