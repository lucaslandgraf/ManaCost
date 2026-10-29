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
  TextInput,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { supabase } from '../../config/supabase';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentMonthDate?: Date;
}

type PeriodFilter = 
  | 'current_month' 
  | 'last_month' 
  | 'next_month' 
  | 'last_3_months' 
  | 'current_year' 
  | 'last_year' 
  | 'custom';

type TypeFilter = 'all' | 'expense' | 'income';
type PersonFilter = 'all' | 'mine' | 'third_party';

interface ReportMetrics {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  needsSpent: number;
  wantsSpent: number;
  savingsSpent: number;
  topCategories: { name: string; amount: number }[];
  topExpenses: { desc: string; amount: number; date: string }[];
  pendingReimbursement: { person: string; amount: number }[];
  filteredTransactions: any[];
}

export const ReportsModal: React.FC<Props> = ({ 
  visible, 
  onClose,
  currentMonthDate = new Date(),
}) => {
  const [period, setPeriod] = useState<PeriodFilter>('current_month');
  const [type, setType] = useState<TypeFilter>('all');
  const [personFilter, setPersonFilter] = useState<PersonFilter>('all');
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [peopleList, setPeopleList] = useState<string[]>([]);

  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);

  const normalizeToISODate = (input: string, fallback: string): string => {
    const clean = input.trim();
    if (!clean) return fallback;

    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const year = y.length === 2 ? `20${y}` : y;
        return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    const digitsOnly = clean.replace(/\D/g, '');
    if (digitsOnly.length === 8) {
      const d = digitsOnly.substring(0, 2);
      const m = digitsOnly.substring(2, 4);
      const y = digitsOnly.substring(4, 8);
      return `${y}-${m}-${d}`;
    }

    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return clean;
      }
    }

    return 'invalid';
  };

  const applyDateMask = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const isValidCalendarDate = (isoStr: string): boolean => {
    const parts = isoStr.split('-');
    if (parts.length !== 3) return false;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
    if (year < 1900 || year > 2100) return false;
    if (month < 1 || month > 12) return false;

    const dateObj = new Date(year, month - 1, day);
    return (
      dateObj.getFullYear() === year &&
      dateObj.getMonth() === month - 1 &&
      dateObj.getDate() === day
    );
  };

  const getDateRange = () => {
    const refDate = currentMonthDate;
    let startDate: string;
    let endDate: string;

    if (period === 'current_month') {
      const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else if (period === 'last_month') {
      const start = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
      const end = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else if (period === 'next_month') {
      const start = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
      const end = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 0);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else if (period === 'last_3_months') {
      const start = new Date(refDate.getFullYear(), refDate.getMonth() - 2, 1);
      const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else if (period === 'current_year') {
      const start = new Date(refDate.getFullYear(), 0, 1);
      const end = new Date(refDate.getFullYear(), 11, 31);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else if (period === 'last_year') {
      const prevYear = refDate.getFullYear() - 1;
      const start = new Date(prevYear, 0, 1);
      const end = new Date(prevYear, 11, 31);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else {
      const defaultStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1).toISOString().split('T')[0];
      const defaultEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).toISOString().split('T')[0];

      startDate = normalizeToISODate(customStart, defaultStart);
      endDate = normalizeToISODate(customEnd, defaultEnd);
    }

    return { startDate, endDate };
  };

  const formatBucketName = (bucket: string | null, ruleGroup?: string | null, isIncome?: boolean) => {
    if (isIncome) return 'Não classificado';
    if (bucket === 'needs' || ruleGroup === 'needs_50') return 'Necessidades (50%)';
    if (bucket === 'wants' || ruleGroup === 'wants_30') return 'Desejos (30%)';
    if (bucket === 'savings' || ruleGroup === 'savings_20') return 'Reserva (20%)';
    return 'Não classificado';
  };

  const formatSplitStatus = (status: string | null, spentFor: string | null, isIncome?: boolean) => {
    if (isIncome && spentFor) return `Origem: ${spentFor}`;
    if (!spentFor || !status || status === 'none') return 'Não informado';
    if (status === 'pending') return 'A receber (Pendente)';
    if (status === 'settled') return 'Acertado / Pago';
    if (status === 'gift') return 'Presente / Doação';
    return 'Não informado';
  };

  const generateReport = async () => {
    const { startDate, endDate } = getDateRange();

    if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
      Alert.alert(
        'Data Inválida',
        'Por favor, insira datas válidas no formato DD/MM/AAAA (ex: 01/10/2026).'
      );
      return;
    }

    if (startDate > endDate) {
      Alert.alert(
        'Período Incoerente',
        'A data inicial não pode ser posterior à data final.'
      );
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('transactions')
        .select(`
          id,
          description,
          amount,
          type,
          date,
          budget_bucket,
          spent_for_name,
          split_status,
          categories(name, rule_group)
        `)
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (type !== 'all') {
        query = query.eq('type', type);
      }

      if (personFilter === 'mine') {
        query = query.or('spent_for_name.is.null,type.eq.income');
      } else if (personFilter === 'third_party') {
        if (selectedPerson) {
          query = query.eq('spent_for_name', selectedPerson);
        } else {
          query = query.eq('type', 'expense').not('spent_for_name', 'is', null);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const { data: allWithPeople } = await supabase
        .from('transactions')
        .select('spent_for_name')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .not('spent_for_name', 'is', null);

      const uniquePeople = Array.from(
        new Set((allWithPeople || []).map((t) => t.spent_for_name).filter(Boolean))
      ) as string[];
      setPeopleList(uniquePeople);

      let totalIncome = 0;
      let totalExpense = 0;
      let needsSpent = 0;
      let wantsSpent = 0;
      let savingsSpent = 0;

      const categoryTotals: Record<string, number> = {};
      const personPendingTotals: Record<string, number> = {};
      const expenseItems: { desc: string; amount: number; date: string }[] = [];

      (data || []).forEach((tx: any) => {
        const val = Number(tx.amount) || 0;
        const rawCat = tx.categories;
        const catObj = Array.isArray(rawCat) ? rawCat[0] : rawCat;
        const ruleGroup = catObj?.rule_group;

        if (tx.type === 'income') {
          totalIncome += val;
        } else {
          if (tx.split_status === 'settled') return;

          totalExpense += val;
          expenseItems.push({ desc: tx.description, amount: val, date: tx.date });

          if (tx.budget_bucket === 'needs' || (!tx.budget_bucket && ruleGroup === 'needs_50')) {
            needsSpent += val;
          } else if (tx.budget_bucket === 'wants' || (!tx.budget_bucket && ruleGroup === 'wants_30')) {
            wantsSpent += val;
          } else if (tx.budget_bucket === 'savings' || (!tx.budget_bucket && ruleGroup === 'savings_20')) {
            savingsSpent += val;
          } else {
            needsSpent += val;
          }

          const catName = catObj?.name || 'Geral';
          categoryTotals[catName] = (categoryTotals[catName] || 0) + val;

          if (tx.spent_for_name && tx.split_status === 'pending') {
            personPendingTotals[tx.spent_for_name] =
              (personPendingTotals[tx.spent_for_name] || 0) + val;
          }
        }
      });

      const topCategories = Object.entries(categoryTotals)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      const topExpenses = expenseItems.sort((a, b) => b.amount - a.amount).slice(0, 5);

      const pendingReimbursement = Object.entries(personPendingTotals).map(
        ([person, amount]) => ({ person, amount })
      );

      setMetrics({
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        needsSpent,
        wantsSpent,
        savingsSpent,
        topCategories,
        topExpenses,
        pendingReimbursement,
        filteredTransactions: data || [],
      });
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao processar relatório.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      generateReport();
    }
  }, [visible, period, type, personFilter, selectedPerson, currentMonthDate]);

  const { startDate: currentRangeStart, endDate: currentRangeEnd } = getDateRange();

  const handleShareText = async () => {
    if (!metrics) return;

    let text = `*MANACOST - RELATÓRIO FINANCEIRO*\n`;
    text += `Período: ${currentRangeStart.split('-').reverse().join('/')} até ${currentRangeEnd.split('-').reverse().join('/')}\n\n`;

    if (personFilter === 'third_party' && selectedPerson) {
      text += `*Extrato de Acerto: ${selectedPerson}*\n`;
      text += `Total pago por você: R$ ${metrics.totalExpense.toFixed(2)}\n\n`;
      text += `*Discriminação dos Gastos:*\n`;
      metrics.filteredTransactions.forEach((tx) => {
        const statusLabel =
          tx.split_status === 'settled'
            ? '[Acertado]'
            : tx.split_status === 'pending'
            ? '[A receber]'
            : '[Presente]';
        text += `• ${tx.date} | ${tx.description}: R$ ${Number(tx.amount).toFixed(2)} (${statusLabel})\n`;
      });

      const pendente = metrics.pendingReimbursement.find((p) => p.person === selectedPerson);
      if (pendente) {
        text += `\n*Total Pendente de Acerto:* R$ ${pendente.amount.toFixed(2)}\n`;
      }
    } else {
      text += `*Totais Consolidados:*\n`;
      text += `• Receitas: R$ ${metrics.totalIncome.toFixed(2)}\n`;
      text += `• Despesas: R$ ${metrics.totalExpense.toFixed(2)}\n`;
      text += `• Saldo: R$ ${metrics.balance.toFixed(2)}\n\n`;

      if (metrics.totalExpense > 0) {
        text += `*Aderência à Regra 50/30/20:*\n`;
        text += `• Necessidades: R$ ${metrics.needsSpent.toFixed(2)} (${(
          (metrics.needsSpent / metrics.totalExpense) *
          100
        ).toFixed(0)}%)\n`;
        text += `• Desejos: R$ ${metrics.wantsSpent.toFixed(2)} (${(
          (metrics.wantsSpent / metrics.totalExpense) *
          100
        ).toFixed(0)}%)\n`;
        text += `• Reserva: R$ ${metrics.savingsSpent.toFixed(2)} (${(
          (metrics.savingsSpent / metrics.totalExpense) *
          100
        ).toFixed(0)}%)\n\n`;
      }

      if (metrics.topCategories.length > 0) {
        text += `*Top 3 Categorias de Gastos:*\n`;
        metrics.topCategories.forEach((c, idx) => {
          text += `${idx + 1}. ${c.name}: R$ ${c.amount.toFixed(2)}\n`;
        });
      }
    }

    try {
      await Share.share({ message: text });
    } catch (err: any) {
      Alert.alert('Erro ao partilhar', err.message);
    }
  };

  const handleExportExcel = async () => {
    if (!metrics || metrics.filteredTransactions.length === 0) {
      Alert.alert('Aviso', 'Não há registros para exportar com os filtros atuais.');
      return;
    }

    try {
      const dataRows: any[] = metrics.filteredTransactions.map((tx: any) => {
        const rawCat = tx.categories;
        const catObj = Array.isArray(rawCat) ? rawCat[0] : rawCat;
        const cat = catObj?.name || 'Geral';
        const isIncome = tx.type === 'income';

        const dataFormatada = tx.date ? tx.date.split('-').reverse().join('/') : '';
        const bucket = formatBucketName(tx.budget_bucket, catObj?.rule_group, isIncome);
        const person = tx.spent_for_name ? tx.spent_for_name : 'Pessoal (Meu)';
        const status = formatSplitStatus(tx.split_status, tx.spent_for_name, isIncome);
        const valorNumerico = isIncome ? Number(tx.amount) : -Number(tx.amount);

        return {
          'Data': dataFormatada,
          'Descrição': tx.description || '',
          'Valor (R$)': valorNumerico,
          'Categoria': cat,
          'Regra Orçamentária': bucket,
          'Responsável / Origem': person,
          'Situação do Acerto': status,
        };
      });

      dataRows.push(
        { 'Data': '', 'Descrição': '', 'Valor (R$)': '', 'Categoria': '', 'Regra Orçamentária': '', 'Responsável / Origem': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'TOTAL RECEITAS (+)', 'Valor (R$)': Number(metrics.totalIncome.toFixed(2)), 'Categoria': '', 'Regra Orçamentária': '', 'Responsável / Origem': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'TOTAL DESPESAS (-)', 'Valor (R$)': -Number(metrics.totalExpense.toFixed(2)), 'Categoria': '', 'Regra Orçamentária': '', 'Responsável / Origem': '', 'Situação do Acerto': '' },
        { 'Data': 'RESUMO', 'Descrição': 'SALDO LÍQUIDO FINAL', 'Valor (R$)': Number(metrics.balance.toFixed(2)), 'Categoria': '', 'Regra Orçamentária': '', 'Responsável / Origem': '', 'Situação do Acerto': '' }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);

      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 34 },
        { wch: 18 },
        { wch: 22 },
        { wch: 24 },
        { wch: 24 },
        { wch: 26 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Extrato');

      const base64Data = XLSX.write(workbook, {
        type: 'base64',
        bookType: 'xlsx',
      });

      const fileName = `ManaCost_Relatorio_${Date.now()}.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Exportar Planilha Excel ManaCost',
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('Sucesso', `Planilha Excel salva em: ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar Excel', err.message);
    }
  };

  const handleExportCSV = async () => {
    if (!metrics || metrics.filteredTransactions.length === 0) {
      Alert.alert('Aviso', 'Não há registros para exportar com os filtros atuais.');
      return;
    }

    try {
      let csvContent = '\uFEFFData;Descrição;Valor;Categoria;Regra Orçamentária;Responsável / Origem;Situação do Acerto\n';

      metrics.filteredTransactions.forEach((tx: any) => {
        const rawCat = tx.categories;
        const catObj = Array.isArray(rawCat) ? rawCat[0] : rawCat;
        const cat = catObj?.name || 'Geral';
        const isIncome = tx.type === 'income';

        const dataFormatada = tx.date ? tx.date.split('-').reverse().join('/') : '';
        const valorFormatado = `${isIncome ? '+' : '-'} R$ ${Number(tx.amount).toFixed(2).replace('.', ',')}`;
        const bucket = formatBucketName(tx.budget_bucket, catObj?.rule_group, isIncome);
        const person = tx.spent_for_name ? tx.spent_for_name : 'Pessoal (Meu)';
        const status = formatSplitStatus(tx.split_status, tx.spent_for_name, isIncome);

        csvContent += `${dataFormatada};"${(tx.description || '').replace(/"/g, '""')}";"${valorFormatado}";"${cat}";"${bucket}";"${person}";"${status}"\n`;
      });

      csvContent += `;\n`;
      csvContent += `RESUMO;"TOTAL RECEITAS (+)";"+ R$ ${metrics.totalIncome.toFixed(2).replace('.', ',')}";;;;\n`;
      csvContent += `RESUMO;"TOTAL DESPESAS (-)";"- R$ ${metrics.totalExpense.toFixed(2).replace('.', ',')}";;;;\n`;
      csvContent += `RESUMO;"SALDO LÍQUIDO FINAL";"${metrics.balance >= 0 ? '+' : '-'} R$ ${Math.abs(metrics.balance).toFixed(2).replace('.', ',')}";;;;\n`;

      const fileName = `ManaCost_Relatorio_${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Relatório CSV ManaCost',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Sucesso', `Arquivo salvo em: ${fileUri}`);
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
            <View>
              <Text style={styles.title}>Relatórios & Auditoria</Text>
              <Text style={styles.sub}>Fechamento analítico e conciliação de contas</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Filtro de Período */}
            <View style={styles.periodHeaderRow}>
              <Text style={styles.fieldLabel}>INTERVALO DE COMPETÊNCIA</Text>
              <View style={styles.dateRangeBadge}>
                <Feather name="calendar" size={11} color="#38BDF8" style={{ marginRight: 5 }} />
                <Text style={styles.dateRangeBadgeText}>
                  {currentRangeStart.split('-').reverse().join('/')} até {currentRangeEnd.split('-').reverse().join('/')}
                </Text>
              </View>
            </View>

            <View style={styles.pillsRow}>
              {[
                { id: 'current_month', label: 'Mês Atual' },
                { id: 'last_month', label: 'Mês Anterior' },
                { id: 'next_month', label: 'Mês Seguinte' },
                { id: 'last_3_months', label: 'Últimos 3M' },
                { id: 'current_year', label: 'Ano Atual' },
                { id: 'last_year', label: 'Ano Anterior' },
                { id: 'custom', label: 'Personalizado', icon: 'sliders' },
              ].map((p) => {
                const isActive = period === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pill, isActive && styles.pillActive]}
                    onPress={() => setPeriod(p.id as PeriodFilter)}
                    activeOpacity={0.7}
                  >
                    {p.icon && (
                      <Feather 
                        name="sliders" 
                        size={11} 
                        color={isActive ? '#10B981' : '#94A3B8'} 
                        style={{ marginRight: 5 }} 
                      />
                    )}
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inputs de data personalizada */}
            {period === 'custom' && (
              <View style={styles.customDateBox}>
                <View style={styles.customDateCol}>
                  <Text style={styles.customDateLabel}>Data Inicial</Text>
                  <TextInput
                    style={styles.customDateInput}
                    placeholder="01/10/2026"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    maxLength={10}
                    value={customStart}
                    onChangeText={(val) => setCustomStart(applyDateMask(val))}
                  />
                </View>

                <View style={styles.customDateCol}>
                  <Text style={styles.customDateLabel}>Data Final</Text>
                  <TextInput
                    style={styles.customDateInput}
                    placeholder="31/10/2026"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    maxLength={10}
                    value={customEnd}
                    onChangeText={(val) => setCustomEnd(applyDateMask(val))}
                  />
                </View>

                <TouchableOpacity 
                  style={styles.customDateApplyBtn}
                  onPress={generateReport}
                  activeOpacity={0.8}
                >
                  <Text style={styles.customDateApplyText}>Aplicar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Filtro de Tipo */}
            <Text style={styles.fieldLabel}>TIPO DE OPERAÇÃO</Text>
            <View style={styles.pillsRow}>
              {[
                { id: 'all', label: 'Todas' },
                { id: 'expense', label: 'Apenas Saídas' },
                { id: 'income', label: 'Apenas Entradas' },
              ].map((t) => {
                const isActive = type === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.pill, isActive && styles.pillActive]}
                    onPress={() => setType(t.id as TypeFilter)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Filtro de Responsabilidade */}
            <Text style={styles.fieldLabel}>RESPONSABILIDADE / ACERTOS</Text>
            <View style={styles.pillsRow}>
              {[
                { id: 'all', label: 'Geral' },
                { id: 'mine', label: 'Meus Gastos' },
                { id: 'third_party', label: 'Gastos p/ Terceiros' },
              ].map((pf) => {
                const isActive = personFilter === pf.id;
                return (
                  <TouchableOpacity
                    key={pf.id}
                    style={[styles.pill, isActive && styles.pillActive]}
                    onPress={() => {
                      setPersonFilter(pf.id as PersonFilter);
                      if (pf.id !== 'third_party') setSelectedPerson(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                      {pf.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {personFilter === 'third_party' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.peopleScroll}>
                <TouchableOpacity
                  style={[styles.personChip, selectedPerson === null && styles.personChipActive]}
                  onPress={() => setSelectedPerson(null)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.personChipText, selectedPerson === null && styles.personChipTextActive]}>
                    Todas as Pessoas
                  </Text>
                </TouchableOpacity>
                {peopleList.map((p) => {
                  const isSelected = selectedPerson === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.personChip, isSelected && styles.personChipActive]}
                      onPress={() => setSelectedPerson(p)}
                      activeOpacity={0.7}
                    >
                      <Feather name="user" size={11} color={isSelected ? '#38BDF8' : '#94A3B8'} style={{ marginRight: 4 }} />
                      <Text style={[styles.personChipText, isSelected && styles.personChipTextActive]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Painel de Resultados */}
            {loading ? (
              <ActivityIndicator size="large" color="#10B981" style={{ marginVertical: 32 }} />
            ) : metrics ? (
              <View style={styles.resultsCard}>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Receitas</Text>
                    <Text style={[styles.metricVal, { color: '#34D399' }]}>
                      +R$ {metrics.totalIncome.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Despesas</Text>
                    <Text style={[styles.metricVal, { color: '#F87171' }]}>
                      -R$ {metrics.totalExpense.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>Saldo Final</Text>
                    <Text
                      style={[
                        styles.metricVal,
                        { color: metrics.balance >= 0 ? '#38BDF8' : '#F59E0B' },
                      ]}
                    >
                      R$ {metrics.balance.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {metrics.pendingReimbursement.length > 0 && (
                  <View style={styles.subCardHighlight}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Feather name="clock" size={12} color="#FBBF24" />
                      <Text style={styles.subCardHighlightTitle}>Acertos Pendentes a Receber:</Text>
                    </View>
                    {metrics.pendingReimbursement.map((p) => (
                      <View key={p.person} style={styles.reimburseRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Feather name="user" size={11} color="#94A3B8" />
                          <Text style={styles.reimburseName}>{p.person}</Text>
                        </View>
                        <Text style={styles.reimburseVal}>R$ {p.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {metrics.totalExpense > 0 && (
                  <View style={styles.subCard}>
                    <Text style={styles.subCardTitle}>Aderência à Regra 50 • 30 • 20</Text>
                    <View style={styles.bucketRatioRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bucketRatioLabel}>Necessidades</Text>
                        <Text style={styles.bucketRatioVal}>
                          R$ {metrics.needsSpent.toFixed(2)} ({((metrics.needsSpent / metrics.totalExpense) * 100).toFixed(0)}%)
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bucketRatioLabel}>Desejos</Text>
                        <Text style={styles.bucketRatioVal}>
                          R$ {metrics.wantsSpent.toFixed(2)} ({((metrics.wantsSpent / metrics.totalExpense) * 100).toFixed(0)}%)
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bucketRatioLabel}>Reserva</Text>
                        <Text style={styles.bucketRatioVal}>
                          R$ {metrics.savingsSpent.toFixed(2)} ({((metrics.savingsSpent / metrics.totalExpense) * 100).toFixed(0)}%)
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {metrics.topCategories.length > 0 && (
                  <View style={styles.subCard}>
                    <Text style={styles.subCardTitle}>Principais Categorias de Custo</Text>
                    {metrics.topCategories.map((c, idx) => (
                      <View key={c.name} style={styles.categoryRankRow}>
                        <Text style={styles.categoryRankName}>
                          {idx + 1}. {c.name}
                        </Text>
                        <Text style={styles.categoryRankAmount}>R$ {c.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {/* Ações de Exportação */}
            <View style={styles.exportActionsColumn}>
              <TouchableOpacity
                style={styles.excelExportBtn}
                onPress={handleExportExcel}
                activeOpacity={0.8}
              >
                <Feather name="file-text" size={14} color="#0B0F19" style={{ marginRight: 6 }} />
                <Text style={styles.excelExportBtnText}>Exportar Planilha Excel (.xlsx)</Text>
              </TouchableOpacity>

              <View style={styles.secondaryActionsRow}>
                <TouchableOpacity
                  style={styles.shareTextBtn}
                  onPress={handleShareText}
                  activeOpacity={0.7}
                >
                  <Feather name="share-2" size={12} color="#38BDF8" style={{ marginRight: 6 }} />
                  <Text style={styles.shareTextBtnText}>Partilhar Texto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.csvExportBtn}
                  onPress={handleExportCSV}
                  activeOpacity={0.7}
                >
                  <Feather name="download" size={12} color="#F8FAFC" style={{ marginRight: 6 }} />
                  <Text style={styles.csvExportBtnText}>Exportar CSV</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeModalBtnText}>Concluído</Text>
            </TouchableOpacity>
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
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  dateRangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  dateRangeBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  pillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  pillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  customDateBox: {
    backgroundColor: '#131927',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  customDateCol: {
    flex: 1,
  },
  customDateLabel: {
    color: '#64748B',
    fontSize: 10,
    marginBottom: 4,
    fontWeight: '600',
  },
  customDateInput: {
    backgroundColor: '#0B0F19',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  customDateApplyBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customDateApplyText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 12,
  },
  peopleScroll: {
    marginBottom: 10,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  personChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  personChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  personChipTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  resultsCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  subCard: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 10,
    marginTop: 10,
  },
  subCardTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  subCardHighlight: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  subCardHighlightTitle: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  reimburseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  reimburseName: {
    color: '#F8FAFC',
    fontSize: 12,
  },
  reimburseVal: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  bucketRatioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bucketRatioLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  bucketRatioVal: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  categoryRankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  categoryRankName: {
    color: '#F8FAFC',
    fontSize: 12,
  },
  categoryRankAmount: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },
  exportActionsColumn: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  excelExportBtn: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excelExportBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shareTextBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTextBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  csvExportBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  csvExportBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
  closeModalBtn: {
    backgroundColor: '#131927',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeModalBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 12,
  },
});