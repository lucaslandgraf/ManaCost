import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { NewTransactionModal } from './NewTransactionModal';
import { ScannerScreen } from './ScannerScreen';
import { PurchaseDetailsModal } from './PurchaseDetailsModal';
import { DealsScreen } from './DealsScreen';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  is_settled: boolean;
  categories?: { name: string; rule_group: string } | null;
}

export const DashboardScreen = () => {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [dealsModalVisible, setDealsModalVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const { user, signOut } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  // Controlo de Mês de Competência
  const [currentDate, setCurrentDate] = useState(new Date());

  // Totais financeiros
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  // Totais da regra 50/30/20
  const [spentNeeds, setSpentNeeds] = useState(0);
  const [spentWants, setSpentWants] = useState(0);
  const [spentSavings, setSpentSavings] = useState(0);

  const getMonthDateRange = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
    return { startDate, endDate };
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const formatMonthTitle = (date: Date) => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const fetchTransactions = async () => {
    setLoading(true);
    const { startDate, endDate } = getMonthDateRange(currentDate);

    const { data } = await supabase
      .from('transactions')
      .select('id, description, amount, type, date, is_settled, categories(name, rule_group)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (data) {
      setTransactions(data as unknown as Transaction[]);
      calculateMetrics(data as unknown as Transaction[]);
    } else {
      setTransactions([]);
      calculateMetrics([]);
    }
    setLoading(false);
  };

  const calculateMetrics = (items: Transaction[]) => {
    let income = 0;
    let expense = 0;
    let needs = 0;
    let wants = 0;
    let savings = 0;

    items.forEach((item) => {
      const val = Number(item.amount);
      if (item.type === 'income') {
        income += val;
      } else {
        expense += val;
        const rule = item.categories?.rule_group;
        if (rule === 'needs_50') needs += val;
        else if (rule === 'wants_30') wants += val;
        else if (rule === 'savings_20') savings += val;
      }
    });

    setTotalIncome(income);
    setTotalExpense(expense);
    setSpentNeeds(needs);
    setSpentWants(wants);
    setSpentSavings(savings);
  };

  // Alterna o estado de liquidação (Pendente <-> Liquidado)
  const toggleSettled = async (item: Transaction) => {
    try {
      const updatedStatus = !item.is_settled;
      const { error } = await supabase
        .from('transactions')
        .update({ is_settled: updatedStatus })
        .eq('id', item.id);

      if (error) throw error;

      setTransactions((prev) =>
        prev.map((tx) => (tx.id === item.id ? { ...tx, is_settled: updatedStatus } : tx))
      );
    } catch (err) {
      console.error('Erro ao alternar estado de liquidação:', err);
      Alert.alert('Erro', 'Não foi possível atualizar o estado do lançamento.');
    }
  };

  // Apaga a transação com confirmação
  const deleteTransaction = (item: Transaction) => {
    Alert.alert(
      'Apagar Lançamento',
      `Tem a certeza de que deseja remover "${item.description}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', item.id);

              if (error) throw error;

              const remaining = transactions.filter((tx) => tx.id !== item.id);
              setTransactions(remaining);
              calculateMetrics(remaining);
            } catch (err) {
              console.error('Erro ao apagar lançamento:', err);
              Alert.alert('Erro', 'Não foi possível remover o lançamento.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    fetchTransactions();
  }, [currentDate]);

  const budgetNeeds = totalIncome * 0.5;
  const budgetWants = totalIncome * 0.3;
  const budgetSavings = totalIncome * 0.2;

  const renderProgressBar = (spent: number, budget: number, color: string) => {
    const ratio = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    return (
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${ratio}%`, backgroundColor: color }]} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>ManaCost</Text>
          <Text style={styles.subText}>{user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Seletor de Mês de Competência */}
      <View style={styles.monthSelector}>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => changeMonth(-1)}>
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{formatMonthTitle(currentDate)}</Text>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => changeMonth(1)}>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Resumo Financeiro */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Receitas</Text>
          <Text style={[styles.summaryVal, { color: '#10B981' }]}>
            R$ {totalIncome.toFixed(2)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>Despesas</Text>
          <Text style={[styles.summaryVal, { color: '#EF4444' }]}>
            R$ {totalExpense.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Regra 50/30/20 */}
      <View style={styles.budgetCard}>
        <Text style={styles.budgetTitle}>Orçamento Proporcional (50/30/20)</Text>

        <View style={styles.budgetItem}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Necessidades (50%)</Text>
            <Text style={styles.budgetValue}>R$ {spentNeeds.toFixed(2)} / R$ {budgetNeeds.toFixed(2)}</Text>
          </View>
          {renderProgressBar(spentNeeds, budgetNeeds, '#38BDF8')}
        </View>

        <View style={styles.budgetItem}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Desejos (30%)</Text>
            <Text style={styles.budgetValue}>R$ {spentWants.toFixed(2)} / R$ {budgetWants.toFixed(2)}</Text>
          </View>
          {renderProgressBar(spentWants, budgetWants, '#F59E0B')}
        </View>

        <View style={styles.budgetItem}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Reserva/Invest (20%)</Text>
            <Text style={styles.budgetValue}>R$ {spentSavings.toFixed(2)} / R$ {budgetSavings.toFixed(2)}</Text>
          </View>
          {renderProgressBar(spentSavings, budgetSavings, '#10B981')}
        </View>
      </View>

      {/* Ações e Lançamentos */}
      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Lançamentos</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity 
            style={styles.dealsButton} 
            onPress={() => setDealsModalVisible(true)}
          >
            <Text style={styles.dealsButtonText}>🏷️ Ofertas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#38BDF8' }]}
            onPress={() => setScannerVisible(true)}
          >
            <Text style={styles.addBtnText}>📷 NFC-e</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.addBtnText}>+ Lançar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchTransactions} tintColor="#fff" />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.txItem} 
            onPress={() => setSelectedTx(item)}
            onLongPress={() => deleteTransaction(item)}
            delayLongPress={500}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.txDesc}>{item.description}</Text>
              <Text style={styles.txSub}>
                {item.categories?.name ?? 'Geral'} • {item.date}
              </Text>
            </View>

            <View style={styles.rightActions}>
              <Text
                style={[
                  styles.txAmount,
                  { color: item.type === 'income' ? '#10B981' : '#EF4444' },
                ]}
              >
                {item.type === 'income' ? '+' : '-'} R$ {Number(item.amount).toFixed(2)}
              </Text>

              {/* Botão de alternância de Liquidação */}
              <TouchableOpacity
                style={[
                  styles.statusBadge,
                  item.is_settled ? styles.badgeSettled : styles.badgePending,
                ]}
                onPress={() => toggleSettled(item)}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    item.is_settled ? styles.textSettled : styles.textPending,
                  ]}
                >
                  {item.is_settled ? 'Efetivado' : 'Pendente'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhuma transação neste período.</Text>
        }
      />

      <NewTransactionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={fetchTransactions}
      />

      <ScannerScreen
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onSuccess={fetchTransactions}
      />

      <PurchaseDetailsModal
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        description={selectedTx?.description ?? ''}
        date={selectedTx?.date ?? ''}
        amount={selectedTx?.amount ?? 0}
      />

      {/* Modal que abre a tela completa com comparação, busca e cesta */}
      <Modal
        visible={dealsModalVisible}
        animationType="slide"
        onRequestClose={() => setDealsModalVisible(false)}
      >
        <DealsScreen onBack={() => setDealsModalVisible(false)} />
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  welcomeText: { fontSize: 22, fontWeight: 'bold', color: '#F8FAFC' },
  subText: { fontSize: 12, color: '#94A3B8' },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#EF4444', fontSize: 13, fontWeight: 'bold' },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 20,
  },
  arrowBtn: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  arrowText: {
    color: '#38BDF8',
    fontSize: 26,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  monthTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    minWidth: 160,
    textAlign: 'center',
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    marginTop: 6,
    borderRadius: 12,
    padding: 16,
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: '#334155' },
  summaryLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  summaryVal: { fontSize: 18, fontWeight: 'bold' },
  budgetCard: {
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
    padding: 16,
  },
  budgetTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  budgetItem: { marginBottom: 10 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  budgetLabel: { color: '#94A3B8', fontSize: 12 },
  budgetValue: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  progressBg: { height: 6, backgroundColor: '#0F172A', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  dealsButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dealsButtonText: { color: '#34D399', fontWeight: 'bold', fontSize: 12 },
  addBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  txDesc: { color: '#F8FAFC', fontSize: 15, fontWeight: '500' },
  txSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  rightActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  txAmount: { fontSize: 15, fontWeight: 'bold' },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeSettled: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  textSettled: {
    color: '#34D399',
  },
  textPending: {
    color: '#FBBF24',
  },
  emptyText: { textAlign: 'center', color: '#64748B', marginTop: 24, fontSize: 14 },
});