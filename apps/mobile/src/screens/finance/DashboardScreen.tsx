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
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { NewTransactionModal } from './NewTransactionModal';
import { ScannerScreen } from './ScannerScreen';
import { PurchaseDetailsModal } from './PurchaseDetailsModal';
import { DealsScreen } from './DealsScreen';
import { SettingsModal } from './SettingsModal';
import { YieldCalculatorModal } from './YieldCalculatorModal';
import { PriceSearchScreen } from './PriceSearchScreen';
import { RecurringBillsModal } from './RecurringBillsModal';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  is_settled: boolean;
  split_status?: 'none' | 'gift' | 'pending' | 'settled' | null;
  spent_for_name?: string | null;
  categories?: { name: string; rule_group: string } | { name: string; rule_group: string }[] | null;
}

export const DashboardScreen = () => {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [dealsModalVisible, setDealsModalVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const { user, signOut } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [yieldModalVisible, setYieldModalVisible] = useState(false);
  const [priceSearchVisible, setPriceSearchVisible] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);

  // Regras de cálculo dinâmicas carregadas da tabela profiles
  const [budgetRules, setBudgetRules] = useState({
    useFixed: false,
    needsPct: 50,
    wantsPct: 30,
    savingsPct: 20,
    fixedNeeds: 0,
    fixedWants: 0,
    fixedSavings: 0,
  });

  // Controlo de Mês de Competência
  const [currentDate, setCurrentDate] = useState(new Date());

  // Totais financeiros
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  // Totais orçamentais calculados
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

  const fetchBudgetRules = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('rule_needs_pct, rule_wants_pct, rule_savings_pct, use_fixed_targets, fixed_needs_val, fixed_wants_val, fixed_savings_val')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setBudgetRules({
          useFixed: Boolean(data.use_fixed_targets),
          needsPct: Number(data.rule_needs_pct ?? 50),
          wantsPct: Number(data.rule_wants_pct ?? 30),
          savingsPct: Number(data.rule_savings_pct ?? 20),
          fixedNeeds: Number(data.fixed_needs_val ?? 0),
          fixedWants: Number(data.fixed_wants_val ?? 0),
          fixedSavings: Number(data.fixed_savings_val ?? 0),
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações de teto:', e);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);
    const { startDate, endDate } = getMonthDateRange(currentDate);

    try {
      // 1. Procura as transações já registadas para o mês selecionado
     const { data: existingData } = await supabase
      .from('transactions')
      .select('id, description, amount, type, date, is_settled, split_status, spent_for_name, repeats_monthly, categories(name, rule_group)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

      let currentItems: Transaction[] = (existingData as unknown as Transaction[]) || [];

      // 2. Procura todas as contas ativas na tabela recurring_bills
      const { data: activeBills } = await supabase
        .from('recurring_bills')
        .select('id, description, amount, due_day, category_id, type')
        .eq('is_active', true);

      if (activeBills && activeBills.length > 0) {
        const existingDescriptions = new Set(
          currentItems.map((tx) => tx.description.trim().toLowerCase())
        );

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const toAutoInsert = [];

       for (const bill of activeBills) {
          if (!existingDescriptions.has(bill.description.trim().toLowerCase())) {
            const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
            const validDay = Math.min(bill.due_day, lastDayOfMonth);
            const targetDate = new Date(year, month, validDay).toISOString().split('T')[0];

            toAutoInsert.push({
            user_id: user.id,
            description: bill.description.trim(),
            amount: bill.amount,
            type: bill.type || 'expense',
            category_id: bill.category_id,
            date: targetDate,
            is_settled: false,
            spent_for_name: (bill as any).spent_for_name || null,
            split_status: 'none',
            repeats_monthly: true,
          });
          }
        }

        // Se existirem novas contas fixas a projetar, insere-as e junta-as à lista
        if (toAutoInsert.length > 0) {
          const { data: insertedData, error: insError } = await supabase
            .from('transactions')
            .insert(toAutoInsert)
            .select('id, description, amount, type, date, is_settled, split_status, spent_for_name, categories(name, rule_group)');

          if (!insError && insertedData) {
            currentItems = [...(insertedData as unknown as Transaction[]), ...currentItems];
          }
        }
      }

      setTransactions(currentItems);
      calculateMetrics(currentItems);
    } catch (err) {
      console.warn('Erro ao carregar transações e contas fixas:', err);
      setTransactions([]);
      calculateMetrics([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (items: Transaction[]) => {
    let income = 0;
    let expense = 0;
    let needs = 0;
    let wants = 0;
    let savings = 0;

    items.forEach((item: any) => {
      const val = Number(item.amount) || 0;
      const rawCat = item.categories || item.category;
      const catObj = Array.isArray(rawCat) ? rawCat[0] : rawCat;
      const rule = catObj?.rule_group;

      if (item.type === 'income') {
        income += val;
      } else {
        // Se a pessoa já ressarciu o valor (settled), neutraliza e não entra na despesa pessoal
        if (item.split_status === 'settled') {
          return;
        }

        expense += val;
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

  const deleteTransaction = async (item: any) => {
    // 1. Verifica se é um item recorrente (pela flag da transação ou pela tabela recurring_bills)
    const { data: recBill } = await supabase
      .from('recurring_bills')
      .select('id, is_active')
      .ilike('description', item.description.trim())
      .maybeSingle();

    const isRecurring = Boolean(item.repeats_monthly || recBill);

    if (isRecurring) {
      Alert.alert(
        'Item Recorrente',
        `"${item.description}" repete-se todos os meses. Como deseja excluir?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir apenas deste mês',
            style: 'default',
            onPress: async () => {
              // Apaga apenas o registro deste mês
              await supabase.from('transactions').delete().eq('id', item.id);
              
              // Atualiza localmente a lista para a interface responder na hora
              setTransactions((prev) => prev.filter((tx) => tx.id !== item.id));
              calculateMetrics(transactions.filter((tx) => tx.id !== item.id));
            },
          },
          {
            text: 'Cancelar assinatura e apagar de todos os meses futuros',
            style: 'destructive',
            onPress: async () => {
              // 1. Desativa ou remove da tabela de assinaturas fixas para não ser recriado nunca mais
              await supabase
                .from('recurring_bills')
                .delete()
                .ilike('description', item.description.trim());

              // 2. Desmarca a recorrência
              await supabase
                .from('transactions')
                .update({ repeats_monthly: false })
                .ilike('description', item.description.trim());

              // 3. Apaga deste mês e de todos os meses futuros pendentes
              if (user) {
                await supabase
                  .from('transactions')
                  .delete()
                  .eq('user_id', user.id)
                  .ilike('description', item.description.trim())
                  .gte('date', item.date)
                  .eq('is_settled', false);
              }

              fetchTransactions();
              Alert.alert('Sucesso', 'Assinatura cancelada e removida dos meses atuais e futuros.');
            },
          },
        ]
      );
      return;
    }

    // Exclusão normal de transação avulsa
    Alert.alert(
      'Apagar Lançamento',
      `Tem a certeza de que deseja remover "${item.description}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('transactions').delete().eq('id', item.id);
            const remaining = transactions.filter((tx) => tx.id !== item.id);
            setTransactions(remaining);
            calculateMetrics(remaining);
          },
        },
      ]
    );
  };
  
  useEffect(() => {
    fetchBudgetRules();
  }, [user]);

  useEffect(() => {
    fetchTransactions();
  }, [currentDate]);

  const budgetNeeds = budgetRules.useFixed
    ? budgetRules.fixedNeeds
    : totalIncome * (budgetRules.needsPct / 100);

  const budgetWants = budgetRules.useFixed
    ? budgetRules.fixedWants
    : totalIncome * (budgetRules.wantsPct / 100);

  const budgetSavings = budgetRules.useFixed
    ? budgetRules.fixedSavings
    : totalIncome * (budgetRules.savingsPct / 100);

  const renderProgressBar = (spent: number, budget: number, color: string) => {
    const ratio = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    return (
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${ratio}%`, backgroundColor: color }]} />
      </View>
    );
  };

  const syncRecurringBillsForCurrentMonth = async () => {
    if (!user) return;
    try {
      // 1. Procura as assinaturas ativas cadastradas
      const { data: bills } = await supabase
        .from('recurring_bills')
        .select('*')
        .eq('is_active', true);

      if (!bills || bills.length === 0) {
        Alert.alert('Aviso', 'Nenhuma assinatura ativa encontrada para gerar.');
        return;
      }

      // 2. Evita gerar novamente lançamentos já existentes no mês selecionado
      const { startDate, endDate } = getMonthDateRange(currentDate);
      const { data: existingTx, error: existingError } = await supabase
        .from('transactions')
        .select('description')
        .gte('date', startDate)
        .lte('date', endDate);

      if (existingError) throw existingError;

      const existingNames = new Set(
        (existingTx || []).map((transaction) => transaction.description.trim().toLowerCase())
      );
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const toInsert = [];

      for (const bill of bills) {
        if (!existingNames.has(bill.description.trim().toLowerCase())) {
          const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
          const validDay = Math.min(bill.due_day, lastDayOfMonth);
          const billDate = new Date(year, month, validDay).toISOString().split('T')[0];

          toInsert.push({
            user_id: user.id,
            description: bill.description.trim(),
            amount: bill.amount,
            type: bill.type || 'expense',
            category_id: bill.category_id,
            date: billDate,
            is_settled: false,
            split_status: 'none',
          });
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('transactions').insert(toInsert);
        if (error) throw error;
        Alert.alert('Sucesso', `${toInsert.length} lançamento(s) recorrente(s) gerado(s) no mês!`);
        fetchTransactions();
      } else {
        Alert.alert('Informação', 'Todas as assinaturas ativas já constam nos lançamentos deste mês.');
      }
    } catch (err: any) {
      console.warn('Erro ao sincronizar assinaturas:', err);
      Alert.alert('Erro', err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>ManaCost</Text>
          <Text style={styles.subText}>{user?.email}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.settingsBtn} 
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={signOut}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>
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

      {/* Teto de Gastos Proporcional Personalizável */}
      <View style={styles.budgetCard}>
        <Text style={styles.budgetTitle}>
          {budgetRules.useFixed
            ? 'Orçamento com Teto Fixo (R$)'
            : `Orçamento Proporcional (${budgetRules.needsPct}/${budgetRules.wantsPct}/${budgetRules.savingsPct})`}
        </Text>

        <View style={styles.budgetItem}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>
              Necessidades {budgetRules.useFixed ? '(Fixo)' : `(${budgetRules.needsPct}%)`}
            </Text>
            <Text style={styles.budgetValue}>
              R$ {spentNeeds.toFixed(2)} / R$ {budgetNeeds.toFixed(2)}
            </Text>
          </View>
          {renderProgressBar(spentNeeds, budgetNeeds, '#38BDF8')}
        </View>

        <View style={styles.budgetItem}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>
              Desejos {budgetRules.useFixed ? '(Fixo)' : `(${budgetRules.wantsPct}%)`}
            </Text>
            <Text style={styles.budgetValue}>
              R$ {spentWants.toFixed(2)} / R$ {budgetWants.toFixed(2)}
            </Text>
          </View>
          {renderProgressBar(spentWants, budgetWants, '#F59E0B')}
        </View>

        <View style={styles.budgetItem}>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>
              Reserva/Invest {budgetRules.useFixed ? '(Fixo)' : `(${budgetRules.savingsPct}%)`}
            </Text>
            <Text style={styles.budgetValue}>
              R$ {spentSavings.toFixed(2)} / R$ {budgetSavings.toFixed(2)}
            </Text>
          </View>
          {renderProgressBar(spentSavings, budgetSavings, '#10B981')}
        </View>
      </View>

      {/* Ações e Lançamentos - Barra deslizante completa */}
      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Lançamentos</Text>
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsBar}
        >
          <TouchableOpacity 
            style={styles.recurringButton} 
            onPress={() => setRecurringModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.recurringButtonText}>🔁 Fixas</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.searchPriceButton} 
            onPress={() => setPriceSearchVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.searchPriceButtonText}>🔍 Menor Preço</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.dealsButton} 
            onPress={() => setDealsModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.dealsButtonText}>🏷️ Ofertas</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.yieldButton} 
            onPress={() => setYieldModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.yieldButtonText}>📈 CDI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: '#0284C7' }]}
            onPress={() => setScannerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnText}>📷 NFC-e</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnText}>+ Lançar</Text>
          </TouchableOpacity>
        </ScrollView>
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
                {(Array.isArray(item.categories)
                  ? item.categories[0]?.name
                  : item.categories?.name) ?? 'Geral'}{' '}
                • {item.date}
              </Text>

              {/* Tag de terceiro ou origem */}
              {item.spent_for_name ? (
                <View style={styles.splitTag}>
                  {item.type === 'income' ? (
                    <Text style={styles.splitIncomeText}>📥 De: {item.spent_for_name}</Text>
                  ) : item.split_status === 'pending' ? (
                    <Text style={styles.splitPendingText}>⏳ Vai pagar: {item.spent_for_name}</Text>
                  ) : item.split_status === 'settled' ? (
                    <Text style={styles.splitSettledText}>✅ Pago por: {item.spent_for_name}</Text>
                  ) : (
                    <Text style={styles.splitGiftText}>🎁 Para: {item.spent_for_name}</Text>
                  )}
                </View>
              ) : null}
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
        currentMonthDate={currentDate}
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
        transactionId={selectedTx?.id ?? ''}
        description={selectedTx?.description ?? ''}
        date={selectedTx?.date ?? ''}
        amount={selectedTx?.amount ?? 0}
        userMonthlyIncome={totalIncome}
        onUpdated={fetchTransactions}
        onDeleted={fetchTransactions}
      />

      <RecurringBillsModal
        visible={recurringModalVisible}
        onClose={() => setRecurringModalVisible(false)}
        currentMonthDate={currentDate}
        onSyncMonth={syncRecurringBillsForCurrentMonth}
      />

      <Modal
        visible={dealsModalVisible}
        animationType="slide"
        onRequestClose={() => setDealsModalVisible(false)}
      >
        <DealsScreen onBack={() => setDealsModalVisible(false)} />
      </Modal>

      <Modal
        visible={priceSearchVisible}
        animationType="slide"
        onRequestClose={() => setPriceSearchVisible(false)}
      >
        <PriceSearchScreen onBack={() => setPriceSearchVisible(false)} />
      </Modal>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onSaved={() => {
          fetchBudgetRules();
          fetchTransactions();
        }}
      />

      <YieldCalculatorModal
        visible={yieldModalVisible}
        onClose={() => setYieldModalVisible(false)}
        initialAmount={spentSavings > 0 ? spentSavings : 1000}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 16,
    paddingBottom: 8,
  },
  welcomeText: { fontSize: 22, fontWeight: 'bold', color: '#F8FAFC' },
  subText: { fontSize: 12, color: '#94A3B8' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBtn: {
    backgroundColor: '#1E293B',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 18,
  },
  logoutBtn: { 
    padding: 8,
    marginLeft: 4,
  },
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
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: { 
    color: '#F8FAFC', 
    fontSize: 15, 
    fontWeight: 'bold',
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recurringButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#A855F7',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  recurringButtonText: { 
    color: '#C084FC', 
    fontWeight: 'bold', 
    fontSize: 11,
  },
  searchPriceButton: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  searchPriceButtonText: { 
    color: '#38BDF8', 
    fontWeight: 'bold', 
    fontSize: 11,
  },
  dealsButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 14,
  },
  dealsButtonText: { 
    color: '#34D399', 
    fontWeight: 'bold', 
    fontSize: 11,
  },
  yieldButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 14,
  },
  yieldButtonText: { 
    color: '#38BDF8', 
    fontWeight: 'bold', 
    fontSize: 11,
  },
  addBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 14,
  },
  addBtnText: { 
    color: '#F8FAFC', 
    fontWeight: 'bold', 
    fontSize: 11,
  },
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
  splitTag: {
    marginTop: 4,
  },
  splitPendingText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '600',
  },
  splitSettledText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
  },
  splitGiftText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  splitIncomeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
  },
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