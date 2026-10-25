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
}) => {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estados locais sincronizados com a base de dados
  const [currentDesc, setCurrentDesc] = useState(description);
  const [currentAmount, setCurrentAmount] = useState(amount);
  const [currentDate, setCurrentDate] = useState(date);
  const [currentType, setCurrentType] = useState<'expense' | 'income'>('expense');
  const [repeatsMonthly, setRepeatsMonthly] = useState(false);

  // Identificação de assinatura correspondente em recurring_bills
  const [matchingRecurringBill, setMatchingRecurringBill] = useState<{ id: string; is_active: boolean } | null>(null);

  // Edição
  const [editDesc, setEditDesc] = useState(description);
  const [editAmount, setEditAmount] = useState(amount.toString());
  const [editRepeats, setEditRepeats] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<'needs' | 'wants' | 'savings'>('needs');
  
  // Terceiros
  const [isForSomeone, setIsForSomeone] = useState(false);
  const [personName, setPersonName] = useState('');
  const [splitStatus, setSplitStatus] = useState<'gift' | 'pending' | 'settled' | 'none'>('pending');

  const [showLifeTime, setShowLifeTime] = useState(false);

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
    }
  }, [visible, transactionId]);

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

        // Inicializa o bucket 50/30/20 (do banco ou da categoria associada)
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

      // Procura se tem conta fixa correspondente na tabela recurring_bills
      const targetName = (txData?.description || description).trim();
      const { data: recBill } = await supabase
        .from('recurring_bills')
        .select('id, is_active')
        .ilike('description', targetName)
        .maybeSingle();

      setMatchingRecurringBill(recBill || null);

      // Procura itens fiscais vinculados
      let targetPurchaseId = txData?.purchase_id;
      if (!targetPurchaseId && (txData?.description || description).startsWith('NFC-e:')) {
        const cleanStoreName = (txData?.description || description).replace('NFC-e:', '').trim();
        const { data: matchedPurchase } = await supabase
          .from('purchases')
          .select('id')
          .ilike('store_name', `%${cleanStoreName}%`)
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
        ? `Deseja que "${currentDesc}" volte a ser gerada automaticamente nos meses seguintes?`
        : `Deseja pausar "${currentDesc}" e remover as pendências geradas nos meses seguintes?`,
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

              Alert.alert(
                'Concluído',
                nextStatus
                  ? 'A despesa foi reativada para os próximos meses.'
                  : 'A cobrança foi pausada e os registos futuros pendentes foram eliminados.'
              );
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
      Alert.alert('Sucesso', 'Lançamento atualizado!');
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
        `"${currentDesc}" repete-se todos os meses. Como deseja prosseguir?`,
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
            text: 'Cancelar e apagar de todos os meses futuros',
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
              Alert.alert('Cancelado', 'A cobrança foi encerrada e removida de todos os meses futuros.');
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Excluir Transação',
      `Tem certeza de que deseja remover "${currentDesc}"?`,
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

  // Cálculo da soma dos itens da nota e desconto do mercado
  const totalItemsBruto = items.reduce((acc, it) => acc + Number(it.total_price || 0), 0);
  const economiaDesconto = Math.max(0, totalItemsBruto - Number(currentAmount));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {isIncome ? 'Detalhe da Receita' : 'Detalhe da Despesa'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {isEditing ? (
              <View style={styles.editContainer}>
                <Text style={styles.label}>Descrição / Título</Text>
                <TextInput
                  style={styles.input}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder="Descrição"
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.label}>Valor (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor="#64748B"
                />

                {/* Seleção do Grupo Orçamental 50/30/20 */}
                {!isIncome && (
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

                <Text style={styles.label}>Categoria no Orçamento:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {filteredCategories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catChip, selectedCatId === c.id && styles.catChipActive]}
                      onPress={() => {
                        setSelectedCatId(c.id);
                        if (c.rule_group) {
                          if (c.rule_group === 'needs_50') setSelectedBucket('needs');
                          else if (c.rule_group === 'wants_30') setSelectedBucket('wants');
                          else if (c.rule_group === 'savings_20') setSelectedBucket('savings');
                        }
                      }}
                    >
                      <Text style={[styles.catChipText, selectedCatId === c.id && styles.catChipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setEditRepeats(!editRepeats)}
                >
                  <View style={[styles.checkbox, editRepeats && styles.checkboxChecked]} />
                  <Text style={styles.checkboxLabel}>🔁 Repetir automaticamente nos meses seguintes</Text>
                </TouchableOpacity>

                <View style={styles.splitBox}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setIsForSomeone(!isForSomeone)}
                  >
                    <View style={[styles.checkbox, isForSomeone && styles.checkboxChecked]} />
                    <Text style={styles.checkboxLabel}>
                      {isIncome ? '📥 Informar a origem / quem enviou?' : '👤 Gastei para outra pessoa?'}
                    </Text>
                  </TouchableOpacity>

                  {isForSomeone && (
                    <View style={{ marginTop: 8 }}>
                      <TextInput
                        placeholder={isIncome ? 'Quem enviou' : 'Nome da pessoa'}
                        placeholderTextColor="#64748B"
                        style={styles.inputPerson}
                        value={personName}
                        onChangeText={setPersonName}
                      />

                      {!isIncome && (
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
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)} disabled={saving}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar Alterações'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.txDesc}>{currentDesc}</Text>
                <Text style={styles.txDate}>
                  Data: {currentDate} {isRecurringActive ? '• 🔁 Assinatura Mensal' : ''}
                </Text>

                {isForSomeone && personName ? (
                  <View style={[styles.splitBanner, isIncome && styles.splitBannerIncome]}>
                    <Text style={[styles.splitBannerTitle, isIncome && styles.splitBannerTitleIncome]}>
                      {isIncome
                        ? `📥 Recebido de: ${personName}`
                        : splitStatus === 'pending'
                        ? `⏳ Aguardando acerto com: ${personName}`
                        : splitStatus === 'settled'
                        ? `✅ Reembolsado por: ${personName}`
                        : `🎁 Pago para: ${personName}`}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.amountCard}>
                  <Text style={styles.amountLabel}>Valor {isIncome ? 'Recebido' : 'Pago'}</Text>
                  <Text style={[styles.amountVal, { color: isIncome ? '#10B981' : '#38BDF8' }]}>
                    {isIncome ? '+ ' : '- '}R$ {Number(currentAmount).toFixed(2).replace('.', ',')}
                  </Text>
                </View>

                {!isIncome && (
                  <TouchableOpacity
                    style={[styles.lifeTimeCard, showLifeTime && styles.lifeTimeCardActive]}
                    onPress={() => setShowLifeTime(!showLifeTime)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.lifeTimeHeader}>
                      <Text style={styles.lifeTimeTitle}>
                        {showLifeTime ? '⏳ Custo em Tempo de Vida:' : '🔒 Custo em Horas de Vida'}
                      </Text>
                      <Text style={styles.lifeTimeToggleHint}>
                        {showLifeTime ? 'Toque para ocultar' : 'Toque para desbloquear'}
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
                                Custou <Text style={styles.lifeTimeHighlight}>{hours}h {minutes}min</Text> de trabalho.
                              </Text>
                              <Text style={styles.lifeTimeSub}>
                                Baseado no salário de R$ {baseSalary.toFixed(2).replace('.', ',')} (R$ {hourlyRate.toFixed(2).replace('.', ',')}/h).
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
                    <Text
                      style={[
                        styles.pauseRecurringBtnText,
                        !isRecurringActive && styles.pauseRecurringBtnTextPaused,
                      ]}
                    >
                      {isRecurringActive
                        ? '⏸️ Pausar cobrança nos meses seguintes'
                        : '▶️ Reativar cobrança nos meses seguintes'}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={styles.topActionsRow}>
                  <TouchableOpacity style={styles.actionBtnEdit} onPress={() => setIsEditing(true)}>
                    <Text style={styles.actionBtnEditText}>✏️ Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDelete} onPress={handleDelete}>
                    <Text style={styles.actionBtnDeleteText}>🗑️ Excluir</Text>
                  </TouchableOpacity>
                </View>

                {!isIncome && (
                  <>
                    <Text style={styles.sectionTitle}>ITENS DISCRIMINADOS NA NOTA:</Text>
                    {loading ? (
                      <ActivityIndicator size="small" color="#38BDF8" style={{ marginVertical: 14 }} />
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

                        {/* Bloco de Desconto do Mercado se houver diferença de valor */}
                        {economiaDesconto > 0.01 && (
                          <View style={styles.discountCard}>
                            <View style={styles.discountRow}>
                              <Text style={styles.discountLabel}>Soma dos produtos:</Text>
                              <Text style={styles.discountOriginal}>
                                R$ {totalItemsBruto.toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                            <View style={styles.discountRow}>
                              <Text style={styles.discountHighlight}>🎉 Descontos do mercado:</Text>
                              <Text style={styles.discountValue}>
                                - R$ {economiaDesconto.toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                          </View>
                        )}
                      </>
                    ) : (
                      <View style={styles.emptyItemsBox}>
                        <Text style={styles.emptyItemsText}>Nenhum item discriminado para este lançamento.</Text>
                      </View>
                    )}
                  </>
                )}

                <TouchableOpacity style={styles.closeFullBtn} onPress={onClose}>
                  <Text style={styles.closeFullBtnText}>Fechar</Text>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { padding: 6 },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  txDesc: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold' },
  txDate: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  splitBanner: { backgroundColor: '#0F172A', borderRadius: 8, padding: 10, marginVertical: 10, borderWidth: 1, borderColor: '#334155' },
  splitBannerIncome: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' },
  splitBannerTitle: { color: '#FBBF24', fontSize: 13, fontWeight: '600' },
  splitBannerTitleIncome: { color: '#34D399' },
  amountCard: { backgroundColor: '#0F172A', borderRadius: 12, padding: 14, alignItems: 'center', marginVertical: 10, borderWidth: 1, borderColor: '#334155' },
  amountLabel: { color: '#94A3B8', fontSize: 12 },
  amountVal: { fontSize: 24, fontWeight: 'bold', marginTop: 2 },
  lifeTimeCard: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed' },
  lifeTimeCardActive: { borderColor: '#F59E0B', borderStyle: 'solid', backgroundColor: 'rgba(245, 158, 11, 0.08)' },
  lifeTimeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lifeTimeTitle: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold' },
  lifeTimeToggleHint: { color: '#94A3B8', fontSize: 11 },
  lifeTimeContent: { marginTop: 8 },
  lifeTimeText: { color: '#CBD5E1', fontSize: 14, fontWeight: '500' },
  lifeTimeHighlight: { color: '#FBBF24', fontWeight: 'bold' },
  lifeTimeSub: { color: '#64748B', fontSize: 11, marginTop: 3 },
  pauseRecurringBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 12,
  },
  pauseRecurringBtnPaused: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10B981',
  },
  pauseRecurringBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pauseRecurringBtnTextPaused: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: 'bold',
  },
  topActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionBtnEdit: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.1)', alignItems: 'center' },
  actionBtnEditText: { color: '#38BDF8', fontWeight: 'bold', fontSize: 13 },
  actionBtnDelete: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', alignItems: 'center' },
  actionBtnDeleteText: { color: '#EF4444', fontWeight: 'bold', fontSize: 13 },
  sectionTitle: { color: '#94A3B8', fontSize: 11, fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase' },
  itemsList: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
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
  discountLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  discountOriginal: {
    color: '#94A3B8',
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  discountHighlight: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  discountValue: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyItemsBox: { backgroundColor: '#0F172A', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  emptyItemsText: { color: '#64748B', fontSize: 12, textAlign: 'center' },
  closeFullBtn: { backgroundColor: '#334155', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  closeFullBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 14 },
  editContainer: { paddingVertical: 4 },
  label: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 12, borderRadius: 8, fontSize: 15, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  bucketSection: { marginVertical: 4 },
  bucketRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bucketBtn: {
    flex: 1,
    paddingVertical: 10,
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
  catChip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0F172A', borderRadius: 16, marginRight: 6, borderWidth: 1, borderColor: '#334155' },
  catChipActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  catChipText: { color: '#94A3B8', fontSize: 12 },
  catChipTextActive: { color: '#0F172A', fontWeight: 'bold' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#64748B', marginRight: 8 },
  checkboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkboxLabel: { color: '#CBD5E1', fontSize: 13 },
  splitBox: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#334155' },
  inputPerson: { backgroundColor: '#1E293B', color: '#F8FAFC', padding: 10, borderRadius: 8, fontSize: 14, marginBottom: 8, borderWidth: 1, borderColor: '#334155' },
  splitStatusRow: { flexDirection: 'row', gap: 4 },
  splitStatusBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#1E293B', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  splitStatusBtnActiveGift: { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38BDF8' },
  splitStatusBtnActivePending: { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: '#F59E0B' },
  splitStatusBtnActiveSettled: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: '#10B981' },
  splitStatusText: { color: '#94A3B8', fontSize: 10, fontWeight: '600' },
  splitStatusTextActive: { color: '#F8FAFC', fontWeight: 'bold' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#334155', alignItems: 'center' },
  cancelBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center' },
  saveBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
});