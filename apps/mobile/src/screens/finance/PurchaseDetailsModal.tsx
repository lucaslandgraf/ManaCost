import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

interface Item {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Category {
  id: string;
  name: string;
  type: string;
  rule_group?: string;
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
  transactionId: string;
  description: string;
  date: string;
  amount: number;
  userMonthlyIncome?: number;
  onUpdated: () => void;
  onDeleted: () => void;
  onOpenSettings?: () => void;
}

export const PurchaseDetailsModal: React.FC<Props> = ({
  visible,
  onClose,
  transactionId,
  description,
  date,
  amount,
  userMonthlyIncome = 0,
  onUpdated,
  onDeleted,
  onOpenSettings,
}) => {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentDesc, setCurrentDesc] = useState(description);
  const [currentAmount, setCurrentAmount] = useState(amount);
  const [currentDate, setCurrentDate] = useState(date);
  const [currentType, setCurrentType] = useState<'expense' | 'income'>('expense');
  const [repeatsMonthly, setRepeatsMonthly] = useState(false);

  const [matchingRecurringBill, setMatchingRecurringBill] = useState<{ id: string; is_active: boolean } | null>(null);

  const [editDesc, setEditDesc] = useState(description);
  const [editAmount, setEditAmount] = useState(amount.toString());
  const [editRepeats, setEditRepeats] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<'needs' | 'wants' | 'savings'>('needs');
  
  const [isForSomeone, setIsForSomeone] = useState(false);
  const [personName, setPersonName] = useState('');
  const [splitStatus, setSplitStatus] = useState<'gift' | 'pending' | 'settled' | 'none'>('pending');

  const [showLifeTime, setShowLifeTime] = useState(false);

  // Metas do perfil dinâmicas
  const [budgetRules, setBudgetRules] = useState<BudgetRules>({
    useFixed: false,
    needs: 50,
    wants: 30,
    savings: 20,
  });

  useEffect(() => {
    if (visible && transactionId) {
      setIsEditing(false);
      setShowLifeTime(false);
      setCurrentDesc(description);
      setCurrentAmount(amount);
      setCurrentDate(date);
      setEditDesc(description);
      setEditAmount(amount.toString());
      fetchTransactionDetails();
      fetchCategories();
      fetchProfileRules();
    }
  }, [visible, transactionId]);

  const fetchProfileRules = async () => {
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
      console.warn('Erro ao carregar regras no modal de detalhe:', e);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('id, name, type, rule_group')
      .order('name');
    setCategories(data || []);
  };

