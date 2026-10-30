import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { checkIsOnline, enqueueOfflineAction } from '../../services/offlineSync';

interface Category {
  id: string;
  name: string;
  type: string;
  rule_group?: string;
}

interface Account {
  id: string;
  name: string;
}

interface BudgetRules {
  useFixed: boolean;
  needs: number;
  wants: number;
  savings: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentMonthDate?: Date;
  initialType?: 'expense' | 'income';
  onOpenSettings?: () => void;
}

export const NewTransactionModal: React.FC<Props> = ({
  visible,
  onClose,
  onSuccess,
  currentMonthDate = new Date(),
  initialType = 'expense',
  onOpenSettings,
}) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>(initialType);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<'needs' | 'wants' | 'savings'>('needs');
  const [isSettled, setIsSettled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [repeatsMonthly, setRepeatsMonthly] = useState(false);

  // Metas do Perfil dinâmicas
  const [budgetRules, setBudgetRules] = useState<BudgetRules>({
    useFixed: false,
    needs: 50,
    wants: 30,
    savings: 20,
  });

  // Terceiros / Rateio
  const [isForSomeone, setIsForSomeone] = useState(false);
  const [personName, setPersonName] = useState('');
  const [splitStatus, setSplitStatus] = useState<'gift' | 'pending' | 'settled'>('pending');

  useEffect(() => {
    if (visible) {
      setType(initialType);
      resetForm(initialType);
      if (user) {
        loadFormData();
        loadProfileRules();
      }
    }
  }, [visible, initialType, user]);

  const loadProfileRules = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('use_fixed_targets, rule_needs_pct, rule_wants_pct, rule_savings_pct, fixed_needs_val, fixed_wants_val, fixed_savings_val')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setBudgetRules({
          useFixed: Boolean(data.use_fixed_targets),
          needs: data.use_fixed_targets ? Number(data.fixed_needs_val ?? 0) : Number(data.rule_needs_pct ?? 50),
          wants: data.use_fixed_targets ? Number(data.fixed_wants_val ?? 0) : Number(data.rule_wants_pct ?? 30),
          savings: data.use_fixed_targets ? Number(data.fixed_savings_val ?? 0) : Number(data.rule_savings_pct ?? 20),
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar regras de orçamento no modal:', e);
    }
  };

  const loadFormData = async () => {
    const { data: catData } = await supabase
      .from('categories')
      .select('id, name, type, rule_group')
      .order('name');

    const { data: accData } = await supabase
      .from('accounts')
      .select('id, name')
      .order('name');

    if (catData) setCategories(catData);
    if (accData) {
      setAccounts(accData);
      if (accData.length > 0) setSelectedAccount(accData[0].id);
    }
  };

  const resetForm = (defaultType: 'expense' | 'income' = initialType) => {
    setDescription('');
    setAmount('');
    setType(defaultType);
    setSelectedCategory(null);
    setSelectedBucket('needs');
    setIsForSomeone(false);
    setPersonName('');
    setSplitStatus('pending');
    setIsSettled(true);
    setRepeatsMonthly(false);
  };

  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat.id);
    if (cat.rule_group) {
      if (cat.rule_group === 'needs_50') setSelectedBucket('needs');
      else if (cat.rule_group === 'wants_30') setSelectedBucket('wants');
      else if (cat.rule_group === 'savings_20') setSelectedBucket('savings');
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Atenção', 'Informe uma descrição e valor válidos.');
      return;
    }

    if (isForSomeone && !personName.trim()) {
      Alert.alert('Atenção', 'Informe o nome da pessoa ou origem.');
      return;
    }

    setLoading(true);

    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const todayDay = new Date().getDate();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const validDay = Math.min(todayDay, lastDayOfMonth);
    const targetDate = new Date(year, month, validDay).toISOString().split('T')[0];

    const finalSpentFor = isForSomeone ? personName.trim() : null;

    const payload: any = {
      user_id: user?.id,
      description: description.trim(),
      amount: parsedAmount,
      type,
      category_id: selectedCategory,
      account_id: selectedAccount,
      budget_bucket: type === 'expense' ? selectedBucket : null,
      is_settled: isSettled,
      date: targetDate,
      spent_for_name: finalSpentFor,
      split_status: isForSomeone ? (type === 'income' ? 'none' : splitStatus) : 'none',
      repeats_monthly: repeatsMonthly,
    };

    const isOnline = await checkIsOnline();

    if (!isOnline) {
      await enqueueOfflineAction('transactions', payload);
      setLoading(false);
      resetForm(type);
      Alert.alert(
        'Lançamento Offline',
        'Sem ligação à rede no momento. O registo foi guardado localmente e será enviado quando a ligação regressar.'
      );
      onSuccess();
      onClose();
      return;
    }

    try {
      const { error: txError } = await supabase
        .from('transactions')
        .insert(payload)
        .select()
        .single();

      if (txError) throw txError;

      if (repeatsMonthly && user?.id) {
        const billPayload = {
          user_id: user.id,
          description: description.trim(),
          amount: parsedAmount,
          due_day: validDay,
          category_id: selectedCategory || null,
          type: type,
          spent_for_name: finalSpentFor,
          is_active: true,
        };

        const { data: existingBill } = await supabase
          .from('recurring_bills')
          .select('id')
          .eq('user_id', user.id)
          .ilike('description', description.trim())
          .maybeSingle();

        if (existingBill) {
          await supabase
            .from('recurring_bills')
            .update(billPayload)
            .eq('id', existingBill.id);
        } else {
          await supabase
            .from('recurring_bills')
            .insert(billPayload);
        }
      }

      setLoading(false);
      resetForm(type);
      onSuccess();
      onClose();
    } catch (err: any) {
      await enqueueOfflineAction('transactions', payload);
      setLoading(false);
      resetForm(type);
      Alert.alert(
        'Lançamento Offline',
        'A ligação oscilou, mas o registo foi preservado no dispositivo com segurança.'
      );
      onSuccess();
      onClose();
    }
  };

  const handlePressSettings = () => {
    onClose();
    if (onOpenSettings) {
      setTimeout(() => {
        onOpenSettings();
      }, 300);
    }
  };

  const filteredCategories = categories
    .filter((c) => c.type === type)
    .filter((cat, index, self) => index === self.findIndex((t) => t.name === cat.name));

  const formatSub = (val: number) => {
    return budgetRules.useFixed ? `R$ ${val}` : `${val}%`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Barra de Arraste Superior */}
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <Text style={styles.title}>Novo Lançamento</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Seletor Segmentado: Despesa vs Receita */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnActiveExpense]}
                onPress={() => {
                  setType('expense');
                  setSelectedCategory(null);
                }}
                activeOpacity={0.7}
              >
                <Feather name="minus" size={13} color={type === 'expense' ? '#F87171' : '#64748B'} style={{ marginRight: 4 }} />
                <Text style={[styles.typeText, type === 'expense' && styles.typeTextActive]}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'income' && styles.typeBtnActiveIncome]}
                onPress={() => {
                  setType('income');
                  setSelectedCategory(null);
                  setIsForSomeone(false);
                }}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={13} color={type === 'income' ? '#10B981' : '#64748B'} style={{ marginRight: 4 }} />
                <Text style={[styles.typeText, type === 'income' && styles.typeTextActive]}>Receita</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
            <TextInput
              placeholder="Ex: Supermercado, Aluguel, Uber"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.fieldLabel}>VALOR (R$)</Text>
            <TextInput
              placeholder="0,00"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              style={[styles.input, styles.inputAmount]}
              value={amount}
              onChangeText={setAmount}
            />

            {/* Atribuição da Regra Orçamentária com Redirecionamento */}
            {type === 'expense' && (
              <View style={styles.bucketSection}>
                <TouchableOpacity
                  style={styles.bucketHeaderTouchable}
                  onPress={handlePressSettings}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={styles.fieldLabelNoMargin}>
                      REGRA ORÇAMENTAL ({budgetRules.useFixed ? 'R$ FIXO' : `${budgetRules.needs} • ${budgetRules.wants} • ${budgetRules.savings}`})
                    </Text>
                    <Feather name="edit-2" size={10} color="#10B981" />
                  </View>
                  <Text style={styles.editConfigHint}>Ajustar metas</Text>
                </TouchableOpacity>

                <View style={styles.bucketRow}>
                  <TouchableOpacity
                    style={[
                      styles.bucketBtn,
                      selectedBucket === 'needs' && styles.bucketNeedsActive,
                    ]}
                    onPress={() => setSelectedBucket('needs')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bucketTitle, selectedBucket === 'needs' && styles.bucketTitleActive]}>
                      Necessidades
                    </Text>
                    <Text style={styles.bucketSub}>{formatSub(budgetRules.needs)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.bucketBtn,
                      selectedBucket === 'wants' && styles.bucketWantsActive,
                    ]}
                    onPress={() => setSelectedBucket('wants')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bucketTitle, selectedBucket === 'wants' && styles.bucketTitleActive]}>
                      Desejos
                    </Text>
                    <Text style={styles.bucketSub}>{formatSub(budgetRules.wants)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.bucketBtn,
                      selectedBucket === 'savings' && styles.bucketSavingsActive,
                    ]}
                    onPress={() => setSelectedBucket('savings')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bucketTitle, selectedBucket === 'savings' && styles.bucketTitleActive]}>
                      Reserva
                    </Text>
                    <Text style={styles.bucketSub}>{formatSub(budgetRules.savings)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Seleção de Categoria em Chips */}
            <Text style={styles.fieldLabel}>CATEGORIA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {filteredCategories.map((c) => {
                const isSelected = selectedCategory === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, isSelected && styles.catChipActive]}
                    onPress={() => handleCategorySelect(c)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Repetir Mensalmente */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setRepeatsMonthly(!repeatsMonthly)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, repeatsMonthly && styles.checkboxChecked]}>
                {repeatsMonthly && <Feather name="check" size={11} color="#0B0F19" />}
              </View>
              <Feather name="repeat" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
              <Text style={styles.checkboxLabel}>Repetir automaticamente todos os meses</Text>
            </TouchableOpacity>

            {/* Rateio com Terceiros */}
            {type === 'expense' ? (
              <View style={styles.splitSection}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsForSomeone(!isForSomeone)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, isForSomeone && styles.checkboxChecked]}>
                    {isForSomeone && <Feather name="check" size={11} color="#0B0F19" />}
                  </View>
                  <Feather name="user" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text style={styles.checkboxLabel}>Despesa dividida ou para terceiro</Text>
                </TouchableOpacity>

                {isForSomeone && (
                  <View style={styles.splitOptionsBox}>
                    <TextInput
                      placeholder="Nome da pessoa (ex: Letícia, Amigo)"
                      placeholderTextColor="#64748B"
                      style={styles.inputPerson}
                      value={personName}
                      onChangeText={setPersonName}
                    />

                    <Text style={styles.splitSubLabel}>Estado do acerto:</Text>
                    <View style={styles.splitStatusRow}>
                      <TouchableOpacity
                        style={[styles.splitStatusBtn, splitStatus === 'gift' && styles.splitStatusBtnActive]}
                        onPress={() => setSplitStatus('gift')}
                        activeOpacity={0.7}
                      >
                        <Feather name="gift" size={11} color={splitStatus === 'gift' ? '#38BDF8' : '#64748B'} style={{ marginBottom: 2 }} />
                        <Text style={[styles.splitStatusText, splitStatus === 'gift' && styles.splitStatusTextActive]}>
                          Oferecido
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.splitStatusBtn, splitStatus === 'pending' && styles.splitStatusBtnActivePending]}
                        onPress={() => setSplitStatus('pending')}
                        activeOpacity={0.7}
                      >
                        <Feather name="clock" size={11} color={splitStatus === 'pending' ? '#F59E0B' : '#64748B'} style={{ marginBottom: 2 }} />
                        <Text style={[styles.splitStatusText, splitStatus === 'pending' && styles.splitStatusTextActivePending]}>
                          Pendente
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.splitStatusBtn, splitStatus === 'settled' && styles.splitStatusBtnActiveSettled]}
                        onPress={() => setSplitStatus('settled')}
                        activeOpacity={0.7}
                      >
                        <Feather name="check-circle" size={11} color={splitStatus === 'settled' ? '#10B981' : '#64748B'} style={{ marginBottom: 2 }} />
                        <Text style={[styles.splitStatusText, splitStatus === 'settled' && styles.splitStatusTextActiveSettled]}>
                          Acertado
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.splitSection}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsForSomeone(!isForSomeone)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, isForSomeone && styles.checkboxChecked]}>
                    {isForSomeone && <Feather name="check" size={11} color="#0B0F19" />}
                  </View>
                  <Feather name="arrow-down-left" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text style={styles.checkboxLabel}>Informar pagador ou origem</Text>
                </TouchableOpacity>

                {isForSomeone && (
                  <View style={styles.splitOptionsBox}>
                    <TextInput
                      placeholder="Quem efetuou o pagamento (ex: Empresa X, João)"
                      placeholderTextColor="#64748B"
                      style={styles.inputPerson}
                      value={personName}
                      onChangeText={setPersonName}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Efetivado ou Pendente */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setIsSettled(!isSettled)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, isSettled && styles.checkboxChecked]}>
                {isSettled && <Feather name="check" size={11} color="#0B0F19" />}
              </View>
              <Text style={styles.checkboxLabel}>
                {isSettled ? 'Lançamento já efetivado' : 'Deixar pendente no extrato'}
              </Text>
            </TouchableOpacity>

            {/* Botões de Ação */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.saveText}>{loading ? 'A guardar...' : 'Guardar Lançamento'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 14,
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
  typeText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 12,
  },
  typeTextActive: {
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
  fieldLabelNoMargin: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  bucketHeaderTouchable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 4,
  },
  editConfigHint: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#131927',
    color: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  inputAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  bucketSection: {
    marginBottom: 8,
  },
  bucketRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  bucketBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  bucketNeedsActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  bucketWantsActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  bucketSavingsActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  bucketTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  bucketTitleActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  bucketSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  catScroll: {
    marginBottom: 14,
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#131927',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  splitSection: {
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  splitOptionsBox: {
    marginTop: 8,
  },
  inputPerson: {
    backgroundColor: '#0B0F19',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  splitSubLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 6,
  },
  splitStatusRow: {
    flexDirection: 'row',
    gap: 6,
  },
  splitStatusBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  splitStatusBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  splitStatusBtnActivePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  splitStatusBtnActiveSettled: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  splitStatusText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  splitStatusTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  splitStatusTextActivePending: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  splitStatusTextActiveSettled: {
    color: '#10B981',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
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
  cancelText: {
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
  saveText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
});