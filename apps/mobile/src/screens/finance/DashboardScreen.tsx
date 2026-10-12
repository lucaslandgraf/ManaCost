import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { NewTransactionModal } from './NewTransactionModal';
import { ScannerScreen } from './ScannerScreen';

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
  const [scannerVisible, setScannerVisible] = useState(false);
  const { user, signOut } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Totais financeiros
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  // Totais da regra 50/30/20
  const [spentNeeds, setSpentNeeds] = useState(0);
  const [spentWants, setSpentWants] = useState(0);
  const [spentSavings, setSpentSavings] = useState(0);

  const fetchTransactions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('id, description, amount, type, date, is_settled, categories(name, rule_group)')
      .order('date', { ascending: false });

    if (data) {
      setTransactions(data as unknown as Transaction[]);
      calculateMetrics(data as unknown as Transaction[]);
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

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Tetos calculados com base na receita total registrada
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

      {/* Card de Resumo Financeiro */}
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

      {/* Lista de Transações */}
      <View style={styles.listHeader}>
  <Text style={styles.sectionTitle}>Últimos Lançamentos</Text>
  <View style={{ flexDirection: 'row', gap: 8 }}>
    <TouchableOpacity
      style={[styles.addBtn, { backgroundColor: '#38BDF8' }]}
      onPress={() => setScannerVisible(true)}
    >
      <Text style={styles.addBtnText}>📷 Ler NFC-e</Text>
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
          <View style={styles.txItem}>
            <View>
              <Text style={styles.txDesc}>{item.description}</Text>
              <Text style={styles.txSub}>
  {item.categories?.name ?? 'Geral'} • {item.date}
  {!item.is_settled && ' • (Pendente)'}
</Text>
            </View>
            <Text
              style={[
                styles.txAmount,
                { color: item.type === 'income' ? '#10B981' : '#EF4444' },
              ]}
            >
              {item.type === 'income' ? '+' : '-'} R$ {Number(item.amount).toFixed(2)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhuma transação registrada ainda.</Text>
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
    paddingBottom: 8,
  },
  welcomeText: { fontSize: 22, fontWeight: 'bold', color: '#F8FAFC' },
  subText: { fontSize: 12, color: '#94A3B8' },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#EF4444', fontSize: 13, fontWeight: 'bold' },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    marginTop: 12,
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
    marginTop: 12,
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
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  addBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
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
  txAmount: { fontSize: 15, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#64748B', marginTop: 24, fontSize: 14 },
});