import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

interface Category {
  id: string;
  name: string;
  type: string;
}

interface RecurringBill {
  id: string;
  description: string;
  amount: number;
  due_day: number;
  type?: 'income' | 'expense';
  category_id: string | null;
  is_active: boolean;
  categories?: { name: string } | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSyncMonth: () => void;
  currentMonthDate?: Date; // Mês selecionado no Dashboard
}

export const RecurringBillsModal: React.FC<Props> = ({
  visible,
  onClose,
  onSyncMonth,
  currentMonthDate = new Date(),
}) => {
  const { user } = useAuth();
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  // Controle de formulário (Criação e Edição)
  const [showForm, setShowForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDayStr, setDueDayStr] = useState('10');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [billType, setBillType] = useState<'expense' | 'income'>('expense');

  useEffect(() => {
    if (visible && user) {
      loadData();
    }
  }, [visible, user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: billsData, error: billsError } = await supabase
        .from('recurring_bills')
        .select('id, description, amount, due_day, category_id, is_active, type, categories(name)')
        .order('due_day', { ascending: true });

      if (billsError) throw billsError;

      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, type')
        .order('name');

      setBills((billsData as unknown as RecurringBill[]) || []);
      setCategories(catData || []);
    } catch (err) {
      console.warn('Erro ao carregar assinaturas:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDesc('');
    setAmountStr('');
    setDueDayStr('10');
    setSelectedCat(null);
    setBillType('expense');
    setEditingBillId(null);
    setShowForm(false);
  };

  const openEdit = (bill: RecurringBill) => {
    setEditingBillId(bill.id);
    setDesc(bill.description);
    setAmountStr(String(bill.amount));
    setDueDayStr(String(bill.due_day));
    setSelectedCat(bill.category_id);
    setBillType(bill.type || 'expense');
    setShowForm(true);
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amountStr.replace(',', '.'));
    const parsedDay = parseInt(dueDayStr, 10);

    if (!desc.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Atenção', 'Informe uma descrição e valor válidos.');
      return;
    }

    if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      Alert.alert('Atenção', 'O dia de vencimento deve estar entre 1 e 31.');
      return;
    }

    try {
      if (editingBillId) {
        const { error } = await supabase
          .from('recurring_bills')
          .update({
            description: desc.trim(),
            amount: parsedAmount,
            due_day: parsedDay,
            category_id: selectedCat,
            type: billType,
          })
          .eq('id', editingBillId);

        if (error) throw error;

        // Atualiza todas as linhas pendentes nos meses seguintes que partilham a descrição anterior
        if (user) {
          const year = currentMonthDate.getFullYear();
          const month = currentMonthDate.getMonth();
          const lastDayOfViewedMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

          await supabase
            .from('transactions')
            .update({
              description: desc.trim(),
              amount: parsedAmount,
              category_id: selectedCat,
            })
            .eq('user_id', user.id)
            .ilike('description', bills.find(b => b.id === editingBillId)?.description.trim() || desc.trim())
            .gt('date', lastDayOfViewedMonth)
            .eq('is_settled', false);
        }

        Alert.alert('Sucesso', 'Assinatura e meses futuros atualizados!');
      }

      resetForm();
      loadData();
      onSyncMonth();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    }
  };

  const toggleActive = async (bill: RecurringBill) => {
    try {
      const nextStatus = !bill.is_active;

      // 1. Atualiza na tabela recurring_bills
      const { error: billError } = await supabase
        .from('recurring_bills')
        .update({ is_active: nextStatus })
        .eq('id', bill.id);

      if (billError) throw billError;

      // 2. Atualiza repeats_monthly nas transações correspondentes
      await supabase
        .from('transactions')
        .update({ repeats_monthly: nextStatus })
        .ilike('description', bill.description.trim());

      // 3. Ao pausar, remove de imediato os lançamentos pendentes posteriores ao mês visível no Dashboard
      if (!nextStatus && user) {
        const year = currentMonthDate.getFullYear();
        const month = currentMonthDate.getMonth();
        const lastDayOfViewedMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

        await supabase
          .from('transactions')
          .delete()
          .eq('user_id', user.id)
          .ilike('description', bill.description.trim())
          .gt('date', lastDayOfViewedMonth)
          .eq('is_settled', false);
      }

      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, is_active: nextStatus } : b))
      );

      onSyncMonth();

      Alert.alert(
        'Assinatura Atualizada',
        nextStatus
          ? `"${bill.description}" foi reativada para os próximos meses.`
          : `"${bill.description}" foi pausada e os registos pendentes futuros foram removidos.`
      );
    } catch (err: any) {
      console.warn('Erro ao alternar assinatura:', err);
      Alert.alert('Erro', err.message);
    }
  };

  const deleteBill = (id: string, name: string) => {
    Alert.alert(
      'Remover Assinatura',
      `Deseja remover permanentemente "${name}" e limpar as cobranças pendentes futuras?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('recurring_bills').delete().eq('id', id);

              if (user) {
                const year = currentMonthDate.getFullYear();
                const month = currentMonthDate.getMonth();
                const lastDayOfViewedMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

                await supabase
                  .from('transactions')
                  .delete()
                  .eq('user_id', user.id)
                  .ilike('description', name.trim())
                  .gt('date', lastDayOfViewedMonth)
                  .eq('is_settled', false);
              }

              setBills((prev) => prev.filter((b) => b.id !== id));
              onSyncMonth();
            } catch (err: any) {
              Alert.alert('Erro ao remover', err.message);
            }
          },
        },
      ]
    );
  };

  const uniqueCategories = categories
    .filter((c) => c.type === billType)
    .filter((cat, index, self) => index === self.findIndex((t) => t.name === cat.name));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Assinaturas & Contas Fixas</Text>
              <Text style={styles.subtitle}>Despesas e receitas automáticas mensais</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {showForm ? (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.formContainer}>
              <Text style={styles.formTitle}>
                {editingBillId ? 'Editar Conta Fixa' : 'Nova Conta / Assinatura'}
              </Text>

              {/* Seletor Tipo: Despesa vs Receita */}
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeBtn, billType === 'expense' && styles.typeBtnActiveExpense]}
                  onPress={() => {
                    setBillType('expense');
                    setSelectedCat(null);
                  }}
                >
                  <Text style={styles.typeBtnText}>Despesa</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, billType === 'income' && styles.typeBtnActiveIncome]}
                  onPress={() => {
                    setBillType('income');
                    setSelectedCat(null);
                  }}
                >
                  <Text style={styles.typeBtnText}>Receita</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                placeholder="Descrição (ex: Academia, Netflix, Salário)"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={desc}
                onChangeText={setDesc}
              />

              <View style={styles.row}>
                <View style={{ flex: 1.2, marginRight: 8 }}>
                  <Text style={styles.label}>Valor (R$)</Text>
                  <TextInput
                    placeholder="0,00"
                    placeholderTextColor="#64748B"
                    keyboardType="decimal-pad"
                    style={styles.input}
                    value={amountStr}
                    onChangeText={setAmountStr}
                  />
                </View>

                <View style={{ flex: 0.8 }}>
                  <Text style={styles.label}>Dia Vencimento</Text>
                  <TextInput
                    placeholder="10"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    maxLength={2}
                    style={styles.input}
                    value={dueDayStr}
                    onChangeText={setDueDayStr}
                  />
                </View>
              </View>

              <Text style={styles.label}>Categoria no Orçamento:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {uniqueCategories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, selectedCat === c.id && styles.catChipActive]}
                    onPress={() => setSelectedCat(c.id)}
                  >
                    <Text style={[styles.catChipText, selectedCat === c.id && styles.catChipTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelFormBtn} onPress={resetForm}>
                  <Text style={styles.cancelFormText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveFormBtn} onPress={handleSave}>
                  <Text style={styles.saveFormText}>
                    {editingBillId ? 'Atualizar' : 'Adicionar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <FlatList
                data={bills}
                keyExtractor={(item) => item.id}
                style={styles.list}
                renderItem={({ item }) => (
                  <View style={[styles.billItem, !item.is_active && styles.billItemInactive]}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingRight: 8 }}
                      onPress={() => openEdit(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.billDesc, !item.is_active && styles.textInactive]}>
                        {item.description}
                      </Text>
                      <Text style={styles.billSub}>
                        Todo dia {item.due_day} • {item.categories?.name || 'Geral'} ✏️
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.billRight}>
                      <Text style={[
                        styles.billAmount,
                        { color: item.type === 'income' ? '#10B981' : '#EF4444' },
                        !item.is_active && styles.textInactive
                      ]}>
                        {item.type === 'income' ? '+ ' : '- '}R$ {Number(item.amount).toFixed(2).replace('.', ',')}
                      </Text>

                      <View style={styles.billActionsRow}>
                        <TouchableOpacity
                          style={[styles.statusToggle, item.is_active ? styles.statusActive : styles.statusDisabled]}
                          onPress={() => toggleActive(item)}
                        >
                          <Text style={[styles.statusToggleText, item.is_active ? styles.textActive : styles.textDisabled]}>
                            {item.is_active ? 'Ativa' : 'Pausada'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => deleteBill(item.id, item.description)}
                        >
                          <Text style={styles.deleteBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Nenhuma conta fixa cadastrada.</Text>
                    <Text style={styles.emptySubText}>
                      Cadastre assinaturas e contas que se repetem todos os meses para entrar no extrato automaticamente.
                    </Text>
                  </View>
                }
              />

              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.newBillBtn}
                  onPress={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                >
                  <Text style={styles.newBillBtnText}>+ Adicionar Assinatura</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={() => {
                    onSyncMonth();
                    onClose();
                  }}
                >
                  <Text style={styles.syncBtnText}>⚡ Sincronizar Mês</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: { padding: 6 },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  list: { maxHeight: 380, marginBottom: 12 },
  billItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  billItemInactive: { opacity: 0.5 },
  billDesc: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold' },
  billSub: { color: '#64748B', fontSize: 11, marginTop: 2 },
  billRight: { alignItems: 'flex-end' },
  billAmount: { fontSize: 14, fontWeight: 'bold' },
  billActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusToggle: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusActive: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  statusDisabled: { backgroundColor: 'rgba(100, 116, 139, 0.2)' },
  statusToggleText: { fontSize: 10, fontWeight: '700' },
  textActive: { color: '#34D399' },
  textDisabled: { color: '#94A3B8' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 12 },
  textInactive: { color: '#64748B' },
  emptyContainer: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: 'bold' },
  emptySubText: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  newBillBtn: {
    flex: 1.2,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  newBillBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  syncBtn: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  syncBtnText: { color: '#34D399', fontWeight: 'bold', fontSize: 13 },
  formContainer: { paddingVertical: 6 },
  formTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 3,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  typeBtnActiveExpense: { backgroundColor: '#EF4444' },
  typeBtnActiveIncome: { backgroundColor: '#10B981' },
  typeBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 12 },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  row: { flexDirection: 'row' },
  label: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catChipActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  catChipText: { color: '#94A3B8', fontSize: 12 },
  catChipTextActive: { color: '#0F172A', fontWeight: 'bold' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 },
  cancelFormBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  cancelFormText: { color: '#F8FAFC', fontWeight: 'bold' },
  saveFormBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  saveFormText: { color: '#F8FAFC', fontWeight: 'bold' },
});