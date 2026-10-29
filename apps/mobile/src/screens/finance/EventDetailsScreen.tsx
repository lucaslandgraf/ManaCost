import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  RefreshControl,
  ScrollView,
  Share,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { supabase } from '../../config/supabase';
import { ScannerScreen } from './ScannerScreen';
import { checkIsOnline, enqueueOfflineAction } from '../../services/offlineSync';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  is_offline_pending?: boolean;
}

interface PurchaseItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export function EventDetailsScreen({ route, navigation }: any) {
  const { eventId, title: initialTitle, currency = 'BRL', targetBudget: initialBudget = 0 } = route.params;

  const [currentEventTitle, setCurrentEventTitle] = useState(initialTitle);
  const [currentTargetBudget, setCurrentTargetBudget] = useState(Number(initialBudget) || 0);
  const [eventDescription, setEventDescription] = useState<string | null>(null);
  const [isArchived, setIsArchived] = useState(false);

  const [editEventModalVisible, setEditEventModalVisible] = useState(false);
  const [newEventTitleInput, setNewEventTitleInput] = useState(initialTitle);
  const [newEventBudgetInput, setNewEventBudgetInput] = useState(
    initialBudget > 0 ? String(initialBudget) : ''
  );
  const [savingEvent, setSavingEvent] = useState(false);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const [reportModalVisible, setReportModalVisible] = useState(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Geral');

  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [receiptItems, setReceiptItems] = useState<PurchaseItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const categories = ['Transporte', 'Hospedagem', 'Alimentação', 'Passeios', 'Compras', 'Geral'];

  const applyDateMask = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const normalizeToISODate = (input: string): string => {
    const clean = input.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const year = y.length === 2 ? `20${y}` : y;
        return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 8) {
      return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    }
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) return clean;
    }
    return '';
  };

  const isValidCalendarDate = (isoStr: string): boolean => {
    const parts = isoStr.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
    if (year < 1900 || year > 2100 || month < 1 || month > 12) return false;
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  };

  const fetchExpenses = async () => {
    try {
      const { data: eventData } = await supabase
        .from('budget_events')
        .select('title, target_budget, description, is_archived')
        .eq('id', eventId)
        .single();

      if (eventData) {
        if (eventData.title) setCurrentEventTitle(eventData.title);
        if (eventData.target_budget !== undefined) {
          setCurrentTargetBudget(Number(eventData.target_budget) || 0);
        }
        setEventDescription(eventData.description || null);
        setIsArchived(Boolean(eventData.is_archived));
      }

      const { data, error } = await supabase
        .from('event_expenses')
        .select('*')
        .eq('event_id', eventId)
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (err: any) {
      console.warn('Aviso ao carregar despesas do evento:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const totalSpent = expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const remainingBudget = currentTargetBudget - totalSpent;
  const progress =
    currentTargetBudget > 0 ? Math.min((totalSpent / currentTargetBudget) * 100, 100) : 0;
  const isOverBudget = currentTargetBudget > 0 && totalSpent > currentTargetBudget;

  const handleShareWhatsApp = async () => {
    let text = `*RELATÓRIO DE VIAGEM: ${currentEventTitle.toUpperCase()}*\n`;
    text += `Moeda: ${currency}\n\n`;

    if (currentTargetBudget > 0) {
      text += `Meta Prevista: ${currency} ${currentTargetBudget.toFixed(2)}\n`;
    }
    text += `Total Gasto: ${currency} ${totalSpent.toFixed(2)}\n`;
    if (currentTargetBudget > 0) {
      text += `Saldo Disponível: ${currency} ${remainingBudget.toFixed(2)} (${remainingBudget >= 0 ? 'Dentro da meta' : 'Meta ultrapassada'})\n`;
    }
    text += `\n*Detalhamento dos Gastos (${expenses.length} lançamentos):*\n`;

    if (expenses.length > 0) {
      expenses.forEach((ex) => {
        const dFormat = ex.expense_date ? ex.expense_date.split('-').reverse().join('/') : '';
        text += `• ${dFormat} | ${ex.description} (${ex.category}): ${currency} ${Number(ex.amount).toFixed(2)}\n`;
      });
    } else {
      text += `Nenhum lançamento registado nesta viagem.\n`;
    }

    try {
      await Share.share({ message: text });
    } catch (err: any) {
      Alert.alert('Erro ao partilhar', err.message);
    }
  };

  const handleExportExcel = async () => {
    if (expenses.length === 0) {
      Alert.alert('Aviso', 'Não existem despesas registadas nesta viagem para exportar.');
      return;
    }

    try {
      const dataRows: any[] = expenses.map((ex) => {
        const dFormat = ex.expense_date ? ex.expense_date.split('-').reverse().join('/') : '';
        return {
          'Data': dFormat,
          'Descrição': ex.description,
          'Categoria': ex.category || 'Geral',
          'Valor': Number(ex.amount) || 0,
        };
      });

      dataRows.push(
        { 'Data': '', 'Descrição': '', 'Categoria': '', 'Valor': '' },
        { 'Data': 'RESUMO', 'Descrição': 'META ORÇAMENTÁRIA (TETO)', 'Categoria': '', 'Valor': currentTargetBudget },
        { 'Data': 'RESUMO', 'Descrição': 'TOTAL REALIZADO / GASTO', 'Categoria': '', 'Valor': totalSpent },
        { 'Data': 'RESUMO', 'Descrição': 'SALDO RESTANTE', 'Categoria': '', 'Valor': remainingBudget }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);

      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 34 },
        { wch: 20 },
        { wch: 18 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Extrato da Viagem');

      const base64Data = XLSX.write(workbook, {
        type: 'base64',
        bookType: 'xlsx',
      });

      const safeName = currentEventTitle.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `ManaCost_${safeName}_${Date.now()}.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Exportar Planilha - ${currentEventTitle}`,
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('Sucesso', `Planilha guardada em: ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar Excel', err.message);
    }
  };

  const handleExportCSV = async () => {
    if (!expenses.length) {
      Alert.alert('Aviso', 'Não existem despesas registadas nesta viagem para exportar.');
      return;
    }

    try {
      let csvContent = '\uFEFFData;Descrição;Categoria;Valor\n';

      expenses.forEach((ex) => {
        const dFormat = ex.expense_date ? ex.expense_date.split('-').reverse().join('/') : '';
        const vFormat = `${currency} ${Number(ex.amount).toFixed(2).replace('.', ',')}`;
        csvContent += `${dFormat};"${(ex.description || '').replace(/"/g, '""')}";"${ex.category || 'Geral'}";"${vFormat}"\n`;
      });

      csvContent += `;\n`;
      csvContent += `RESUMO;"META ORÇAMENTÁRIA (TETO)";;"${currency} ${currentTargetBudget.toFixed(2).replace('.', ',')}"\n`;
      csvContent += `RESUMO;"TOTAL REALIZADO / GASTO";;"${currency} ${totalSpent.toFixed(2).replace('.', ',')}"\n`;
      csvContent += `RESUMO;"SALDO RESTANTE";;"${currency} ${remainingBudget.toFixed(2).replace('.', ',')}"\n`;

      const safeName = currentEventTitle.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `ManaCost_${safeName}_${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Exportar CSV - ${currentEventTitle}`,
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Sucesso', `Ficheiro guardado em: ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar CSV', err.message);
    }
  };

  const handleUpdateEvent = async () => {
    if (!newEventTitleInput.trim()) {
      Alert.alert('Atenção', 'Informe um nome para o evento.');
      return;
    }

    const cleanBudgetStr = newEventBudgetInput.trim().replace(',', '.');
    const parsedBudget = cleanBudgetStr ? parseFloat(cleanBudgetStr) : 0;

    if (cleanBudgetStr && (isNaN(parsedBudget) || parsedBudget < 0)) {
      Alert.alert('Atenção', 'Informe um valor de orçamento válido.');
      return;
    }

    setSavingEvent(true);
    try {
      const { error } = await supabase
        .from('budget_events')
        .update({
          title: newEventTitleInput.trim(),
          target_budget: parsedBudget,
        })
        .eq('id', eventId);

      if (error) throw error;

      setCurrentEventTitle(newEventTitleInput.trim());
      setCurrentTargetBudget(parsedBudget);
      setEditEventModalVisible(false);
      Alert.alert('Sucesso', 'Configurações da viagem atualizadas!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar evento.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleToggleArchiveCurrentEvent = async () => {
    const nextState = !isArchived;
    try {
      const { error } = await supabase
        .from('budget_events')
        .update({ is_archived: nextState })
        .eq('id', eventId);

      if (error) throw error;

      setIsArchived(nextState);
      setEditEventModalVisible(false);
      Alert.alert(
        nextState ? 'Viagem Concluída' : 'Viagem Reativada',
        nextState
          ? 'O evento foi arquivado e agora consta no histórico.'
          : 'O evento voltou para a lista de viagens ativas.'
      );
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao alterar estado do evento.');
    }
  };

  const handleDeleteWholeEvent = () => {
    Alert.alert(
      'Remover Viagem',
      `Tem a certeza de que deseja apagar "${currentEventTitle}" e todos os registos vinculados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover Definitivamente',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('event_expenses').delete().eq('event_id', eventId);
              const { error } = await supabase.from('budget_events').delete().eq('id', eventId);
              if (error) throw error;

              setEditEventModalVisible(false);
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao remover evento.');
            }
          },
        },
      ]
    );
  };

  const handleCreateExpense = async () => {
    if (!description.trim() || !amount.trim()) {
      Alert.alert('Atenção', 'Preencha a descrição e o valor da despesa.');
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const numVal = parseFloat(amount.replace(',', '.'));
      if (isNaN(numVal) || numVal <= 0) {
        Alert.alert('Atenção', 'Informe um valor válido.');
        return;
      }

      const todayDate = new Date().toISOString().split('T')[0];
      const payload = {
        event_id: eventId,
        user_id: user.id,
        description: description.trim(),
        amount: numVal,
        category,
        expense_date: todayDate,
      };

      const isOnline = await checkIsOnline();

      if (!isOnline) {
        const enqueued = await enqueueOfflineAction('event_expenses', payload);

        setExpenses((prev) => [
          {
            id: enqueued.id,
            description: payload.description,
            amount: payload.amount,
            category: payload.category,
            expense_date: payload.expense_date,
            is_offline_pending: true,
          },
          ...prev,
        ]);

        Alert.alert(
          'Guardado Offline',
          'Sem ligação à rede. A despesa ficou guardada no telemóvel e será sincronizada assim que a internet regressar.'
        );

        setModalVisible(false);
        setDescription('');
        setAmount('');
        setCategory('Geral');
        return;
      }

      const { error } = await supabase.from('event_expenses').insert([payload]);
      if (error) throw error;

      setModalVisible(false);
      setDescription('');
      setAmount('');
      setCategory('Geral');
      fetchExpenses();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao registar o lançamento.');
    }
  };

  const openExpenseDetail = async (item: Expense) => {
    setSelectedExpense(item);
    setEditDesc(item.description);
    setEditAmount(String(item.amount));
    setEditCategory(item.category);
    setEditDate(item.expense_date ? item.expense_date.split('-').reverse().join('/') : '');
    setIsEditing(false);
    setReceiptItems([]);
    setDetailModalVisible(true);

    if (item.description.startsWith('NFC-e:')) {
      setLoadingItems(true);
      try {
        const cleanStoreName = item.description.replace('NFC-e:', '').trim();
        const { data: matchedPurchase } = await supabase
          .from('purchases')
          .select('id')
          .ilike('store_name', `%${cleanStoreName}%`)
          .order('purchase_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (matchedPurchase?.id) {
          const { data: itemsData } = await supabase
            .from('purchase_items')
            .select('id, name, quantity, unit_price, total_price')
            .eq('purchase_id', matchedPurchase.id);
          setReceiptItems(itemsData || []);
        }
      } catch (err) {
        console.warn('Erro ao carregar itens fiscais:', err);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedExpense) return;
    const numVal = parseFloat(editAmount.replace(',', '.'));
    if (!editDesc.trim() || isNaN(numVal) || numVal <= 0) {
      Alert.alert('Atenção', 'Informe descrição e valor válidos.');
      return;
    }

    const isoDate = normalizeToISODate(editDate);
    if (!isValidCalendarDate(isoDate)) {
      Alert.alert('Data Inválida', 'Por favor, informe uma data válida no formato DD/MM/AAAA.');
      return;
    }

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('event_expenses')
        .update({
          description: editDesc.trim(),
          amount: numVal,
          category: editCategory,
          expense_date: isoDate,
        })
        .eq('id', selectedExpense.id);

      if (error) throw error;

      setSelectedExpense({
        ...selectedExpense,
        description: editDesc.trim(),
        amount: numVal,
        category: editCategory,
        expense_date: isoDate,
      });

      setIsEditing(false);
      fetchExpenses();
      Alert.alert('Sucesso', 'Gasto atualizado!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar despesa.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteExpense = (id: string, desc: string) => {
    Alert.alert('Remover Gasto', `Deseja remover "${desc}" desta viagem?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('event_expenses').delete().eq('id', id);
          setDetailModalVisible(false);
          fetchExpenses();
        },
      },
    ]);
  };

  const totalItemsBruto = receiptItems.reduce((acc, it) => acc + Number(it.total_price || 0), 0);
  const currentExpenseAmount = selectedExpense ? Number(selectedExpense.amount) : 0;
  const economiaDesconto = Math.max(0, totalItemsBruto - currentExpenseAmount);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Header Separado: Navegação e Ações em Linha Superior */}
      <View style={styles.topNavRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={20} color="#10B981" />
        </TouchableOpacity>

        <View style={styles.navActionsGroup}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setReportModalVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="bar-chart-2" size={15} color="#38BDF8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() =>
              navigation.navigate('EventChecklist', {
                eventId,
                title: currentEventTitle,
              })
            }
            activeOpacity={0.7}
          >
            <Feather name="check-square" size={15} color="#38BDF8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setScannerVisible(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={16} color="#38BDF8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={12} color="#0B0F19" style={{ marginRight: 3 }} />
            <Text style={styles.addButtonText}>Gasto</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bloco dedicado para o Título da Viagem */}
      <TouchableOpacity
        style={styles.eventTitleCard}
        onPress={() => {
          setNewEventTitleInput(currentEventTitle);
          setNewEventBudgetInput(currentTargetBudget > 0 ? String(currentTargetBudget) : '');
          setEditEventModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.titleContentRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentEventTitle}
          </Text>
          {isArchived && (
            <View style={styles.archivedHeaderBadge}>
              <Text style={styles.archivedHeaderBadgeText}>ARQUIVADO</Text>
            </View>
          )}
          <Feather name="settings" size={13} color="#64748B" style={{ marginLeft: 6 }} />
        </View>
        <Text style={styles.headerSub}>Despesas em {currency} • Toque para configurar</Text>
      </TouchableOpacity>

      {/* Card de Resumo do Orçamento */}
      <TouchableOpacity
        style={styles.summaryCard}
        activeOpacity={0.8}
        onPress={() => {
          setNewEventTitleInput(currentEventTitle);
          setNewEventBudgetInput(currentTargetBudget > 0 ? String(currentTargetBudget) : '');
          setEditEventModalVisible(true);
        }}
      >
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>TOTAL GASTO</Text>
            <Text style={[styles.summarySpent, isOverBudget && { color: '#F87171' }]}>
              {currency} {totalSpent.toFixed(2)}
            </Text>
          </View>

          {currentTargetBudget > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>META PREVISTA</Text>
              <Text style={styles.summaryTarget}>
                {currency} {currentTargetBudget.toFixed(2)}
              </Text>
            </View>
          ) : (
            <View style={styles.setBudgetBtn}>
              <Feather name="plus" size={11} color="#10B981" style={{ marginRight: 3 }} />
              <Text style={styles.setBudgetText}>Definir meta</Text>
            </View>
          )}
        </View>

        {currentTargetBudget > 0 && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${progress}%`,
                  backgroundColor: isArchived
                    ? '#64748B'
                    : isOverBudget
                    ? '#F87171'
                    : '#10B981',
                },
              ]}
            />
          </View>
        )}
      </TouchableOpacity>

      {/* Memória de Cálculo da Simulação */}
      {eventDescription ? (
        <View style={styles.simulationCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Feather name="compass" size={13} color="#38BDF8" />
            <Text style={styles.simulationTitle}>Estimativa & Memória de Cálculo:</Text>
          </View>
          <Text style={styles.simulationBodyText}>{eventDescription}</Text>
        </View>
      ) : null}

      {/* Cabeçalho da Lista */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.listSectionTitle}>Lançamentos Registados</Text>
        <Text style={styles.listSectionCount}>{expenses.length} lançamento(s)</Text>
      </View>

      {/* Lista de Gastos */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchExpenses();
              }}
              tintColor="#10B981"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 100 : 80 }}
          renderItem={({ item }: { item: Expense }) => (
            <TouchableOpacity
              style={[styles.expenseItem, item.is_offline_pending && styles.expenseItemOffline]}
              activeOpacity={0.7}
              onPress={() => openExpenseDetail(item)}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
                  {item.is_offline_pending && (
                    <View style={styles.offlineTag}>
                      <Feather name="wifi-off" size={9} color="#F59E0B" style={{ marginRight: 3 }} />
                      <Text style={styles.offlineTagText}>Offline</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.expenseSub}>
                  {item.category} • {item.expense_date.split('-').reverse().join('/')}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>
                - {currency} {Number(item.amount).toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="credit-card" size={28} color="#64748B" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>
                Nenhum gasto lançado para esta viagem ainda.{'\n'}Toque em "Gasto" ou faça a leitura da NFC-e.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal de Relatório da Viagem */}
      <Modal visible={reportModalVisible} transparent animationType="slide" onRequestClose={() => setReportModalVisible(false)}>
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bottomModalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="bar-chart-2" size={15} color="#38BDF8" />
                  <Text style={styles.modalTitle} numberOfLines={1}>Relatório: {currentEventTitle}</Text>
                </View>
                <Text style={styles.reportSubtitle}>Consolidação e fecho de contas da viagem</Text>
              </View>
              <TouchableOpacity onPress={() => setReportModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={styles.reportMetricsCard}>
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Meta</Text>
                  <Text style={[styles.reportMetricVal, { color: '#38BDF8' }]}>
                    {currency} {currentTargetBudget.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.reportMetricDivider} />
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Realizado</Text>
                  <Text style={[styles.reportMetricVal, { color: '#F87171' }]}>
                    {currency} {totalSpent.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.reportMetricDivider} />
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Saldo</Text>
                  <Text style={[styles.reportMetricVal, { color: remainingBudget >= 0 ? '#34D399' : '#F59E0B' }]}>
                    {currency} {remainingBudget.toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.reportActionsContainer}>
                <TouchableOpacity
                  style={styles.exportExcelBtn}
                  onPress={handleExportExcel}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={14} color="#0B0F19" style={{ marginRight: 6 }} />
                  <Text style={styles.exportExcelBtnText}>Exportar Planilha Excel (.xlsx)</Text>
                </TouchableOpacity>

                <View style={styles.secondaryExportRow}>
                  <TouchableOpacity
                    style={styles.shareWhatsAppBtn}
                    onPress={handleShareWhatsApp}
                    activeOpacity={0.7}
                  >
                    <Feather name="share-2" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.shareWhatsAppBtnText}>Partilhar Texto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportCsvBtn}
                    onPress={handleExportCSV}
                    activeOpacity={0.7}
                  >
                    <Feather name="download" size={12} color="#F8FAFC" style={{ marginRight: 6 }} />
                    <Text style={styles.exportCsvBtnText}>Exportar CSV</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeFullBtn}
                onPress={() => setReportModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeFullBtnText}>Concluído</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Configurações do Evento */}
      <Modal visible={editEventModalVisible} transparent animationType="slide" onRequestClose={() => setEditEventModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomModalOverlay}
        >
          <View style={styles.bottomModalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bottomModalHeader}>
              <Text style={styles.modalTitle}>Ajustar Evento</Text>
              <TouchableOpacity onPress={() => setEditEventModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>NOME DO EVENTO</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Mochilão Europa, Eurotrip 2026"
              placeholderTextColor="#64748B"
              value={newEventTitleInput}
              onChangeText={setNewEventTitleInput}
            />

            <Text style={styles.fieldLabel}>META DE GASTOS ({currency})</Text>
            <TextInput
              style={[styles.input, styles.inputBold]}
              placeholder="0,00 (deixe em branco para sem teto)"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              value={newEventBudgetInput}
              onChangeText={setNewEventBudgetInput}
            />

            <TouchableOpacity
              style={[
                styles.archiveEventBtn,
                isArchived && styles.archiveEventBtnActive,
              ]}
              onPress={handleToggleArchiveCurrentEvent}
              activeOpacity={0.7}
            >
              <Feather
                name={isArchived ? 'rotate-ccw' : 'archive'}
                size={13}
                color={isArchived ? '#F59E0B' : '#38BDF8'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.archiveEventBtnText, isArchived && styles.archiveEventBtnTextActive]}>
                {isArchived ? 'Reativar Viagem' : 'Concluir e Arquivar Viagem'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteEventBtn}
              onPress={handleDeleteWholeEvent}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={13} color="#F87171" style={{ marginRight: 6 }} />
              <Text style={styles.deleteEventBtnText}>Excluir definitivamente</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditEventModalVisible(false)}
                disabled={savingEvent}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleUpdateEvent}
                disabled={savingEvent}
              >
                <Text style={styles.saveBtnText}>
                  {savingEvent ? 'A guardar...' : 'Gravar Alterações'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Lançar Gasto Manual */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomModalOverlay}
        >
          <View style={styles.bottomModalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bottomModalHeader}>
              <Text style={styles.modalTitle}>Novo Gasto na Viagem</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Passagem de comboio, Jantar Osteria"
              placeholderTextColor="#64748B"
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.fieldLabel}>VALOR ({currency})</Text>
            <TextInput
              style={[styles.input, styles.inputBold]}
              placeholder="0,00"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.fieldLabel}>CATEGORIA</Text>
            <View style={styles.categoryWrap}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBadge, category === cat && styles.catBadgeActive]}
                  onPress={() => setCategory(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.catBadgeText, category === cat && styles.catBadgeTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreateExpense}>
                <Text style={styles.saveBtnText}>Lançar Gasto</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Detalhe do Gasto / NFC-e */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bottomModalHeader}>
              <Text style={styles.modalTitle}>Detalhe do Lançamento</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {isEditing ? (
                <View>
                  <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
                  <TextInput
                    style={styles.input}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    placeholder="Descrição"
                    placeholderTextColor="#64748B"
                  />

                  <Text style={styles.fieldLabel}>VALOR ({currency})</Text>
                  <TextInput
                    style={[styles.input, styles.inputBold]}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor="#64748B"
                  />

                  <Text style={styles.fieldLabel}>DATA DA DESPESA (DD/MM/AAAA)</Text>
                  <TextInput
                    style={styles.input}
                    value={editDate}
                    onChangeText={(txt) => setEditDate(applyDateMask(txt))}
                    keyboardType="numeric"
                    maxLength={10}
                    placeholder="Ex: 25/10/2026"
                    placeholderTextColor="#64748B"
                  />

                  <Text style={styles.fieldLabel}>CATEGORIA</Text>
                  <View style={styles.categoryWrap}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catBadge, editCategory === cat && styles.catBadgeActive]}
                        onPress={() => setEditCategory(cat)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.catBadgeText,
                            editCategory === cat && styles.catBadgeTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setIsEditing(false)}
                      disabled={savingEdit}
                    >
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleSaveEdit}
                      disabled={savingEdit}
                    >
                      <Text style={styles.saveBtnText}>
                        {savingEdit ? 'A guardar...' : 'Gravar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.detailDesc}>{selectedExpense?.description}</Text>
                  <Text style={styles.detailDate}>
                    {selectedExpense?.category} • {selectedExpense?.expense_date ? selectedExpense.expense_date.split('-').reverse().join('/') : ''}
                  </Text>

                  <View style={styles.detailAmountCard}>
                    <Text style={styles.detailAmountLabel}>TOTAL GASTO</Text>
                    <Text style={styles.detailAmountVal}>
                      - {currency} {Number(selectedExpense?.amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.topActionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtnEdit}
                      onPress={() => setIsEditing(true)}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-2" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
                      <Text style={styles.actionBtnEditText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtnDelete}
                      onPress={() =>
                        selectedExpense &&
                        handleDeleteExpense(selectedExpense.id, selectedExpense.description)
                      }
                      activeOpacity={0.7}
                    >
                      <Feather name="trash-2" size={12} color="#F87171" style={{ marginRight: 4 }} />
                      <Text style={styles.actionBtnDeleteText}>Excluir</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Lista de itens se for nota SEFAZ */}
                  {selectedExpense?.description.startsWith('NFC-e:') && (
                    <>
                      <Text style={styles.fieldLabel}>ITENS DISCRIMINADOS NO CUPOM</Text>
                      {loadingItems ? (
                        <ActivityIndicator
                          size="small"
                          color="#10B981"
                          style={{ marginVertical: 14 }}
                        />
                      ) : receiptItems.length > 0 ? (
                        <>
                          <View style={styles.itemsList}>
                            {receiptItems.map((it: PurchaseItem) => (
                              <View key={it.id} style={styles.itemRow}>
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <Text style={styles.itemName}>{it.name}</Text>
                                  <Text style={styles.itemSub}>
                                    {it.quantity}x • R$ {Number(it.unit_price).toFixed(2)} un
                                  </Text>
                                </View>
                                <Text style={styles.itemTotal}>
                                  R$ {Number(it.total_price).toFixed(2)}
                                </Text>
                              </View>
                            ))}
                          </View>

                          {economiaDesconto > 0.01 && (
                            <View style={styles.discountCard}>
                              <View style={styles.discountRow}>
                                <Text style={styles.discountLabel}>Soma dos produtos:</Text>
                                <Text style={styles.discountOriginal}>
                                  R$ {totalItemsBruto.toFixed(2)}
                                </Text>
                              </View>
                              <View style={styles.discountRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Feather name="tag" size={12} color="#34D399" />
                                  <Text style={styles.discountHighlight}>Economia obtida:</Text>
                                </View>
                                <Text style={styles.discountValue}>
                                  - R$ {economiaDesconto.toFixed(2)}
                                </Text>
                              </View>
                            </View>
                          )}
                        </>
                      ) : (
                        <View style={styles.emptyItemsBox}>
                          <Text style={styles.emptyItemsText}>
                            Nenhum item discriminado encontrado para este cupom.
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  <TouchableOpacity
                    style={styles.closeFullBtn}
                    onPress={() => setDetailModalVisible(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.closeFullBtnText}>Concluído</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Leitor de NFC-e com vínculo do Evento */}
      <ScannerScreen
        visible={scannerVisible}
        eventId={eventId}
        onClose={() => setScannerVisible(false)}
        onSuccess={fetchExpenses}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 44,
  },
  topNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#131927',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  navActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 12,
  },
  eventTitleCard: {
    backgroundColor: '#131927',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  titleContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  archivedHeaderBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  archivedHeaderBadgeText: {
    color: '#94A3B8',
    fontSize: 8,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  summarySpent: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summaryTarget: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  setBudgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  setBudgetText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#0B0F19',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  simulationCard: {
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  simulationTitle: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  simulationBodyText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listSectionTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  listSectionCount: {
    color: '#64748B',
    fontSize: 11,
  },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  expenseItemOffline: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderStyle: 'dashed',
  },
  offlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  offlineTagText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '700',
  },
  expenseDesc: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  expenseSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  expenseAmount: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  bottomModalCard: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
    maxHeight: '90%',
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
  bottomModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  reportSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#131927',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    fontSize: 13,
  },
  inputBold: {
    fontWeight: '700',
  },
  archiveEventBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  archiveEventBtnActive: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  archiveEventBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  archiveEventBtnTextActive: {
    color: '#F59E0B',
  },
  deleteEventBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteEventBtnText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 12,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  catBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  catBadgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  catBadgeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  catBadgeTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#131927',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  detailDesc: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  detailDate: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  detailAmountCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailAmountLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  detailAmountVal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F87171',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  topActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  actionBtnEdit: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
  },
  actionBtnEditText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnDelete: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    alignItems: 'center',
  },
  actionBtnDeleteText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 12,
  },
  itemsList: {
    backgroundColor: '#131927',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  itemName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '500',
  },
  itemSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  itemTotal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  discountCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  discountLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  discountOriginal: {
    color: '#64748B',
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  discountHighlight: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  discountValue: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyItemsBox: {
    backgroundColor: '#131927',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  emptyItemsText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
  },
  closeFullBtn: {
    backgroundColor: '#131927',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeFullBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  reportMetricsCard: {
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  reportMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  reportMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  reportMetricLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  reportMetricVal: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  reportActionsContainer: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  exportExcelBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  exportExcelBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryExportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shareWhatsAppBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareWhatsAppBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  exportCsvBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#131927',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  exportCsvBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
});