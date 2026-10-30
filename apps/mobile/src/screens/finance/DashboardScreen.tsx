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
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { NewTransactionModal } from './NewTransactionModal';
import { ScannerScreen } from './ScannerScreen';
import { PurchaseDetailsModal } from './PurchaseDetailsModal';
import { DealsScreen } from './DealsScreen';
import { SettingsModal } from './SettingsModal';
import { YieldCalculatorModal } from './YieldCalculatorModal';
import { PriceSearchScreen } from './PriceSearchScreen';
import { RecurringBillsModal } from './RecurringBillsModal';
import { TravelEstimatorModal } from './TravelEstimatorModal';
import { ReportsModal } from './ReportsModal';
import { BillsToPayModal } from './BillsToPayModal';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  is_settled: boolean;
  repeats_monthly?: boolean;
  split_status?: 'none' | 'gift' | 'pending' | 'settled' | null;
  spent_for_name?: string | null;
  budget_bucket?: 'needs' | 'wants' | 'savings' | null;
  categories?: { name: string; rule_group: string } | { name: string; rule_group: string }[] | null;
}

export const DashboardScreen = ({ navigation }: any) => {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [dealsModalVisible, setDealsModalVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [initialTxType, setInitialTxType] = useState<'expense' | 'income'>('expense');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [yieldModalVisible, setYieldModalVisible] = useState(false);
  const [priceSearchVisible, setPriceSearchVisible] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [toolsModalVisible, setToolsModalVisible] = useState(false);
  const [baseSalaryIncome, setBaseSalaryIncome] = useState(0);
  const [estimatorVisible, setEstimatorVisible] = useState(false);
  const [reportsModalVisible, setReportsModalVisible] = useState(false);
  const [billsToPayVisible, setBillsToPayVisible] = useState(false);

  // Seletor rápido de Mês e Ano
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const { isOnline, pendingCount } = useOfflineSync(() => {
    fetchTransactions();
  });

  const [budgetRules, setBudgetRules] = useState({
    useFixed: false,
    needsPct: 50,
    wantsPct: 30,
    savingsPct: 20,
    fixedNeeds: 0,
    fixedWants: 0,
    fixedSavings: 0,
  });

  const [currentDate, setCurrentDate] = useState(new Date());

  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
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
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
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
      console.warn('Erro ao carregar regras:', e);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);
    const { startDate, endDate } = getMonthDateRange(currentDate);

    try {
      const { data: existingData } = await supabase
        .from('transactions')
        .select('id, description, amount, type, date, is_settled, split_status, spent_for_name, repeats_monthly, budget_bucket, categories(name, rule_group)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      let currentItems: Transaction[] = (existingData as unknown as Transaction[]) || [];

      const { data: activeBills } = await supabase
        .from('recurring_bills')
        .select('id, description, amount, due_day, category_id, type, spent_for_name')
        .eq('user_id', user.id)
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
            const validDay = Math.min(bill.due_day || 1, lastDayOfMonth);
            const targetDate = new Date(year, month, validDay).toISOString().split('T')[0];

            toAutoInsert.push({
              user_id: user.id,
              description: bill.description.trim(),
              amount: bill.amount,
              type: bill.type || 'expense',
              category_id: bill.category_id || null,
              date: targetDate,
              is_settled: false,
              spent_for_name: bill.spent_for_name || null,
              split_status: 'none',
              repeats_monthly: true,
            });
          }
        }

        if (toAutoInsert.length > 0) {
          const { data: insertedData } = await supabase
            .from('transactions')
            .insert(toAutoInsert)
            .select('id, description, amount, type, date, is_settled, split_status, spent_for_name, repeats_monthly, budget_bucket, categories(name, rule_group)');

          if (insertedData) {
            currentItems = [...(insertedData as unknown as Transaction[]), ...currentItems];
          }
        }
      }

      setTransactions(currentItems);
      calculateMetrics(currentItems);
    } catch (err) {
      console.warn('Erro ao carregar transações:', err);
      setTransactions([]);
      calculateMetrics([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (items: Transaction[]) => {
    let income = 0;
    let salaryBase = 0;
    let expense = 0;
    let needs = 0;
    let wants = 0;
    let savings = 0;

    items.forEach((item: any) => {
      const val = Number(item.amount) || 0;
      const rawCat = item.categories || item.category;
      const catObj = Array.isArray(rawCat) ? rawCat[0] : rawCat;
      const catName = (catObj?.name || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();

      if (item.type === 'income') {
        income += val;
        const isSalary =
          desc.includes('salário') ||
          desc.includes('salario') ||
          catName.includes('salário') ||
          catName.includes('salario');

        if (isSalary) salaryBase += val;
      } else {
        if (item.split_status === 'settled') return;
        expense += val;

        if (item.budget_bucket === 'needs') needs += val;
        else if (item.budget_bucket === 'wants') wants += val;
        else if (item.budget_bucket === 'savings') savings += val;
        else {
          if (catObj?.rule_group === 'needs_50') needs += val;
          else if (catObj?.rule_group === 'wants_30') wants += val;
          else if (catObj?.rule_group === 'savings_20') savings += val;
          else needs += val;
        }
      }
    });

    setTotalIncome(income);
    setBaseSalaryIncome(salaryBase > 0 ? salaryBase : income);
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
      Alert.alert('Erro', 'Não foi possível atualizar o estado do lançamento.');
    }
  };

  const deleteTransaction = async (item: any) => {
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
              await supabase.from('transactions').delete().eq('id', item.id);
              const remaining = transactions.filter((tx) => tx.id !== item.id);
              setTransactions(remaining);
              calculateMetrics(remaining);
            },
          },
          {
            text: 'Cancelar assinatura e apagar dos meses futuros',
            style: 'destructive',
            onPress: async () => {
              await supabase
                .from('recurring_bills')
                .delete()
                .ilike('description', item.description.trim());

              await supabase.from('transactions').delete().eq('id', item.id);

              if (user) {
                await supabase
                  .from('transactions')
                  .delete()
                  .eq('user_id', user.id)
                  .ilike('description', item.description.trim())
                  .gt('date', item.date)
                  .eq('is_settled', false);
              }

              const remaining = transactions.filter((tx) => tx.id !== item.id);
              setTransactions(remaining);
              calculateMetrics(remaining);
            },
          },
        ]
      );
      return;
    }

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

  const currentBalance = totalIncome - totalExpense;

  const renderProgressBar = (spent: number, budget: number, color: string) => {
    const ratio = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    return (
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${ratio}%`, backgroundColor: color }]} />
      </View>
    );
  };

  const getTransactionIcon = (desc: string, catName: string) => {
    const text = `${desc} ${catName}`.toLowerCase();
    if (text.includes('mercado') || text.includes('supermercado') || text.includes('alimento') || text.includes('muffato') || text.includes('condor') || text.includes('atacadao')) {
      return <Feather name="shopping-cart" size={16} color="#38BDF8" />;
    }
    if (text.includes('salário') || text.includes('receita') || text.includes('pix recebido')) {
      return <Feather name="trending-up" size={16} color="#10B981" />;
    }
    if (text.includes('uber') || text.includes('combustivel') || text.includes('posto') || text.includes('transporte')) {
      return <Ionicons name="car-outline" size={17} color="#F59E0B" />;
    }
    if (text.includes('aluguel') || text.includes('condomínio') || text.includes('moradia')) {
      return <Feather name="home" size={16} color="#A855F7" />;
    }
    if (text.includes('restaurante') || text.includes('jantar') || text.includes('almoço') || text.includes('ifood') || text.includes('lanche')) {
      return <Ionicons name="restaurant-outline" size={16} color="#EC4899" />;
    }
    if (text.includes('farmacia') || text.includes('saude') || text.includes('medico')) {
      return <Feather name="activity" size={16} color="#EF4444" />;
    }
    if (text.includes('internet') || text.includes('vivo') || text.includes('luz') || text.includes('energia') || text.includes('copel')) {
      return <Feather name="zap" size={16} color="#FBBF24" />;
    }
    return <Feather name="credit-card" size={16} color="#94A3B8" />;
  };

  const userInitial = user?.email ? user.email.slice(0, 2).toUpperCase() : 'MC';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={13} color="#0B0F19" style={{ marginRight: 6 }} />
          <Text style={styles.offlineBannerText}>
            Modo Offline • {pendingCount} pendente(s)
          </Text>
        </View>
      )}

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.userInfoRow}>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.avatarText}>{userInitial}</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.welcomeText}>ManaCost</Text>
            <Text style={styles.userEmailText} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Pílula do Mês: Setas + Toque central que abre o Seletor Rápido */}
          <View style={styles.monthPill}>
            <TouchableOpacity 
              style={styles.monthArrow} 
              onPress={() => changeMonth(-1)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="chevron-left" size={14} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthPillCenter}
              onPress={() => {
                setPickerYear(currentDate.getFullYear());
                setMonthPickerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.monthPillText}>{formatMonthTitle(currentDate)}</Text>
              <Feather name="chevron-down" size={11} color="#10B981" style={{ marginLeft: 3 }} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.monthArrow} 
              onPress={() => changeMonth(1)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Feather name="chevron-right" size={14} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.headerIconButton}
            onPress={() => setReportsModalVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="bar-chart-2" size={15} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="settings" size={15} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* BLOCO FIXO SUPERIOR */}
      <View style={styles.fixedTopSection}>
        {/* Card Saldo Consolidado */}
        <View style={styles.heroBalanceCard}>
          <Text style={styles.heroLabel}>SALDO CONSOLIDADO DO MÊS</Text>

          <Text style={[styles.heroBalanceVal, { color: currentBalance >= 0 ? '#F8FAFC' : '#F87171' }]}>
            R$ {currentBalance.toFixed(2)}
          </Text>

          <View style={styles.inOutRow}>
            <View style={styles.inOutCol}>
              <View style={styles.inOutLabelRow}>
                <Feather name="arrow-up-right" size={12} color="#10B981" />
                <Text style={styles.inOutLabel}>Entradas</Text>
              </View>
              <Text style={styles.inVal}>+R$ {totalIncome.toFixed(2)}</Text>
            </View>

            <View style={styles.inOutDivider} />

            <View style={styles.inOutCol}>
              <View style={styles.inOutLabelRow}>
                <Feather name="arrow-down-right" size={12} color="#F87171" />
                <Text style={styles.inOutLabel}>Saídas</Text>
              </View>
              <Text style={styles.outVal}>-R$ {totalExpense.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Ações Rápidas */}
        <View style={styles.quickActionsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsScroll}>
           <TouchableOpacity
  style={[styles.actionPill, styles.actionPillExpense]}
  onPress={() => {
    setInitialTxType('expense');
    setModalVisible(true);
  }}
  activeOpacity={0.7}
>
  <Feather name="minus" size={13} color="#F87171" />
  <Text style={styles.actionPillText}>Despesa</Text>
</TouchableOpacity>

<TouchableOpacity
  style={[styles.actionPill, styles.actionPillIncome]}
  onPress={() => {
    setInitialTxType('income');
    setModalVisible(true);
  }}
  activeOpacity={0.7}
>
  <Feather name="plus" size={13} color="#10B981" />
  <Text style={styles.actionPillText}>Receita</Text>
</TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => setYieldModalVisible(true)}
              activeOpacity={0.7}
            >
              <Feather name="trending-up" size={13} color="#F59E0B" />
              <Text style={styles.actionPillText}>Simulador</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => setEstimatorVisible(true)}
              activeOpacity={0.7}
            >
              <Feather name="compass" size={13} color="#14B8A6" />
              <Text style={styles.actionPillText}>Estimador</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => setToolsModalVisible(true)}
              activeOpacity={0.7}
            >
              <Feather name="grid" size={13} color="#94A3B8" />
              <Text style={styles.actionPillText}>Mais</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Régua de Orçamento Clicável com Redirecionamento Direto para Ajustes */}
        <TouchableOpacity
          style={styles.budgetCard}
          onPress={() => setSettingsVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.budgetHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.budgetTitle}>
                {budgetRules.useFixed
                  ? 'Orçamento em R$ Fixos'
                  : `Orçamento ${budgetRules.needsPct} • ${budgetRules.wantsPct} • ${budgetRules.savingsPct}`}
              </Text>
              <Feather name="edit-2" size={11} color="#10B981" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.budgetBaseVal}>Base R$ {totalIncome.toFixed(2)}</Text>
              <Feather name="chevron-right" size={12} color="#64748B" />
            </View>
          </View>

          <View style={styles.budgetItem}>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>
                Necessidades <Text style={styles.budgetPct}>• {budgetRules.useFixed ? 'Fixo' : `${budgetRules.needsPct}%`}</Text>
              </Text>
              <Text style={styles.budgetValue}>
                R$ {spentNeeds.toFixed(2)} <Text style={styles.budgetValueMax}>/ R$ {budgetNeeds.toFixed(2)}</Text>
              </Text>
            </View>
            {renderProgressBar(spentNeeds, budgetNeeds, '#38BDF8')}
          </View>

          <View style={styles.budgetItem}>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>
                Desejos <Text style={styles.budgetPct}>• {budgetRules.useFixed ? 'Fixo' : `${budgetRules.wantsPct}%`}</Text>
              </Text>
              <Text style={styles.budgetValue}>
                R$ {spentWants.toFixed(2)} <Text style={styles.budgetValueMax}>/ R$ {budgetWants.toFixed(2)}</Text>
              </Text>
            </View>
            {renderProgressBar(spentWants, budgetWants, '#F59E0B')}
          </View>

          <View style={styles.budgetItem}>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>
                Reserva / Invest <Text style={styles.budgetPct}>• {budgetRules.useFixed ? 'Fixo' : `${budgetRules.savingsPct}%`}</Text>
              </Text>
              <Text style={styles.budgetValue}>
                R$ {spentSavings.toFixed(2)} <Text style={styles.budgetValueMax}>/ R$ {budgetSavings.toFixed(2)}</Text>
              </Text>
            </View>
            {renderProgressBar(spentSavings, budgetSavings, '#10B981')}
          </View>
        </TouchableOpacity>

        {/* Título do Extrato */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Extrato Recente</Text>
          <Text style={styles.sectionCounter}>{transactions.length} lançamentos</Text>
        </View>
      </View>

      {/* LISTA ROLÁVEL */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchTransactions} tintColor="#10B981" />
        }
        style={styles.txFlatList}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const rawCat = item.categories;
          const catObj = Array.isArray(rawCat) ? rawCat[0] : rawCat;
          const catName = catObj?.name || 'Geral';
          const isIncome = item.type === 'income';

          return (
            <TouchableOpacity
              style={styles.txCard}
              onPress={() => setSelectedTx(item)}
              onLongPress={() => deleteTransaction(item)}
              delayLongPress={500}
              activeOpacity={0.7}
            >
              <View style={styles.txIconBox}>
                {getTransactionIcon(item.description, catName)}
              </View>

              <View style={styles.txInfoCol}>
                <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.txSub}>
                  {catName} • {item.date.split('-').reverse().join('/')}
                </Text>

                {item.spent_for_name ? (
                  <View style={styles.splitBadge}>
                    <Text style={styles.splitBadgeText}>
                      {isIncome ? 'De: ' : item.split_status === 'pending' ? 'Pendente: ' : item.split_status === 'settled' ? 'Pago: ' : 'Para: '}
                      {item.spent_for_name}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.txRightCol}>
                <Text style={[styles.txAmount, { color: isIncome ? '#34D399' : '#F8FAFC' }]}>
                  {isIncome ? '+' : '-'}R$ {Number(item.amount).toFixed(2)}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.settledBadge,
                    item.is_settled ? styles.settledBadgeActive : styles.settledBadgePending,
                  ]}
                  onPress={() => toggleSettled(item)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.settledBadgeText, item.is_settled ? styles.settledTextActive : styles.settledTextPending]}>
                    {item.is_settled ? 'Efetivado' : 'Pendente'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="inbox" size={30} color="#64748B" style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Nenhum lançamento no período</Text>
            <Text style={styles.emptySubtitle}>Use as ações rápidas acima para registrar novas movimentações.</Text>
          </View>
        }
      />

      {/* Bottom Bar */}
      <View style={styles.bottomBarContainer}>
        <TouchableOpacity style={styles.navTab} activeOpacity={0.7}>
          <Feather name="grid" size={20} color="#10B981" />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Início</Text>
          <View style={styles.activeDot} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setDealsModalVisible(true)}
          activeOpacity={0.7}
        >
          <Feather name="tag" size={20} color="#64748B" />
          <Text style={styles.navLabel}>Ofertas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fabCenter}
          onPress={() => setScannerVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.fabInner}>
            <MaterialCommunityIcons name="qrcode-scan" size={24} color="#0B0F19" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setBillsToPayVisible(true)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="receipt-text-outline" size={21} color="#64748B" />
          <Text style={styles.navLabel}>Boletos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => navigation?.navigate ? navigation.navigate('Events') : setEstimatorVisible(true)}
          activeOpacity={0.7}
        >
          <Feather name="send" size={19} color="#64748B" />
          <Text style={styles.navLabel}>Viagens</Text>
        </TouchableOpacity>
      </View>

      {/* Menu Inferior Ferramentas */}
      <Modal
        visible={toolsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setToolsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.toolsOverlay}
          activeOpacity={1}
          onPress={() => setToolsModalVisible(false)}
        >
          <View style={styles.toolsCard}>
            <View style={styles.toolsHeader}>
              <Text style={styles.toolsTitle}>Recursos & Ferramentas</Text>
              <TouchableOpacity onPress={() => setToolsModalVisible(false)} style={styles.closeBtnIcon}>
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.toolsGrid}>
              <TouchableOpacity
                style={styles.toolItem}
                onPress={() => {
                  setToolsModalVisible(false);
                  setReportsModalVisible(true);
                }}
              >
                <View style={[styles.toolIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
                  <Feather name="bar-chart-2" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toolLabel}>Relatórios & Auditoria</Text>
                  <Text style={styles.toolSub}>CSV, Excel e regra 50/30/20</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolItem}
                onPress={() => {
                  setToolsModalVisible(false);
                  setBillsToPayVisible(true);
                }}
              >
                <View style={[styles.toolIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Feather name="file-text" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toolLabel}>Contas a Pagar</Text>
                  <Text style={styles.toolSub}>Checklist de boletos e faturas</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolItem}
                onPress={() => {
                  setToolsModalVisible(false);
                  if (navigation?.navigate) navigation.navigate('Events');
                  else setEstimatorVisible(true);
                }}
              >
                <View style={[styles.toolIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
                  <Feather name="send" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toolLabel}>Viagens & Eventos</Text>
                  <Text style={styles.toolSub}>Orçamento fechado e checklist</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolItem}
                onPress={() => {
                  setToolsModalVisible(false);
                  setRecurringModalVisible(true);
                }}
              >
                <View style={[styles.toolIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                  <Feather name="repeat" size={18} color="#A855F7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toolLabel}>Assinaturas & Fixas</Text>
                  <Text style={styles.toolSub}>Lançamentos automáticos mensais</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolItem}
                onPress={() => {
                  setToolsModalVisible(false);
                  setPriceSearchVisible(true);
                }}
              >
                <View style={[styles.toolIconBox, { backgroundColor: 'rgba(14, 165, 233, 0.12)' }]}>
                  <Feather name="search" size={18} color="#0EA5E9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toolLabel}>Menor Preço SEFAZ</Text>
                  <Text style={styles.toolSub}>Consulta direta de notas</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Seletor Rápido de Mês e Ano */}
      <Modal
        visible={monthPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMonthPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setMonthPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.pickerCard}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerHeaderRow}>
              <Text style={styles.pickerTitle}>Selecionar Período</Text>
              <TouchableOpacity
                onPress={() => setMonthPickerVisible(false)}
                style={styles.pickerCloseBtn}
              >
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Controlo do Ano */}
            <View style={styles.yearControlRow}>
              <TouchableOpacity
                onPress={() => setPickerYear((prev) => prev - 1)}
                style={styles.yearArrowBtn}
                activeOpacity={0.7}
              >
                <Feather name="chevron-left" size={16} color="#10B981" />
              </TouchableOpacity>

              <Text style={styles.yearDisplay}>{pickerYear}</Text>

              <TouchableOpacity
                onPress={() => setPickerYear((prev) => prev + 1)}
                style={styles.yearArrowBtn}
                activeOpacity={0.7}
              >
                <Feather name="chevron-right" size={16} color="#10B981" />
              </TouchableOpacity>
            </View>

            {/* Grade com os 12 Meses */}
            <View style={styles.monthsGrid}>
              {[
                { label: 'Jan', index: 0 },
                { label: 'Fev', index: 1 },
                { label: 'Mar', index: 2 },
                { label: 'Abr', index: 3 },
                { label: 'Mai', index: 4 },
                { label: 'Jun', index: 5 },
                { label: 'Jul', index: 6 },
                { label: 'Ago', index: 7 },
                { label: 'Set', index: 8 },
                { label: 'Out', index: 9 },
                { label: 'Nov', index: 10 },
                { label: 'Dez', index: 11 },
              ].map((m) => {
                const isSelected =
                  currentDate.getMonth() === m.index &&
                  currentDate.getFullYear() === pickerYear;

                return (
                  <TouchableOpacity
                    key={m.index}
                    style={[
                      styles.monthGridItem,
                      isSelected && styles.monthGridItemActive,
                    ]}
                    onPress={() => {
                      const newDate = new Date(pickerYear, m.index, 1);
                      setCurrentDate(newDate);
                      setMonthPickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.monthGridItemText,
                        isSelected && styles.monthGridItemTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Atalho para o Mês Atual */}
            <TouchableOpacity
              style={styles.todayShortcutBtn}
              onPress={() => {
                const now = new Date();
                setPickerYear(now.getFullYear());
                setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                setMonthPickerVisible(false);
              }}
              activeOpacity={0.7}
            >
              <Feather name="calendar" size={13} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.todayShortcutText}>Ir para Mês Atual</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modais do Sistema */}
      <NewTransactionModal
  visible={modalVisible}
  initialType={initialTxType}
  onClose={() => setModalVisible(false)}
  currentMonthDate={currentDate}
  onSuccess={fetchTransactions}
  onOpenSettings={() => setSettingsVisible(true)}
/>

      <ReportsModal
        visible={reportsModalVisible}
        onClose={() => setReportsModalVisible(false)}
        currentMonthDate={currentDate}
      />

      <BillsToPayModal
        visible={billsToPayVisible}
        onClose={() => setBillsToPayVisible(false)}
        currentMonthDate={currentDate}
        onBillSettled={fetchTransactions}
      />

      <TravelEstimatorModal
        visible={estimatorVisible}
        onClose={() => setEstimatorVisible(false)}
        onEventCreated={fetchTransactions}
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
        userMonthlyIncome={baseSalaryIncome}
        onUpdated={fetchTransactions}
        onDeleted={fetchTransactions}
        onOpenSettings={() => setSettingsVisible(true)}
      />

      <RecurringBillsModal
        visible={recurringModalVisible}
        onClose={() => setRecurringModalVisible(false)}
        currentMonthDate={currentDate}
        onSyncMonth={fetchTransactions}
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
  container: { 
    flex: 1, 
    backgroundColor: '#0B0F19',
  },
  offlineBanner: {
    backgroundColor: '#F59E0B',
    paddingVertical: 4,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBannerText: {
    color: '#0B0F19',
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 10,
    paddingBottom: 8,
    backgroundColor: '#0B0F19',
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  welcomeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    lineHeight: 18,
  },
  userEmailText: {
    fontSize: 11,
    color: '#64748B',
    maxWidth: 120,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  monthArrow: {
    paddingHorizontal: 4,
  },
  monthPillCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  monthPillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  fixedTopSection: {
    paddingHorizontal: 16,
  },
  heroBalanceCard: {
    backgroundColor: '#131927',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  heroLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroBalanceVal: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  inOutRow: {
    flexDirection: 'row',
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  inOutCol: {
    flex: 1,
  },
  inOutLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  inOutDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: 10,
  },
  inOutLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  inVal: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: '700',
  },
  outVal: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionsContainer: {
    marginVertical: 10,
  },
  quickActionsScroll: {
    gap: 6,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  actionPillExpense: {
    borderColor: 'rgba(248, 113, 113, 0.25)',
  },
  actionPillIncome: {
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  actionPillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  budgetCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 10,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  budgetBaseVal: {
    color: '#64748B',
    fontSize: 10,
  },
  budgetItem: {
    marginBottom: 6,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  budgetLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  budgetPct: {
    color: '#64748B',
    fontSize: 10,
  },
  budgetValue: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  budgetValueMax: {
    color: '#64748B',
    fontWeight: '400',
  },
  progressBg: {
    height: 3.5,
    backgroundColor: '#0B0F19',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCounter: {
    color: '#64748B',
    fontSize: 10,
  },
  txFlatList: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 140 : 110,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  txIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  txInfoCol: {
    flex: 1,
    paddingRight: 8,
  },
  txDesc: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  txSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  splitBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  splitBadgeText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '700',
  },
  txRightCol: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 12,
    fontWeight: '700',
  },
  settledBadge: {
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  settledBadgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  settledBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  settledBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  settledTextActive: {
    color: '#34D399',
  },
  settledTextPending: {
    color: '#FBBF24',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: 30,
  },
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'android' ? 104 : 88,
    backgroundColor: '#0B0F19',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 44 : 28,
    paddingHorizontal: 12,
  },
  navTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  navLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  activeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#10B981',
    marginTop: 2,
  },
  fabCenter: {
    top: -24,
    justifyContent: 'center',
    alignItems: 'center',
    width: 58,
    height: 58,
  },
  fabInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  toolsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  toolsCard: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 36 : 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  toolsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  toolsTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  closeBtnIcon: {
    padding: 4,
  },
  toolsGrid: {
    flexDirection: 'column',
    gap: 8,
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  toolIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolLabel: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  toolSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0B0F19',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pickerTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  pickerCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131927',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  yearArrowBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#0B0F19',
  },
  yearDisplay: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthGridItem: {
    width: '22%',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  monthGridItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  monthGridItemText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  monthGridItemTextActive: {
    color: '#10B981',
    fontWeight: '800',
  },
  todayShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  todayShortcutText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
});