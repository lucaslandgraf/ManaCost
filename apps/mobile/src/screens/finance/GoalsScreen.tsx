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
  Share,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { supabase } from '../../config/supabase';
import { calculateGoalProjection } from '../../utils/goalMath';

interface FinancialGoal {
  id: string;
  title: string;
  category: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  annual_interest_rate: number;
  target_date?: string;
  is_completed: boolean;
}

interface GoalChecklistItem {
  id: string;
  goal_id: string;
  title: string;
  is_done: boolean;
  cost_estimate: number;
}

export function GoalsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);

  // Modais
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [editContribModalVisible, setEditContribModalVisible] = useState(false);

  const [selectedGoal, setSelectedGoal] = useState<FinancialGoal | null>(null);
  const [checklist, setChecklist] = useState<GoalChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');

  // Aportes e Edições
  const [depositInput, setDepositInput] = useState('');
  const [newContribInput, setNewContribInput] = useState('');

  // Formulário Nova Meta
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Geral');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [useCDI, setUseCDI] = useState(false); // Desmarcado por defeito
  const [linkToRecurring, setLinkToRecurring] = useState(true); // Vincula a Contas Fixas por defeito
  const [saving, setSaving] = useState(false);

  const categories = ['Carro', 'Casa/Ap', 'Viagem', 'Eletrónico', 'Reserva', 'Geral'];

  const fetchGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('financial_goals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGoals(data || []);

      if (selectedGoal) {
        const updated = (data || []).find((g: FinancialGoal) => g.id === selectedGoal.id);
        if (updated) setSelectedGoal(updated);
      }
    } catch (err: any) {
      console.warn('Erro ao obter metas:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChecklist = async (goalId: string) => {
    const { data } = await supabase
      .from('goal_checklists')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: true });
    setChecklist(data || []);
  };

  useEffect(() => {
    fetchGoals();

    const channel = supabase
      .channel('goals-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_goals' }, () => {
        fetchGoals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreateGoal = async () => {
    const numTarget = parseFloat(targetAmount.replace(',', '.'));
    const numMonthly = parseFloat(monthlyContribution.replace(',', '.'));
    const numCurrent = currentAmount ? parseFloat(currentAmount.replace(',', '.')) : 0;

    if (!title.trim() || isNaN(numTarget) || numTarget <= 0 || isNaN(numMonthly) || numMonthly <= 0) {
      Alert.alert('Atenção', 'Preencha o título, o valor total e o aporte mensal com valores válidos.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const rate = useCDI ? 10.75 : 0;

      // 1. Cria a meta principal
      const { data: newGoal, error: goalErr } = await supabase
        .from('financial_goals')
        .insert([{
          user_id: user.id,
          title: title.trim(),
          category,
          target_amount: numTarget,
          current_amount: numCurrent,
          monthly_contribution: numMonthly,
          annual_interest_rate: rate,
        }])
        .select()
        .single();

      if (goalErr) throw goalErr;

      // 2. Se selecionado, cadastra automaticamente em recurring_bills
      if (linkToRecurring && newGoal) {
        const { data: catReserva } = await supabase
          .from('categories')
          .select('id')
          .ilike('name', '%Invest%')
          .limit(1)
          .maybeSingle();

        await supabase.from('recurring_bills').insert([{
          user_id: user.id,
          description: `Aporte: ${title.trim()}`,
          amount: numMonthly,
          due_day: 10,
          type: 'expense',
          category_id: catReserva?.id || null,
          goal_id: newGoal.id,
          is_active: true,
        }]);
      }

      // 3. Checklists padrão conforme a categoria
      if (category === 'Carro') {
        await supabase.from('goal_checklists').insert([
          { goal_id: newGoal.id, title: 'Simular seguro e IPVA' },
          { goal_id: newGoal.id, title: 'Laudo de vistoria cautelar' },
        ]);
      } else if (category === 'Casa/Ap') {
        await supabase.from('goal_checklists').insert([
          { goal_id: newGoal.id, title: 'Reserva para ITBI e Cartório (~5%)' },
          { goal_id: newGoal.id, title: 'Avaliação de custos de condomínio' },
        ]);
      }

      setCreateModalVisible(false);
      setTitle('');
      setTargetAmount('');
      setCurrentAmount('');
      setMonthlyContribution('');
      setUseCDI(false);
      setLinkToRecurring(true);
      fetchGoals();
      Alert.alert('Meta Criada!', 'A sua meta foi planeada com sucesso.');
    } catch (err: any) {
      Alert.alert('Erro ao guardar meta', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDeposit = async () => {
    if (!selectedGoal) return;
    const addedVal = parseFloat(depositInput.replace(',', '.'));
    if (isNaN(addedVal) || addedVal <= 0) {
      Alert.alert('Valor Inválido', 'Indique um valor positivo para guardar.');
      return;
    }

    const newAmount = Number(selectedGoal.current_amount) + addedVal;

    try {
      const { error } = await supabase
        .from('financial_goals')
        .update({ current_amount: newAmount })
        .eq('id', selectedGoal.id);

      if (error) throw error;

      setSelectedGoal({ ...selectedGoal, current_amount: newAmount });
      setDepositModalVisible(false);
      setDepositInput('');
      fetchGoals();
      Alert.alert('Sucesso! 🎉', `Guardou mais R$ ${addedVal.toFixed(2)} nesta meta.`);
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleUpdateMonthlyContribution = async () => {
    if (!selectedGoal) return;
    const newContrib = parseFloat(newContribInput.replace(',', '.'));
    if (isNaN(newContrib) || newContrib <= 0) {
      Alert.alert('Valor Inválido', 'Indique um valor de aporte mensal válido.');
      return;
    }

    try {
      // 1. Atualiza na tabela da meta
      const { error: goalErr } = await supabase
        .from('financial_goals')
        .update({ monthly_contribution: newContrib })
        .eq('id', selectedGoal.id);

      if (goalErr) throw goalErr;

      // 2. Sincroniza a conta fixa vinculada (se existir)
      await supabase
        .from('recurring_bills')
        .update({ amount: newContrib })
        .eq('goal_id', selectedGoal.id);

      setSelectedGoal({ ...selectedGoal, monthly_contribution: newContrib });
      setEditContribModalVisible(false);
      setNewContribInput('');
      fetchGoals();
      Alert.alert('Atualizado', 'Aporte mensal e conta fixa vinculada foram recalculados.');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!newChecklistText.trim() || !selectedGoal) return;
    try {
      const { data, error } = await supabase
        .from('goal_checklists')
        .insert([{ goal_id: selectedGoal.id, title: newChecklistText.trim() }])
        .select()
        .single();

      if (error) throw error;
      setChecklist([...checklist, data]);
      setNewChecklistText('');
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleToggleChecklist = async (item: GoalChecklistItem) => {
    const updated = !item.is_done;
    setChecklist(checklist.map((c) => (c.id === item.id ? { ...c, is_done: updated } : c)));
    await supabase.from('goal_checklists').update({ is_done: updated }).eq('id', item.id);
  };

  const handleDeleteChecklistItem = async (id: string) => {
    setChecklist(checklist.filter((c) => c.id !== id));
    await supabase.from('goal_checklists').delete().eq('id', id);
  };

  const handleExportExcel = async (goal: FinancialGoal) => {
    const proj = calculateGoalProjection(
      Number(goal.target_amount),
      Number(goal.current_amount),
      Number(goal.monthly_contribution),
      Number(goal.annual_interest_rate)
    );

    const rows = [
      { Propriedade: 'Meta', Detalhe: goal.title },
      { Propriedade: 'Categoria', Detalhe: goal.category },
      { Propriedade: 'Valor Alvo', Detalhe: `R$ ${Number(goal.target_amount).toFixed(2)}` },
      { Propriedade: 'Saldo Atual Guardado', Detalhe: `R$ ${Number(goal.current_amount).toFixed(2)}` },
      { Propriedade: 'Aporte Mensal Previsto', Detalhe: `R$ ${Number(goal.monthly_contribution).toFixed(2)}` },
      { Propriedade: 'Tempo Estimado', Detalhe: proj.yearsMonthsText },
      { Propriedade: 'Data Prevista de Conquista', Detalhe: proj.completionDate.toLocaleDateString('pt-BR') },
      { Propriedade: 'Rendimento Acumulado Estimado', Detalhe: `R$ ${proj.totalInterest.toFixed(2)}` },
      { Propriedade: '', Detalhe: '' },
      { Propriedade: 'CHECKLIST DE PROVIDÊNCIAS', Detalhe: 'STATUS' },
      ...checklist.map((c) => ({ Propriedade: c.title, Detalhe: c.is_done ? 'CONCLUÍDO' : 'PENDENTE' })),
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planeamento de Meta');

    const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const fileName = `Meta_${goal.title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Relatório de Meta - ${goal.title}`,
      });
    }
  };

  const handleShareWhatsApp = (goal: FinancialGoal) => {
    const proj = calculateGoalProjection(
      Number(goal.target_amount),
      Number(goal.current_amount),
      Number(goal.monthly_contribution),
      Number(goal.annual_interest_rate)
    );

    let msg = `🎯 *PLANO DE META: ${goal.title.toUpperCase()}*\n`;
    msg += `Categoria: ${goal.category}\n`;
    msg += `Alvo: R$ ${Number(goal.target_amount).toFixed(2)}\n`;
    msg += `Guardado: R$ ${Number(goal.current_amount).toFixed(2)}\n`;
    msg += `Aporte Mensal: R$ ${Number(goal.monthly_contribution).toFixed(2)}\n`;
    msg += `⏱ *Estimativa de Conclusão:* ${proj.yearsMonthsText} (${proj.completionDate.toLocaleDateString('pt-BR')})\n`;
    if (proj.totalInterest > 0) {
      msg += `📈 Rendimento estimado: R$ ${proj.totalInterest.toFixed(2)}\n`;
    }

    if (checklist.length > 0) {
      msg += `\n📋 *Checklist:*\n`;
      checklist.forEach((c) => {
        msg += `${c.is_done ? '✅' : '⬜'} ${c.title}\n`;
      });
    }

    Share.share({ message: msg });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Top Header com Botão Voltar */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Feather name="chevron-left" size={20} color="#10B981" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Metas & Simulador</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModalVisible(true)} activeOpacity={0.8}>
          <Feather name="plus" size={14} color="#0B0F19" />
          <Text style={styles.addBtnText}>Nova Meta</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de Metas */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={goals}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const proj = calculateGoalProjection(
              Number(item.target_amount),
              Number(item.current_amount),
              Number(item.monthly_contribution),
              Number(item.annual_interest_rate)
            );
            const progress = Math.min((Number(item.current_amount) / Number(item.target_amount)) * 100, 100);

            return (
              <TouchableOpacity
                style={styles.goalCard}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedGoal(item);
                  fetchChecklist(item.id);
                  setDetailModalVisible(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.goalTitle}>{item.title}</Text>
                    <Text style={styles.goalCategory}>
                      {item.category} • R$ {Number(item.monthly_contribution).toFixed(2)}/mês
                    </Text>
                  </View>
                  <View style={styles.timeTag}>
                    <Feather name="clock" size={11} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.timeTagText}>{proj.yearsMonthsText}</Text>
                  </View>
                </View>

                {/* Barra de Progresso */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressBar, { width: `${progress}%` }]} />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.amountLabel}>R$ {Number(item.current_amount).toFixed(2)} ({progress.toFixed(1)}%)</Text>
                    <Text style={styles.amountTarget}>Alvo: R$ {Number(item.target_amount).toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.footerDate}>
                    Conclusão prevista: <Text style={{ color: '#10B981', fontWeight: '700' }}>{proj.completionDate.toLocaleDateString('pt-BR')}</Text>
                  </Text>
                  <Feather name="chevron-right" size={16} color="#64748B" />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Feather name="target" size={32} color="#64748B" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>Nenhuma meta cadastrada ainda.{'\n'}Crie metas para compras ou investimentos e acompanhe as previsões.</Text>
            </View>
          }
        />
      )}

      {/* Modal Criar Meta */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Nova Meta Financeira</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>NOME DO OBJETIVO</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Carro Novo, Computador, Viagem"
                placeholderTextColor="#64748B"
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>CATEGORIA</Text>
              <View style={styles.categoriesWrap}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catBadge, category === cat && styles.catBadgeActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catBadgeText, category === cat && styles.catBadgeTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>VALOR TOTAL DO OBJETIVO (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 3000.00"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={targetAmount}
                onChangeText={setTargetAmount}
              />

              <Text style={styles.label}>QUANTO VOCÊ JÁ TEM GUARDADO (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={currentAmount}
                onChangeText={setCurrentAmount}
              />

              <Text style={styles.label}>APORTE MENSAL PLANEJADO (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 150.00"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={monthlyContribution}
                onChangeText={setMonthlyContribution}
              />

              {/* Opção CDI */}
              <TouchableOpacity
                style={styles.toggleCdiRow}
                onPress={() => setUseCDI(!useCDI)}
                activeOpacity={0.8}
              >
                <Feather name={useCDI ? 'check-circle' : 'circle'} size={16} color={useCDI ? '#10B981' : '#64748B'} />
                <Text style={styles.toggleCdiText}>Considerar rendimento de 100% CDI (~10.75% a.a.)</Text>
              </TouchableOpacity>

              {/* Opção Ligar a Contas Fixas */}
              <TouchableOpacity
                style={styles.toggleCdiRow}
                onPress={() => setLinkToRecurring(!linkToRecurring)}
                activeOpacity={0.8}
              >
                <Feather name={linkToRecurring ? 'check-circle' : 'circle'} size={16} color={linkToRecurring ? '#10B981' : '#64748B'} />
                <Text style={styles.toggleCdiText}>
                  Criar conta fixa mensal automática ({monthlyContribution ? `R$ ${monthlyContribution}` : 'aporte'})
                </Text>
              </TouchableOpacity>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleCreateGoal} disabled={saving}>
                  <Text style={styles.confirmBtnText}>{saving ? 'A guardar...' : 'Salvar Meta'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Detalhes & Checklist */}
      <Modal visible={detailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeading}>{selectedGoal?.title}</Text>
                <Text style={styles.headerSub}>{selectedGoal?.category} • Alvo: R$ {Number(selectedGoal?.target_amount || 0).toFixed(2)}</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Card Resumo do Aporte Dinâmico */}
              {selectedGoal && (
                <View style={styles.summaryBox}>
                  <View style={styles.summaryTop}>
                    <View>
                      <Text style={styles.summaryLabelSmall}>JÁ ACUMULADO</Text>
                      <Text style={styles.summaryValBig}>R$ {Number(selectedGoal.current_amount).toFixed(2)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.depositBtn}
                      onPress={() => setDepositModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Feather name="plus-circle" size={13} color="#0B0F19" style={{ marginRight: 4 }} />
                      <Text style={styles.depositBtnText}>+ Guardar Dinheiro</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.contribRow}>
                    <View>
                      <Text style={styles.summaryLabelSmall}>APORTE MENSAL ATUAL</Text>
                      <Text style={styles.contribVal}>R$ {Number(selectedGoal.monthly_contribution).toFixed(2)}/mês</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.editContribBtn}
                      onPress={() => {
                        setNewContribInput(String(selectedGoal.monthly_contribution));
                        setEditContribModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-2" size={11} color="#38BDF8" style={{ marginRight: 4 }} />
                      <Text style={styles.editContribBtnText}>Alterar Aporte</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Botões de Ação para Relatório */}
              <View style={styles.reportActionsRow}>
                <TouchableOpacity style={styles.actionBtnExcel} onPress={() => selectedGoal && handleExportExcel(selectedGoal)} activeOpacity={0.8}>
                  <Feather name="file-text" size={13} color="#0B0F19" style={{ marginRight: 4 }} />
                  <Text style={styles.actionBtnExcelText}>Exportar Planilha Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnShare} onPress={() => selectedGoal && handleShareWhatsApp(selectedGoal)} activeOpacity={0.7}>
                  <Feather name="share-2" size={13} color="#38BDF8" style={{ marginRight: 4 }} />
                  <Text style={styles.actionBtnShareText}>Compartilhar</Text>
                </TouchableOpacity>
              </View>

              {/* Seção Checklist */}
              <Text style={[styles.label, { marginTop: 14 }]}>CHECKLIST DE PROVIDÊNCIAS</Text>
              <View style={styles.addChecklistRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Novo item (ex: comparar marcas, seguro...)"
                  placeholderTextColor="#64748B"
                  value={newChecklistText}
                  onChangeText={setNewChecklistText}
                />
                <TouchableOpacity style={styles.addChecklistBtn} onPress={handleAddChecklistItem} activeOpacity={0.8}>
                  <Feather name="plus" size={16} color="#0B0F19" />
                </TouchableOpacity>
              </View>

              <View style={styles.checklistItemsBox}>
                {checklist.map((item) => (
                  <View key={item.id} style={styles.checkItemRow}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                      onPress={() => handleToggleChecklist(item)}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={item.is_done ? 'check-square' : 'square'}
                        size={16}
                        color={item.is_done ? '#10B981' : '#64748B'}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.checkItemText, item.is_done && styles.checkItemDone]}>
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteChecklistItem(item.id)} style={{ padding: 4 }}>
                      <Feather name="trash-2" size={12} color="#F87171" />
                    </TouchableOpacity>
                  </View>
                ))}
                {checklist.length === 0 && (
                  <Text style={styles.emptyChecklistText}>Nenhum item adicionado ao checklist desta meta.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Mini-Modal: Guardar Dinheiro / Adicionar Aporte */}
      <Modal visible={depositModalVisible} transparent animationType="fade">
        <View style={styles.miniModalOverlay}>
          <View style={styles.miniModalCard}>
            <Text style={styles.miniModalTitle}>Guardar Dinheiro na Meta</Text>
            <Text style={styles.miniModalSub}>Quanto deseja somar ao valor já guardado?</Text>

            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Ex: 200.00"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={depositInput}
              onChangeText={setDepositInput}
              autoFocus
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDepositModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleAddDeposit}>
                <Text style={styles.confirmBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mini-Modal: Alterar Aporte Mensal Planejado */}
      <Modal visible={editContribModalVisible} transparent animationType="fade">
        <View style={styles.miniModalOverlay}>
          <View style={styles.miniModalCard}>
            <Text style={styles.miniModalTitle}>Alterar Aporte Mensal</Text>
            <Text style={styles.miniModalSub}>Isto recalculará a previsão e atualizará a conta fixa.</Text>

            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Ex: 300.00"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={newContribInput}
              onChangeText={setNewContribInput}
              autoFocus
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditContribModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleUpdateMonthlyContribution}>
                <Text style={styles.confirmBtnText}>Atualizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingHorizontal: 16,
    paddingTop: 48,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#131927',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 12,
  },
  goalCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  goalCategory: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  timeTagText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  progressContainer: {
    marginVertical: 12,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#0B0F19',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  amountLabel: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  amountTarget: {
    color: '#64748B',
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 10,
  },
  footerDate: {
    color: '#94A3B8',
    fontSize: 11,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  summaryBox: {
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 10,
  },
  summaryLabelSmall: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  summaryValBig: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
  depositBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  depositBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 11,
  },
  contribRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  contribVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  editContribBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editContribBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  label: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#131927',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    fontSize: 13,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
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
  },
  catBadgeTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  toggleCdiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  toggleCdiText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 14,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#131927',
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: '#10B981',
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
  },
  reportActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  actionBtnExcel: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnExcelText: {
    color: '#0B0F19',
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnShare: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnShareText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  addChecklistRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  addChecklistBtn: {
    backgroundColor: '#10B981',
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checklistItemsBox: {
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  checkItemText: {
    color: '#F8FAFC',
    fontSize: 12,
    flex: 1,
  },
  checkItemDone: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  emptyChecklistText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
  },
  miniModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  miniModalCard: {
    backgroundColor: '#0B0F19',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  miniModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  miniModalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});