  const fetchTransactionDetails = async () => {
    setLoading(true);
    try {
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*, categories(rule_group)')
        .eq('id', transactionId)
        .single();

      if (txData && !txError) {
        setCurrentDesc(txData.description || description);
        setCurrentAmount(txData.amount || amount);
        setCurrentDate(txData.date || date);
        setCurrentType(txData.type || 'expense');
        setSelectedCatId(txData.category_id || null);
        setRepeatsMonthly(Boolean(txData.repeats_monthly));
        setEditRepeats(Boolean(txData.repeats_monthly));

        setEditDesc(txData.description || description);
        setEditAmount(String(txData.amount || amount));

        if (txData.budget_bucket) {
          setSelectedBucket(txData.budget_bucket);
        } else if (txData.categories?.rule_group) {
          const rule = txData.categories.rule_group;
          if (rule === 'needs_50') setSelectedBucket('needs');
          else if (rule === 'wants_30') setSelectedBucket('wants');
          else if (rule === 'savings_20') setSelectedBucket('savings');
          else setSelectedBucket('needs');
        } else {
          setSelectedBucket('needs');
        }

        if (txData.spent_for_name) {
          setIsForSomeone(true);
          setPersonName(txData.spent_for_name);
          setSplitStatus(txData.split_status || (txData.type === 'income' ? 'none' : 'pending'));
        } else {
          setIsForSomeone(false);
          setPersonName('');
          setSplitStatus(txData.type === 'income' ? 'none' : 'pending');
        }
      }

      const targetName = (txData?.description || description).trim();
      const { data: recBill } = await supabase
        .from('recurring_bills')
        .select('id, is_active')
        .ilike('description', targetName)
        .maybeSingle();

      setMatchingRecurringBill(recBill || null);

      let targetPurchaseId = txData?.purchase_id;
      if (!targetPurchaseId && (txData?.description || description).startsWith('NFC-e:')) {
        const cleanStoreName = (txData?.description || description).replace('NFC-e:', '').trim();
        const txAmount = Number(txData?.amount || amount);

        let query = supabase
          .from('purchases')
          .select('id')
          .ilike('store_name', `%${cleanStoreName}%`);

        if (txAmount > 0) {
          query = query.eq('total_amount', txAmount);
        }

        const { data: matchedPurchase } = await query
          .order('purchase_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        targetPurchaseId = matchedPurchase?.id;
      }

      if (targetPurchaseId) {
        const { data: itemsData } = await supabase
          .from('purchase_items')
          .select('id, name, quantity, unit_price, total_price')
          .eq('purchase_id', targetPurchaseId);
        setItems(itemsData || []);
      } else {
        const { data: directItems } = await supabase
          .from('purchase_items')
          .select('id, name, quantity, unit_price, total_price')
          .eq('transaction_id', transactionId);
        setItems(directItems || []);
      }
    } catch (err) {
      console.warn('Erro ao carregar detalhes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRecurringFromDetail = async () => {
    if (!matchingRecurringBill && !repeatsMonthly) return;

    const currentStatus = matchingRecurringBill ? matchingRecurringBill.is_active : repeatsMonthly;
    const nextStatus = !currentStatus;

    Alert.alert(
      nextStatus ? 'Reativar Recorrência' : 'Pausar Recorrência',
      nextStatus
        ? `Pretende que "${currentDesc}" volte a ser gerada automaticamente nos meses seguintes?`
        : `Pretende pausar "${currentDesc}" e remover as pendências nos meses futuros?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextStatus ? 'Sim, Reativar' : 'Sim, Pausar e Limpar',
          style: nextStatus ? 'default' : 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              if (matchingRecurringBill) {
                await supabase
                  .from('recurring_bills')
                  .update({ is_active: nextStatus })
                  .eq('id', matchingRecurringBill.id);

                setMatchingRecurringBill({
                  ...matchingRecurringBill,
                  is_active: nextStatus,
                });
              }

              await supabase
                .from('transactions')
                .update({ repeats_monthly: nextStatus })
                .ilike('description', currentDesc.trim());

              if (!nextStatus && user) {
                await supabase
                  .from('transactions')
                  .delete()
                  .eq('user_id', user.id)
                  .ilike('description', currentDesc.trim())
                  .gt('date', currentDate)
                  .eq('is_settled', false);
              }

              setRepeatsMonthly(nextStatus);
              setEditRepeats(nextStatus);
              onUpdated();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    const parsedAmount = parseFloat(editAmount.replace(',', '.'));
    if (!editDesc.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Atenção', 'Informe descrição e valor válidos.');
      return;
    }

    setSaving(true);
    try {
      const finalSpentFor = isForSomeone ? personName.trim() : null;
      const finalSplitStatus = isForSomeone
        ? currentType === 'income'
          ? 'none'
          : splitStatus
        : 'none';

      const { error } = await supabase
        .from('transactions')
        .update({
          description: editDesc.trim(),
          amount: parsedAmount,
          category_id: selectedCatId,
          spent_for_name: finalSpentFor,
          split_status: finalSplitStatus,
          repeats_monthly: editRepeats,
          budget_bucket: currentType === 'expense' ? selectedBucket : null,
        })
        .eq('id', transactionId);

      if (error) throw error;

      if (editRepeats || repeatsMonthly || matchingRecurringBill) {
        await supabase
          .from('recurring_bills')
          .update({
            description: editDesc.trim(),
            amount: parsedAmount,
            category_id: selectedCatId,
            is_active: editRepeats,
          })
          .ilike('description', currentDesc.trim());

        if (user) {
          await supabase
            .from('transactions')
            .update({
              description: editDesc.trim(),
              amount: parsedAmount,
              category_id: selectedCatId,
              spent_for_name: finalSpentFor,
              split_status: finalSplitStatus,
              budget_bucket: currentType === 'expense' ? selectedBucket : null,
            })
            .eq('user_id', user.id)
            .ilike('description', currentDesc.trim())
            .gt('date', currentDate)
            .eq('is_settled', false);
        }
      }

      setCurrentDesc(editDesc.trim());
      setCurrentAmount(parsedAmount);
      setRepeatsMonthly(editRepeats);

      setIsEditing(false);
      onUpdated();
    } catch (err: any) {
      Alert.alert('Erro ao atualizar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const isRecurring = repeatsMonthly || (matchingRecurringBill && matchingRecurringBill.is_active);

    if (isRecurring) {
      Alert.alert(
        'Assinatura / Conta Fixa',
        `"${currentDesc}" repete-se todos os meses. Como deseja proceder?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir apenas deste mês',
            style: 'default',
            onPress: async () => {
              await supabase.from('transactions').delete().eq('id', transactionId);
              onDeleted();
              onClose();
            },
          },
          {
            text: 'Cancelar e apagar dos meses futuros',
            style: 'destructive',
            onPress: async () => {
              await supabase
                .from('recurring_bills')
                .update({ is_active: false })
                .ilike('description', currentDesc.trim());

              await supabase
                .from('transactions')
                .update({ repeats_monthly: false })
                .ilike('description', currentDesc.trim());

              if (user) {
                await supabase
                  .from('transactions')
                  .delete()
                  .eq('user_id', user.id)
                  .ilike('description', currentDesc.trim())
                  .gte('date', currentDate)
                  .eq('is_settled', false);
              }

              onDeleted();
              onClose();
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Excluir Transação',
      `Tem a certeza de que deseja remover "${currentDesc}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('transactions').delete().eq('id', transactionId);
            onDeleted();
            onClose();
          },
        },
      ]
    );
  };

  const isIncome = currentType === 'income';
  const filteredCategories = categories
    .filter((c) => c.type === currentType)
    .filter((cat, index, self) => index === self.findIndex((t) => t.name === cat.name));

  const isRecurringActive = matchingRecurringBill ? matchingRecurringBill.is_active : repeatsMonthly;

  const totalItemsBruto = items.reduce((acc, it) => acc + Number(it.total_price || 0), 0);
  const economiaDesconto = Math.max(0, totalItemsBruto - Number(currentAmount));

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
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {isIncome ? 'Detalhe da Receita' : 'Detalhe do Lançamento'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {isEditing ? (
              <View style={styles.editContainer}>
                <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
                <TextInput
                  style={styles.input}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Descrição"
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.fieldLabel}>VALOR (R$)</Text>
                <TextInput
                  style={[styles.input, styles.inputAmount]}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor="#64748B"
                />

                {!isIncome && (
                  <View style={styles.bucketSection}>
                    <TouchableOpacity
                      style={styles.bucketHeaderTouchable}
                      onPress={() => {
                        onClose();
                        if (onOpenSettings) {
                          setTimeout(() => onOpenSettings(), 300);
                        }
                      }}
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

                <Text style={styles.fieldLabel}>CATEGORIA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {filteredCategories.map((c) => {
                    const isSelected = selectedCatId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catChip, isSelected && styles.catChipActive]}
                        onPress={() => setSelectedCatId(c.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setEditRepeats(!editRepeats)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, editRepeats && styles.checkboxChecked]}>
                    {editRepeats && <Feather name="check" size={11} color="#0B0F19" />}
                  </View>
                  <Feather name="repeat" size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text style={styles.checkboxLabel}>Repetir automaticamente todos os meses</Text>
                </TouchableOpacity>

                <View style={styles.splitBox}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setIsForSomeone(!isForSomeone)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.checkbox, isForSomeone && styles.checkboxChecked]}>
                      {isForSomeone && <Feather name="check" size={11} color="#0B0F19" />}
                    </View>
                    <Feather name={isIncome ? 'arrow-down-left' : 'user'} size={13} color="#94A3B8" style={{ marginRight: 6 }} />
                    <Text style={styles.checkboxLabel}>
                      {isIncome ? 'Informar pagador ou origem' : 'Despesa dividida ou para terceiro'}
                    </Text>
                  </TouchableOpacity>

                  {isForSomeone && (
                    <View style={{ marginTop: 8 }}>
                      <TextInput
                        placeholder={isIncome ? 'Quem efetuou o envio' : 'Nome da pessoa'}
                        placeholderTextColor="#64748B"
                        style={styles.inputPerson}
                        value={personName}
                        onChangeText={setPersonName}
                      />

                      {!isIncome && (
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
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)} disabled={saving}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? 'A guardar...' : 'Gravar Alterações'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.txDesc}>{currentDesc}</Text>
                <Text style={styles.txDate}>
                  {currentDate.split('-').reverse().join('/')} {isRecurringActive ? '• Assinatura Mensal' : ''}
                </Text>

                {isForSomeone && personName ? (
                  <View style={[styles.splitBanner, isIncome && styles.splitBannerIncome]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather 
                        name={isIncome ? 'arrow-down-left' : splitStatus === 'pending' ? 'clock' : splitStatus === 'settled' ? 'check-circle' : 'gift'} 
                        size={12} 
                        color={isIncome ? '#34D399' : '#FBBF24'} 
                      />
                      <Text style={[styles.splitBannerTitle, isIncome && styles.splitBannerTitleIncome]}>
                        {isIncome
                          ? `Recebido de: ${personName}`
                          : splitStatus === 'pending'
                          ? `Aguardando acerto com: ${personName}`
                          : splitStatus === 'settled'
                          ? `Reembolsado por: ${personName}`
                          : `Pago para: ${personName}`}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Card Consolidado do Montante */}
                <View style={styles.amountCard}>
                  <Text style={styles.amountLabel}>VALOR {isIncome ? 'RECEBIDO' : 'TOTAL'}</Text>
                  <Text style={[styles.amountVal, { color: isIncome ? '#34D399' : '#F8FAFC' }]}>
                    {isIncome ? '+ ' : '- '}R$ {Number(currentAmount).toFixed(2).replace('.', ',')}
                  </Text>
                </View>

                {/* Custo em Tempo de Vida */}
                {!isIncome && (
                  <TouchableOpacity
                    style={[styles.lifeTimeCard, showLifeTime && styles.lifeTimeCardActive]}
                    onPress={() => setShowLifeTime(!showLifeTime)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.lifeTimeHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name={showLifeTime ? 'clock' : 'lock'} size={13} color="#FBBF24" />
                        <Text style={styles.lifeTimeTitle}>
                          {showLifeTime ? 'Custo em Horas de Trabalho:' : 'Custo em Horas de Trabalho'}
                        </Text>
                      </View>
                      <Text style={styles.lifeTimeToggleHint}>
                        {showLifeTime ? 'Ocultar' : 'Calcular'}
                      </Text>
                    </View>

                    {showLifeTime && (
                      <View style={styles.lifeTimeContent}>
                        {(() => {
                          const baseSalary = userMonthlyIncome > 0 ? userMonthlyIncome : 2000;
                          const hourlyRate = baseSalary / 160;
                          const totalHoursDecimal = Number(currentAmount) / hourlyRate;
                          const hours = Math.floor(totalHoursDecimal);
                          const minutes = Math.round((totalHoursDecimal - hours) * 60);

                          return (
                            <>
                              <Text style={styles.lifeTimeText}>
                                Equivale a <Text style={styles.lifeTimeHighlight}>{hours}h {minutes}min</Text> de esforço profissional.
                              </Text>
                              <Text style={styles.lifeTimeSub}>
                                Com base em R$ {baseSalary.toFixed(2).replace('.', ',')} / mês (~R$ {hourlyRate.toFixed(2).replace('.', ',')}/h).
                              </Text>
                            </>
                          );
                        })()}
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {(matchingRecurringBill || repeatsMonthly) && (
                  <TouchableOpacity
                    style={[
                      styles.pauseRecurringBtn,
                      !isRecurringActive && styles.pauseRecurringBtnPaused,
                    ]}
                    onPress={handleToggleRecurringFromDetail}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name={isRecurringActive ? 'pause' : 'play'} size={12} color={!isRecurringActive ? '#34D399' : '#FBBF24'} />
                      <Text
                        style={[
                          styles.pauseRecurringBtnText,
                          !isRecurringActive && styles.pauseRecurringBtnTextPaused,
                        ]}
                      >
                        {isRecurringActive
                          ? 'Pausar cobrança nos meses seguintes'
                          : 'Reativar cobrança recorrente'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                <View style={styles.topActionsRow}>
                  <TouchableOpacity style={styles.actionBtnEdit} onPress={() => setIsEditing(true)} activeOpacity={0.7}>
                    <Feather name="edit-2" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.actionBtnEditText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDelete} onPress={handleDelete} activeOpacity={0.7}>
                    <Feather name="trash-2" size={12} color="#F87171" style={{ marginRight: 4 }} />
                    <Text style={styles.actionBtnDeleteText}>Excluir</Text>
                  </TouchableOpacity>
                </View>

                {/* Itens do Cupom Fiscal */}
                {!isIncome && (
                  <>
                    <Text style={styles.sectionTitle}>ITENS DA NOTA FISCAL</Text>
                    {loading ? (
                      <ActivityIndicator size="small" color="#10B981" style={{ marginVertical: 14 }} />
                    ) : items.length > 0 ? (
                      <>
                        <View style={styles.itemsList}>
                          {items.map((it) => (
                            <View key={it.id} style={styles.itemRow}>
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={styles.itemName}>{it.name}</Text>
                                <Text style={styles.itemSub}>{it.quantity}x • R$ {Number(it.unit_price).toFixed(2)} un</Text>
                              </View>
                              <Text style={styles.itemTotal}>R$ {Number(it.total_price).toFixed(2)}</Text>
                            </View>
                          ))}
                        </View>

                        {economiaDesconto > 0.01 && (
                          <View style={styles.discountCard}>
                            <View style={styles.discountRow}>
                              <Text style={styles.discountLabel}>Soma dos produtos:</Text>
                              <Text style={styles.discountOriginal}>
                                R$ {totalItemsBruto.toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                            <View style={styles.discountRow}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Feather name="tag" size={12} color="#34D399" />
                                <Text style={styles.discountHighlight}>Economia do mercado:</Text>
                              </View>
                              <Text style={styles.discountValue}>
                                - R$ {economiaDesconto.toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.emptyItemsBox}>
                        <Text style={styles.emptyItemsText}>Sem itens discriminados por QR Code para este registo.</Text>
                      </View>
                    )}
                  </>
                )}

                <TouchableOpacity style={styles.closeFullBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={styles.closeFullBtnText}>Concluído</Text>
                </TouchableOpacity>
              </View>
            )}
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
  txDesc: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  txDate: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  splitBanner: {
    backgroundColor: '#131927',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  splitBannerIncome: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  splitBannerTitle: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
  },
  splitBannerTitleIncome: {
    color: '#34D399',
  },
  amountCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  amountLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  amountVal: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  lifeTimeCard: {
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  lifeTimeCardActive: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  lifeTimeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lifeTimeTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  lifeTimeToggleHint: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  lifeTimeContent: {
    marginTop: 8,
  },
  lifeTimeText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '500',
  },
  lifeTimeHighlight: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  lifeTimeSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  pauseRecurringBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pauseRecurringBtnPaused: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  pauseRecurringBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  pauseRecurringBtnTextPaused: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  topActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionBtnEdit: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnEditText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnDelete: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDeleteText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
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
    marginBottom: 14,
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
    marginBottom: 14,
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
  editContainer: {
    paddingVertical: 4,
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
  splitBox: {
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
  editActions: {
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
});