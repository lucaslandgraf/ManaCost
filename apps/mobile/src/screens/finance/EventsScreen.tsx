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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';

interface BudgetEvent {
  id: string;
  title: string;
  target_budget: number;
  currency: string;
  description?: string;
  is_archived?: boolean;
  total_spent?: number;
}

export function EventsScreen({ navigation }: any) {
  const [events, setEvents] = useState<BudgetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [targetBudget, setTargetBudget] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [saving, setSaving] = useState(false);

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: eventsData, error } = await supabase
        .from('budget_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: expensesData } = await supabase
        .from('event_expenses')
        .select('event_id, amount');

      const spentMap: Record<string, number> = {};
      (expensesData || []).forEach((exp) => {
        spentMap[exp.event_id] = (spentMap[exp.event_id] || 0) + Number(exp.amount || 0);
      });

      const enriched = (eventsData || []).map((ev) => ({
        ...ev,
        total_spent: spentMap[ev.id] || 0,
        is_archived: Boolean(ev.is_archived),
      }));

      setEvents(enriched);
    } catch (err: any) {
      console.warn('Erro ao carregar eventos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreateEvent = async () => {
    if (!title.trim()) {
      Alert.alert('Atenção', 'Informe o nome do evento ou viagem.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const numBudget = targetBudget ? parseFloat(targetBudget.replace(',', '.')) : 0;

      const { error } = await supabase.from('budget_events').insert([
        {
          user_id: user.id,
          title: title.trim(),
          target_budget: isNaN(numBudget) ? 0 : numBudget,
          currency: currency.trim() || 'BRL',
          is_archived: false,
        },
      ]);

      if (error) throw error;

      setModalVisible(false);
      setTitle('');
      setTargetBudget('');
      fetchEvents();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao criar evento.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (event: BudgetEvent) => {
    const nextStatus = !event.is_archived;
    Alert.alert(
      nextStatus ? 'Concluir & Arquivar' : 'Reativar Evento',
      nextStatus
        ? `Pretende arquivar "${event.title}"? O evento sairá da visualização principal e ficará registado no histórico.`
        : `Pretende reabrir "${event.title}" e movê-lo de volta para as viagens ativas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextStatus ? 'Sim, Arquivar' : 'Sim, Reativar',
          style: nextStatus ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('budget_events')
                .update({ is_archived: nextStatus })
                .eq('id', event.id);

              if (error) throw error;

              setEvents((prev) =>
                prev.map((e) => (e.id === event.id ? { ...e, is_archived: nextStatus } : e))
              );
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao atualizar estado.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteEvent = (id: string, eventTitle: string) => {
    Alert.alert(
      'Remover Evento',
      `Tem a certeza de que deseja apagar "${eventTitle}" e todos os registos associados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('event_expenses').delete().eq('event_id', id);
              await supabase.from('budget_events').delete().eq('id', id);
              fetchEvents();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao eliminar evento.');
            }
          },
        },
      ]
    );
  };

  const filteredEvents = events.filter((ev) =>
    activeTab === 'archived' ? ev.is_archived : !ev.is_archived
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={20} color="#10B981" />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingLeft: 4 }}>
          <Text style={styles.title}>Viagens & Eventos</Text>
          <Text style={styles.sub}>Orçamentos fechados e checklists de bagagem</Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={13} color="#0B0F19" style={{ marginRight: 4 }} />
          <Text style={styles.newBtnText}>Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Seletor de Abas: Ativos vs. Concluídos */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
          onPress={() => setActiveTab('active')}
          activeOpacity={0.7}
        >
          <Feather
            name="send"
            size={12}
            color={activeTab === 'active' ? '#10B981' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            Em Andamento ({events.filter((e) => !e.is_archived).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'archived' && styles.tabButtonActive]}
          onPress={() => setActiveTab('archived')}
          activeOpacity={0.7}
        >
          <Feather
            name="archive"
            size={12}
            color={activeTab === 'archived' ? '#10B981' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabText, activeTab === 'archived' && styles.tabTextActive]}>
            Concluídos ({events.filter((e) => e.is_archived).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista de Viagens com espaçamento extra para a barra inferior do sistema */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>A carregar orçamentos de viagem...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchEvents();
              }}
              tintColor="#10B981"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const spent = item.total_spent || 0;
            const target = item.target_budget || 0;
            const progress = target > 0 ? Math.min((spent / target) * 100, 100) : 0;
            const isOverBudget = target > 0 && spent > target;

            return (
              <TouchableOpacity
                style={[styles.card, item.is_archived && styles.cardArchived]}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('EventDetails', {
                    eventId: item.id,
                    title: item.title,
                    currency: item.currency,
                    targetBudget: item.target_budget,
                  })
                }
              >
                <View style={styles.cardHeader}>
                  <View style={styles.iconCircle}>
                    <Feather name="send" size={15} color="#38BDF8" />
                  </View>

                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.cardTitle, item.is_archived && styles.cardTitleArchived]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.is_archived ? (
                      <View style={styles.archivedBadge}>
                        <Feather name="check" size={9} color="#94A3B8" style={{ marginRight: 3 }} />
                        <Text style={styles.archivedBadgeText}>CONCLUÍDO</Text>
                      </View>
                    ) : (
                      <Text style={styles.currencySubText}>Moeda oficial: {item.currency}</Text>
                    )}
                  </View>

                  <View style={styles.actionsRightRow}>
                    <View style={styles.currencyBadge}>
                      <Text style={styles.currencyBadgeText}>{item.currency}</Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleToggleArchive(item)}
                      style={styles.actionIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather
                        name={item.is_archived ? 'rotate-ccw' : 'archive'}
                        size={13}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDeleteEvent(item.id, item.title)}
                      style={styles.actionIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={13} color="#F87171" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Métricas e Barra de Progresso */}
                <View style={styles.cardMetricsRow}>
                  <View>
                    <Text style={styles.metricLabel}>Total gasto</Text>
                    <Text style={[styles.spentText, isOverBudget && { color: '#F87171' }]}>
                      {item.currency} {spent.toFixed(2)}
                    </Text>
                  </View>

                  {target > 0 && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.metricLabel}>Meta estipulada</Text>
                      <Text style={styles.targetText}>
                        {item.currency} {target.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>

                {target > 0 && (
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${progress}%`,
                          backgroundColor:
                            item.is_archived
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
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="send" size={32} color="#64748B" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>
                {activeTab === 'active'
                  ? 'Nenhuma viagem ativa no momento.\nToque em "+ Novo" para criar um orçamento dedicado.'
                  : 'Nenhum evento arquivado no histórico.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Modal Criar Evento */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Novo Orçamento de Viagem</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>NOME DO EVENTO OU DESTINO</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Eurotrip 2026, Florianópolis, Casamento"
              placeholderTextColor="#64748B"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.fieldLabel}>META DE GASTOS / TETO MÁXIMO (OPCIONAL)</Text>
            <TextInput
              style={[styles.input, styles.inputBold]}
              placeholder="0,00"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              value={targetBudget}
              onChangeText={setTargetBudget}
            />

            <Text style={styles.fieldLabel}>MOEDA PRINCIPAL</Text>
            <View style={styles.currencyRow}>
              {['BRL', 'EUR', 'USD'].map((c) => {
                const isActive = currency === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.currencyBtn, isActive && styles.currencyBtnActive]}
                    onPress={() => setCurrency(c)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.currencyBtnText, isActive && styles.currencyBtnTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCreateEvent}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>{saving ? 'A criar...' : 'Criar Viagem'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 44,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#131927',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    marginTop: 1,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  newBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0B0F19',
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: Platform.OS === 'android' ? 140 : 90,
  },
  card: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardArchived: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  cardTitleArchived: {
    color: '#94A3B8',
  },
  currencySubText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  archivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  archivedBadgeText: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
  },
  actionsRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currencyBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currencyBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
  },
  actionIconBtn: {
    padding: 4,
  },
  cardMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  spentText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  targetText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#0B0F19',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
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
  modalHeaderRow: {
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
  currencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  currencyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#131927',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  currencyBtnActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  currencyBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  currencyBtnTextActive: {
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
});