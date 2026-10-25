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

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentMonthDate?: Date; // Mês selecionado no Dashboard
}

export const NewTransactionModal: React.FC<Props> = ({
  visible,
  onClose,
  onSuccess,
  currentMonthDate = new Date(),
}) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<'needs' | 'wants' | 'savings'>('needs');
  const [isSettled, setIsSettled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [repeatsMonthly, setRepeatsMonthly] = useState(false);

  // Terceiros / Origem
  const [isForSomeone, setIsForSomeone] = useState(false);
  const [personName, setPersonName] = useState('');
  const [splitStatus, setSplitStatus] = useState<'gift' | 'pending' | 'settled'>('pending');

  useEffect(() => {
    if (visible && user) {
      loadFormData();
    }
  }, [visible, user]);

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

  const resetForm = () => {
    setDescription('');
    setAmount('');
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

    // 📴 MODO OFFLINE: Se não houver internet, enfileira localmente
    if (!isOnline) {
      await enqueueOfflineAction('transactions', payload);
      setLoading(false);
      resetForm();
      Alert.alert(
        'Lançamento Offline 📴',
        'Está sem ligação à rede. O lançamento foi gravado no telemóvel e será sincronizado assim que a internet regressar.'
      );
      onSuccess();
      onClose();
      return;
    }

    // 🌐 MODO ONLINE: Insere no Supabase
    try {
      const { error: txError } = await supabase
        .from('transactions')
        .insert(payload)
        .select()
        .single();

      if (txError) throw txError;

      // Se marcou para repetir, registra/atualiza na tabela recurring_bills
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
          const { error: updErr } = await supabase
            .from('recurring_bills')
            .update(billPayload)
            .eq('id', existingBill.id);
          if (updErr) console.warn('Erro ao atualizar recurring_bills:', updErr.message);
        } else {
          const { error: insErr } = await supabase
            .from('recurring_bills')
            .insert(billPayload);
          if (insErr) {
            console.warn('Erro ao inserir em recurring_bills:', insErr.message);
            Alert.alert('Aviso', `O lançamento foi criado, mas houve um erro ao registrar a repetição: ${insErr.message}`);
          }
        }
      }

      setLoading(false);
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      // Se a conexão oscilou durante a requisição, salva na fila offline
      await enqueueOfflineAction('transactions', payload);
      setLoading(false);
      resetForm();
      Alert.alert(
        'Lançamento Offline 📴',
        'A ligação oscilou no momento do envio, mas o registo foi guardado localmente e será sincronizado automaticamente.'
      );
      onSuccess();
      onClose();
    }
  };

  // Remove categorias com nomes repetidos
  const filteredCategories = categories
    .filter((c) => c.type === type)
    .filter((cat, index, self) => index === self.findIndex((t) => t.name === cat.name));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Novo Lançamento</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Seletor Despesa / Receita */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'expense' && styles.typeBtnActiveExpense]}
                onPress={() => {
                  setType('expense');
                  setSelectedCategory(null);
                }}
              >
                <Text style={styles.typeText}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'income' && styles.typeBtnActiveIncome]}
                onPress={() => {
                  setType('income');
                  setSelectedCategory(null);
                  setIsForSomeone(false);
                }}
              >
                <Text style={styles.typeText}>Receita</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Descrição (ex: Supermercado, Almoço)"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={description}
              onChangeText={setDescription}
            />

            <TextInput
              placeholder="Valor (R$)"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
            />

            {/* Atribuição da Regra 50/30/20 (Apenas para Despesas) */}
            {type === 'expense' && (
              <View style={styles.bucketSection}>
                <Text style={styles.label}>Atribuir à regra orçamental (50/30/20):</Text>
                <View style={styles.bucketRow}>
                  <TouchableOpacity
                    style={[
                      styles.bucketBtn,
                      selectedBucket === 'needs' && styles.bucketNeedsActive,
                    ]}
                    onPress={() => setSelectedBucket('needs')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.bucketText,
                        selectedBucket === 'needs' && styles.bucketTextActive,
                      ]}
                    >
                      Necessidades{'\n'}(50%)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.bucketBtn,
                      selectedBucket === 'wants' && styles.bucketWantsActive,
                    ]}
                    onPress={() => setSelectedBucket('wants')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.bucketText,
                        selectedBucket === 'wants' && styles.bucketTextActive,
                      ]}
                    >
                      Desejos{'\n'}(30%)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.bucketBtn,
                      selectedBucket === 'savings' && styles.bucketSavingsActive,
                    ]}
                    onPress={() => setSelectedBucket('savings')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.bucketText,
                        selectedBucket === 'savings' && styles.bucketTextActive,
                      ]}
                    >
                      Reserva{'\n'}(20%)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Seleção de Categoria */}
            <Text style={styles.label}>Categoria:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {filteredCategories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.catChip,
                    selectedCategory === c.id && styles.catChipActive,
                  ]}
                  onPress={() => handleCategorySelect(c)}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      selectedCategory === c.id && styles.catChipTextActive,
                    ]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Repetir automaticamente */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setRepeatsMonthly(!repeatsMonthly)}
            >
              <View style={[styles.checkbox, repeatsMonthly && styles.checkboxChecked]} />
              <Text style={styles.checkboxLabel}>🔁 Repetir automaticamente nos meses seguintes</Text>
            </TouchableOpacity>

            {/* Terceiros (Despesa vs Receita) */}
            {type === 'expense' ? (
              <View style={styles.splitSection}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setIsForSomeone(!isForSomeone)}
                >
                  <View style={[styles.checkbox, isForSomeone && styles.checkboxChecked]} />
                  <Text style={styles.checkboxLabel}>👤 Gastei para outra pessoa?</Text>
                </TouchableOpacity>

                {isForSomeone && (
                  <View style={styles.splitOptionsBox}>
                    <TextInput
                      placeholder="Nome da pessoa (ex: Mãe, Letícia)"
                      placeholderTextColor="#64748B"
                      style={styles.inputPerson}
                      value={personName}
                      onChangeText={setPersonName}
                    />

                    <Text style={styles.splitSubLabel}>Situação do acerto:</Text>
                    <View style={styles.splitStatusRow}>
                      <TouchableOpacity
                        style={[styles.splitStatusBtn, splitStatus === 'gift' && styles.splitStatusBtnActiveGift]}
                        onPress={() => setSplitStatus('gift')}
                      >
                        <Text style={[styles.splitStatusText, splitStatus === 'gift' && styles.splitStatusTextActive]}>
                          🎁 Paguei p/ ela
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.splitStatusBtn, splitStatus === 'pending' && styles.splitStatusBtnActivePending]}
                        onPress={() => setSplitStatus('pending')}
                      >
                        <Text style={[styles.splitStatusText, splitStatus === 'pending' && styles.splitStatusTextActive]}>
                          ⏳ Vai me pagar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.splitStatusBtn, splitStatus === 'settled' && styles.splitStatusBtnActiveSettled]}
                        onPress={() => setSplitStatus('settled')}
                      >
                        <Text style={[styles.splitStatusText, splitStatus === 'settled' && styles.splitStatusTextActive]}>
                          ✅ Já pagou
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
                >
                  <View style={[styles.checkbox, isForSomeone && styles.checkboxChecked]} />
                  <Text style={styles.checkboxLabel}>📥 Informar a origem / quem enviou?</Text>
                </TouchableOpacity>

                {isForSomeone && (
                  <View style={styles.splitOptionsBox}>
                    <TextInput
                      placeholder="Quem pagou (ex: Empresa X, João Pix)"
                      placeholderTextColor="#64748B"
                      style={styles.inputPerson}
                      value={personName}
                      onChangeText={setPersonName}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Transação Efetivada */}
            <TouchableOpacity
              style={[styles.checkboxRow, { marginTop: 6 }]}
              onPress={() => setIsSettled(!isSettled)}
            >
              <View style={[styles.checkbox, isSettled && styles.checkboxChecked]} />
              <Text style={styles.checkboxLabel}>
                {isSettled ? 'Transação já efetivada no extrato' : 'Pendente (marcar no checklist do mês)'}
              </Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={loading}
              >
                <Text style={styles.saveText}>{loading ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 14, textAlign: 'center' },
  typeSelector: { flexDirection: 'row', marginBottom: 14, backgroundColor: '#0F172A', borderRadius: 8, padding: 4 },
  typeBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 6 },
  typeBtnActiveExpense: { backgroundColor: '#EF4444' },
  typeBtnActiveIncome: { backgroundColor: '#10B981' },
  typeText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 12, borderRadius: 8, fontSize: 15, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  label: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  bucketSection: { marginVertical: 4 },
  bucketRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bucketBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bucketNeedsActive: { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38BDF8' },
  bucketWantsActive: { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: '#F59E0B' },
  bucketSavingsActive: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: '#10B981' },
  bucketText: { color: '#94A3B8', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  bucketTextActive: { color: '#F8FAFC', fontWeight: 'bold' },
  catScroll: { marginBottom: 12 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#0F172A', borderRadius: 18, marginRight: 6, borderWidth: 1, borderColor: '#334155' },
  catChipActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  catChipText: { color: '#94A3B8', fontSize: 12 },
  catChipTextActive: { color: '#0F172A', fontWeight: 'bold' },
  splitSection: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  splitOptionsBox: { marginTop: 8 },
  inputPerson: { backgroundColor: '#1E293B', color: '#F8FAFC', padding: 10, borderRadius: 8, fontSize: 14, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  splitSubLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 6 },
  splitStatusRow: { flexDirection: 'row', gap: 4 },
  splitStatusBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, backgroundColor: '#1E293B', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  splitStatusBtnActiveGift: { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38BDF8' },
  splitStatusBtnActivePending: { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: '#F59E0B' },
  splitStatusBtnActiveSettled: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: '#10B981' },
  splitStatusText: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  splitStatusTextActive: { color: '#F8FAFC', fontWeight: 'bold' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#64748B', marginRight: 8 },
  checkboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkboxLabel: { color: '#CBD5E1', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center' },
  cancelText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center' },
  saveText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
});