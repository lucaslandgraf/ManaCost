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
import { Feather } from '@expo/vector-icons';
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
  currentMonthDate?: Date;
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
      Alert.alert('Atenção', 'O dia de vencimento deve situar-se entre 1 e 31.');
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
      Alert.alert('Erro ao guardar', err.message);
    }
  };

  const toggleActive = async (bill: RecurringBill) => {
    try {
      const nextStatus = !bill.is_active;

      const { error: billError } = await supabase
        .from('recurring_bills')
        .update({ is_active: nextStatus })
        .eq('id', bill.id);

      if (billError) throw billError;

      await supabase
        .from('transactions')
        .update({ repeats_monthly: nextStatus })
        .ilike('description', bill.description.trim());

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
          : `"${bill.description}" foi pausada e os registos pendentes futuros foram eliminados.`
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
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Assinaturas & Contas Fixas</Text>
              <Text style={styles.subtitle}>Despesas e receitas automáticas mensais</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {showForm ? (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.formContainer}>
              <Text style={styles.formTitle}>
                {editingBillId ? 'Editar Conta Recorrente' : 'Nova Assinatura Fixa'}
              </Text>

              {/* Seletor Despesa vs Receita */}
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeBtn, billType === 'expense' && styles.typeBtnActiveExpense]}
                  onPress={() => {
                    setBillType('expense');
                    setSelectedCat(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="minus" size={13} color={billType === 'expense' ? '#F87171' : '#64748B'} style={{ marginRight: 4 }} />
                  <Text style={[styles.typeBtnText, billType === 'expense' && styles.typeBtnTextActive]}>
                    Despesa
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, billType === 'income' && styles.typeBtnActiveIncome]}
                  onPress={() => {
                    setBillType('income');
                    setSelectedCat(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="plus" size={13} color={billType === 'income' ? '#10B981' : '#64748B'} style={{ marginRight: 4 }} />
                  <Text style={[styles.typeBtnText, billType === 'income' && styles.typeBtnTextActive]}>
                    Receita
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
              <TextInput
                placeholder="Ex: Aluguer, Ginásio, Internet, Salário"
                placeholderTextColor="#64748B"
                style={styles.input}
                value={desc}
                onChangeText={setDesc}
              />

              <View style={styles.row}>
                <View style={{ flex: 1.2, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>VALOR (R$)</Text>
                  <TextInput
                    placeholder="0,00"
                    placeholderTextColor="#64748B"
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.inputBold]}
                    value={amountStr}
                    onChangeText={setAmountStr}
                  />
                </View>

                <View style={{ flex: 0.8 }}>
                  <Text style={styles.fieldLabel}>DIA VENCIMENTO</Text>
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

              <Text style={styles.fieldLabel}>CATEGORIA NO ORÇAMENTO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {uniqueCategories.map((c) => {
                  const isSelected = selectedCat === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catChip, isSelected && styles.catChipActive]}
                      onPress={() => setSelectedCat(c.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelFormBtn} onPress={resetForm} activeOpacity={0.7}>
                  <Text style={styles.cancelFormText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveFormBtn} onPress={handleSave} activeOpacity={0.8}>
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
                showsVerticalScrollIndicator={false}
                style={styles.list}
                renderItem={({ item }) => (
                  <View style={[styles.billCard, !item.is_active && styles.billCardInactive]}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingRight: 8 }}
                      onPress={() => openEdit(item)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.billDesc, !item.is_active && styles.textInactive]} numberOfLines={1}>
                          {item.description}
                        </Text>
                        <Feather name="edit-2" size={11} color="#64748B" />
                      </View>
                      <Text style={styles.billSub}>
                        Todo dia {item.due_day} • {item.categories?.name || 'Geral'}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.billRight}>
                      <Text style={[
                        styles.billAmount,
                        { color: item.type === 'income' ? '#34D399' : '#F8FAFC' },
                        !item.is_active && styles.textInactive
                      ]}>
                        {item.type === 'income' ? '+ ' : '- '}R$ {Number(item.amount).toFixed(2).replace('.', ',')}
                      </Text>

                      <View style={styles.billActionsRow}>
                        <TouchableOpacity
                          style={[styles.statusToggle, item.is_active ? styles.statusActive : styles.statusDisabled]}
                          onPress={() => toggleActive(item)}
                          activeOpacity={0.7}
                        >
                          <Feather 
                            name={item.is_active ? 'check' : 'pause'} 
                            size={10} 
                            color={item.is_active ? '#34D399' : '#94A3B8'} 
                            style={{ marginRight: 3 }} 
                          />
                          <Text style={[styles.statusToggleText, item.is_active ? styles.textActive : styles.textDisabled]}>
                            {item.is_active ? 'Ativa' : 'Pausada'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => deleteBill(item.id, item.description)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Feather name="trash-2" size={13} color="#F87171" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Feather name="repeat" size={28} color="#64748B" style={{ marginBottom: 6 }} />
                    <Text style={styles.emptyText}>Nenhuma conta fixa registada.</Text>
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
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={14} color="#0B0F19" style={{ marginRight: 4 }} />
                  <Text style={styles.newBillBtnText}>Nova Assinatura</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={() => {
                    onSyncMonth();
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="zap" size={13} color="#38BDF8" style={{ marginRight: 4 }} />
                  <Text style={styles.syncBtnText}>Sincronizar Mês</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
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
  subtitle: {
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
  list: {
    maxHeight: 380,
    marginBottom: 12,
  },
  billCard: {
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
  billCardInactive: {
    opacity: 0.5,
  },
  billDesc: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  billSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  billRight: {
    alignItems: 'flex-end',
  },
  billAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  billActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusDisabled: {
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
  },
  statusToggleText: {
    fontSize: 9,
    fontWeight: '700',
  },
  textActive: {
    color: '#34D399',
  },
  textDisabled: {
    color: '#94A3B8',
  },
  deleteBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },
  textInactive: {
    color: '#64748B',
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  emptySubText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  newBillBtn: {
    flex: 1.2,
    flexDirection: 'row',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBillBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  formContainer: {
    paddingVertical: 4,
  },
  formTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#131927',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  typeBtnActiveExpense: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
  },
  typeBtnActiveIncome: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  typeBtnText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 12,
  },
  typeBtnTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
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
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  inputBold: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#131927',
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  catChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  catChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  catChipTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  cancelFormBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#131927',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelFormText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  saveFormBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  saveFormText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
});