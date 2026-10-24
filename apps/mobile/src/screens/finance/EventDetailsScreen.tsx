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
} from 'react-native';
import { supabase } from '../../config/supabase';
import { ScannerScreen } from './ScannerScreen';

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
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

  // Estados do evento (título e orçamento previsto editáveis)
  const [currentEventTitle, setCurrentEventTitle] = useState(initialTitle);
  const [currentTargetBudget, setCurrentTargetBudget] = useState(Number(initialBudget) || 0);

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

  // Estados do formulário de criação de gastos
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Geral');

  // Estados do modal de visualização e edição de gastos
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [receiptItems, setReceiptItems] = useState<PurchaseItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const categories = ['Transporte', 'Hospedagem', 'Alimentação', 'Passeios', 'Compras', 'Geral'];

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('event_expenses')
        .select('*')
        .eq('event_id', eventId)
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar as despesas do evento.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const totalSpent = expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const progress =
    currentTargetBudget > 0 ? Math.min((totalSpent / currentTargetBudget) * 100, 100) : 0;

  // Atualizar título e orçamento na tabela budget_events
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
      Alert.alert('Sucesso', 'Configurações do evento atualizadas!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar evento.');
    } finally {
      setSavingEvent(false);
    }
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

      const { error } = await supabase.from('event_expenses').insert([
        {
          event_id: eventId,
          user_id: user.id,
          description: description.trim(),
          amount: numVal,
          category,
          expense_date: new Date().toISOString().split('T')[0],
        },
      ]);

      if (error) throw error;

      setModalVisible(false);
      setDescription('');
      setAmount('');
      setCategory('Geral');
      fetchExpenses();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao salvar o lançamento.');
    }
  };

  const openExpenseDetail = async (item: Expense) => {
    setSelectedExpense(item);
    setEditDesc(item.description);
    setEditAmount(String(item.amount));
    setEditCategory(item.category);
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

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('event_expenses')
        .update({
          description: editDesc.trim(),
          amount: numVal,
          category: editCategory,
        })
        .eq('id', selectedExpense.id);

      if (error) throw error;

      setSelectedExpense({
        ...selectedExpense,
        description: editDesc.trim(),
        amount: numVal,
        category: editCategory,
      });

      setIsEditing(false);
      fetchExpenses();
      Alert.alert('Sucesso', 'Gasto atualizado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar despesa.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteExpense = (id: string, desc: string) => {
    Alert.alert('Apagar Gasto', `Deseja remover "${desc}" deste evento?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
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
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        {/* Tocar no título abre o modal de edição do evento */}
        <TouchableOpacity
          style={styles.headerTitleContainer}
          onPress={() => {
            setNewEventTitleInput(currentEventTitle);
            setNewEventBudgetInput(currentTargetBudget > 0 ? String(currentTargetBudget) : '');
            setEditEventModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentEventTitle}
            </Text>
            <Text style={styles.editTitleIcon}>✏️</Text>
          </View>
          <Text style={styles.headerSub}>Despesas do evento ({currency}) • Toque p/ configurar</Text>
        </TouchableOpacity>

        {/* Botão de Scanner NFC-e */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => setScannerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.scanButtonIcon}>📷</Text>
        </TouchableOpacity>

        {/* Botão de Lançar Gasto Manual */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ Gasto</Text>
        </TouchableOpacity>
      </View>

      {/* Card de Resumo do Orçamento (Clicável para editar meta) */}
      <TouchableOpacity
        style={styles.summaryCard}
        activeOpacity={0.7}
        onPress={() => {
          setNewEventTitleInput(currentEventTitle);
          setNewEventBudgetInput(currentTargetBudget > 0 ? String(currentTargetBudget) : '');
          setEditEventModalVisible(true);
        }}
      >
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>Total Gasto</Text>
            <Text style={styles.summarySpent}>
              {currency} {totalSpent.toFixed(2)}
            </Text>
          </View>

          {currentTargetBudget > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.metaHeaderRow}>
                <Text style={styles.summaryLabel}>Meta Prevista</Text>
                <Text style={styles.editMetaIcon}>✏️</Text>
              </View>
              <Text style={styles.summaryTarget}>
                {currency} {currentTargetBudget.toFixed(2)}
              </Text>
            </View>
          ) : (
            <View style={styles.setBudgetBtn}>
              <Text style={styles.setBudgetText}>+ Definir meta</Text>
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
                  backgroundColor: progress >= 100 ? '#EF4444' : '#38BDF8',
                },
              ]}
            />
          </View>
        )}
      </TouchableOpacity>

      {/* Lista de Despesas */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.listSectionTitle}>Lançamentos</Text>
        <Text style={styles.listSectionCount}>{expenses.length} registro(s)</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 40 }} />
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
              tintColor="#fff"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }: { item: Expense }) => (
            <TouchableOpacity
              style={styles.expenseItem}
              activeOpacity={0.7}
              onPress={() => openExpenseDetail(item)}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.expenseDesc}>{item.description}</Text>
                <Text style={styles.expenseSub}>
                  {item.category} • {item.expense_date}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>
                - {currency} {Number(item.amount).toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nenhum gasto lançado para esta viagem ainda.{'\n'}Toque em "+ Gasto" ou escaneie uma NFC-e.
            </Text>
          }
        />
      )}

      {/* Modal para Editar Nome e Meta do Evento */}
      <Modal visible={editEventModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configurações do Evento</Text>

            <Text style={styles.label}>Nome do Evento:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Mochilão Europa, Eurotrip 2026"
              placeholderTextColor="#64748B"
              value={newEventTitleInput}
              onChangeText={setNewEventTitleInput}
            />

            <Text style={styles.label}>Meta de Gastos / Orçamento ({currency}):</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00 (deixe em branco se não tiver teto)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={newEventBudgetInput}
              onChangeText={setNewEventBudgetInput}
            />

            <Text style={styles.hintNotice}>
              💡 Se preenchido, exibirá uma barra de progresso. Deixe em branco para remover a meta.
            </Text>

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
                  {savingEvent ? 'Salvando...' : 'Salvar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Criação Manual de Gasto */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Gasto no Evento</Text>

            <TextInput
              style={styles.input}
              placeholder="Descrição (ex: Passagem de Trem, Jantar)"
              placeholderTextColor="#64748B"
              value={description}
              onChangeText={setDescription}
            />

            <TextInput
              style={styles.input}
              placeholder={`Valor em ${currency} (ex: 45.50)`}
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.categoryLabel}>Categoria:</Text>
            <View style={styles.categoryWrap}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBadge, category === cat && styles.catBadgeActive]}
                  onPress={() => setCategory(cat)}
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
                <Text style={styles.saveBtnText}>Lançar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Detalhes / Edição / Itens da Nota */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalCard}>
            <View style={styles.bottomModalHeader}>
              <Text style={styles.modalTitle}>Detalhe do Gasto</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {isEditing ? (
                <View style={{ paddingTop: 4 }}>
                  <Text style={styles.label}>Descrição</Text>
                  <TextInput
                    style={styles.input}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    placeholder="Descrição"
                    placeholderTextColor="#64748B"
                  />

                  <Text style={styles.label}>Valor ({currency})</Text>
                  <TextInput
                    style={styles.input}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                  />

                  <Text style={styles.label}>Categoria:</Text>
                  <View style={styles.categoryWrap}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catBadge, editCategory === cat && styles.catBadgeActive]}
                        onPress={() => setEditCategory(cat)}
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
                        {savingEdit ? 'Salvando...' : 'Salvar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.detailDesc}>{selectedExpense?.description}</Text>
                  <Text style={styles.detailDate}>Data: {selectedExpense?.expense_date}</Text>

                  <View style={styles.detailAmountCard}>
                    <Text style={styles.detailAmountLabel}>Valor Pago</Text>
                    <Text style={styles.detailAmountVal}>
                      - {currency} {Number(selectedExpense?.amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.topActionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtnEdit}
                      onPress={() => setIsEditing(true)}
                    >
                      <Text style={styles.actionBtnEditText}>✏️ Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtnDelete}
                      onPress={() =>
                        selectedExpense &&
                        handleDeleteExpense(selectedExpense.id, selectedExpense.description)
                      }
                    >
                      <Text style={styles.actionBtnDeleteText}>🗑️ Excluir</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Se for uma NFC-e, lista os produtos */}
                  {selectedExpense?.description.startsWith('NFC-e:') && (
                    <>
                      <Text style={styles.sectionTitle}>ITENS DISCRIMINADOS NA NOTA:</Text>
                      {loadingItems ? (
                        <ActivityIndicator
                          size="small"
                          color="#38BDF8"
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
                                <Text style={styles.discountHighlight}>
                                  🎉 Descontos do mercado:
                                </Text>
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
                            Nenhum item detalhado encontrado para este cupom.
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  <TouchableOpacity
                    style={styles.closeFullBtn}
                    onPress={() => setDetailModalVisible(false)}
                  >
                    <Text style={styles.closeFullBtnText}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Leitor de NFC-e conectado ao Evento */}
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
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  backButtonText: {
    color: '#38BDF8',
    fontSize: 26,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  headerTitleContainer: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', maxWidth: '85%' },
  editTitleIcon: { fontSize: 12 },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  scanButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonIcon: { fontSize: 16 },
  addButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  summarySpent: { color: '#EF4444', fontSize: 22, fontWeight: 'bold' },
  summaryTarget: { color: '#F8FAFC', fontSize: 18, fontWeight: '600' },
  setBudgetBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  setBudgetText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressBar: { height: '100%', borderRadius: 3 },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  listSectionTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: 'bold' },
  listSectionCount: { color: '#64748B', fontSize: 12 },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  expenseDesc: { color: '#F8FAFC', fontSize: 15, fontWeight: '500' },
  expenseSub: { color: '#64748B', fontSize: 12, marginTop: 2 },
  expenseAmount: { color: '#EF4444', fontSize: 15, fontWeight: 'bold' },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 36,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 14 },
  label: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  hintNotice: { color: '#64748B', fontSize: 11, marginBottom: 12, lineHeight: 15 },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 8 },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  catBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  catBadgeActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  catBadgeText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  catBadgeTextActive: { color: '#0F172A' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  saveBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  bottomModalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  bottomModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold', padding: 4 },
  detailDesc: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  detailDate: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  detailAmountCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailAmountLabel: { color: '#94A3B8', fontSize: 12 },
  detailAmountVal: { fontSize: 24, fontWeight: 'bold', color: '#EF4444', marginTop: 2 },
  topActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtnEdit: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
  },
  actionBtnEditText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 13 },
  actionBtnDelete: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
  },
  actionBtnDeleteText: { color: '#EF4444', fontWeight: 'bold', fontSize: 13 },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  itemsList: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  itemName: { color: '#F8FAFC', fontSize: 13, fontWeight: '500' },
  itemSub: { color: '#64748B', fontSize: 11, marginTop: 2 },
  itemTotal: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  discountCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  discountLabel: { color: '#94A3B8', fontSize: 12 },
  discountOriginal: {
    color: '#94A3B8',
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  discountHighlight: { color: '#34D399', fontSize: 13, fontWeight: 'bold' },
  discountValue: { color: '#34D399', fontSize: 13, fontWeight: 'bold' },
  emptyItemsBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyItemsText: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  closeFullBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  closeFullBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 14 },
  metaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  editMetaIcon: {
    fontSize: 10,
  },
});