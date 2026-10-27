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
} from 'react-native';
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

  // Modal criação
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [targetBudget, setTargetBudget] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [saving, setSaving] = useState(false);

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Busca eventos
      const { data: eventsData, error } = await supabase
        .from('budget_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2. Busca gastos de cada evento para calcular total gasto
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
      Alert.alert('Atenção', 'Informe o nome do evento/viagem.');
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
        ? `Deseja arquivar "${event.title}"? O evento sairá da tela ativa e ficará salvo no histórico.`
        : `Deseja reabrir "${event.title}" e movê-lo de volta para os eventos ativos?`,
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
              Alert.alert('Erro', err.message || 'Falha ao atualizar status.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteEvent = (id: string, eventTitle: string) => {
    Alert.alert(
      'Excluir Evento',
      `Tem certeza de que deseja apagar "${eventTitle}" e todos os registros associados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('event_expenses').delete().eq('event_id', id);
              await supabase.from('budget_events').delete().eq('id', id);
              fetchEvents();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao excluir evento.');
            }
          },
        },
      ]
    );
  };

  // Filtragem pela aba ativa
  const filteredEvents = events.filter((ev) =>
    activeTab === 'archived' ? ev.is_archived : !ev.is_archived
  );

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Viagens & Eventos</Text>
          <Text style={styles.sub}>Orçamentos fechados e dedicados</Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.newBtnText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Seletor de Abas: Ativos / Arquivados */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
          onPress={() => setActiveTab('active')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            ✈️ Em Andamento ({events.filter((e) => !e.is_archived).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'archived' && styles.tabButtonActive]}
          onPress={() => setActiveTab('archived')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'archived' && styles.tabTextActive]}>
            📁 Concluídos ({events.filter((e) => e.is_archived).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 40 }} />
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
              tintColor="#fff"
            />
          }
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => {
            const spent = item.total_spent || 0;
            const target = item.target_budget || 0;
            const progress = target > 0 ? Math.min((spent / target) * 100, 100) : 0;

            return (
              <TouchableOpacity
                style={[styles.card, item.is_archived && styles.cardArchived]}
                activeOpacity={0.8}
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
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.cardTitle, item.is_archived && styles.cardTitleArchived]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.is_archived && (
                      <View style={styles.archivedBadge}>
                        <Text style={styles.archivedBadgeText}>✓ CONCLUÍDO</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.actionsRightRow}>
                    <View style={styles.currencyBadge}>
                      <Text style={styles.currencyBadgeText}>{item.currency}</Text>
                    </View>

                    {/* Botão de Arquivar / Desarquivar */}
                    <TouchableOpacity
                      onPress={() => handleToggleArchive(item)}
                      style={styles.archiveActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.archiveActionBtnText}>
                        {item.is_archived ? '🔄' : '📦'}
                      </Text>
                    </TouchableOpacity>

                    {/* Botão de Excluir */}
                    <TouchableOpacity
                      onPress={() => handleDeleteEvent(item.id, item.title)}
                      style={styles.deleteActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.deleteActionBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.spentText}>
                    Gasto: {item.currency} {spent.toFixed(2)}
                  </Text>
                  {target > 0 && (
                    <Text style={styles.targetText}>
                      Meta: {item.currency} {target.toFixed(2)}
                    </Text>
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
                              : progress >= 100
                              ? '#EF4444'
                              : '#38BDF8',
                        },
                      ]}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {activeTab === 'active'
                ? 'Nenhum evento ativo no momento.\nToque em "+ Novo" para planejar uma viagem.'
                : 'Nenhum evento arquivado no histórico.'}
            </Text>
          }
        />
      )}
      <View style={styles.bottomBarBarrier} />

      {/* Modal Criar Evento */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo Evento / Viagem</Text>

            <Text style={styles.inputLabel}>Nome do Evento:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Eurotrip 2026, Fim de Semana Praia"
              placeholderTextColor="#64748B"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.inputLabel}>Orçamento Previsto (Opcional):</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={targetBudget}
              onChangeText={setTargetBudget}
            />

            <Text style={styles.inputLabel}>Moeda:</Text>
            <View style={styles.currencyRow}>
              {['BRL', 'EUR', 'USD'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
                  onPress={() => setCurrency(c)}
                >
                  <Text
                    style={[
                      styles.currencyBtnText,
                      currency === c && styles.currencyBtnTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCreateEvent}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Criar'}</Text>
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
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 48,
  },
  bottomBarBarrier: {
    height: Platform.OS === 'android' ? 68 : 0,
    backgroundColor: '#0F172A',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  backBtnText: { color: '#38BDF8', fontSize: 26, fontWeight: 'bold', lineHeight: 28 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  sub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  newBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  newBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardArchived: {
    opacity: 0.65,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cardTitleArchived: {
    color: '#94A3B8',
  },
  archivedBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  archivedBadgeText: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: 'bold',
  },
  actionsRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currencyBadgeText: { color: '#38BDF8', fontSize: 11, fontWeight: 'bold' },
  archiveActionBtn: {
    padding: 4,
  },
  archiveActionBtnText: {
    fontSize: 14,
  },
  deleteActionBtn: {
    padding: 4,
  },
  deleteActionBtnText: {
    fontSize: 14,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spentText: { color: '#EF4444', fontSize: 13, fontWeight: 'bold' },
  targetText: { color: '#94A3B8', fontSize: 12 },
  progressTrack: {
    height: 4,
    backgroundColor: '#0F172A',
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBar: { height: '100%', borderRadius: 2 },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 13,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: 'bold', marginBottom: 14 },
  inputLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
    fontSize: 14,
  },
  currencyRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  currencyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencyBtnActive: { borderColor: '#38BDF8', backgroundColor: 'rgba(56, 189, 248, 0.15)' },
  currencyBtnText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  currencyBtnTextActive: { color: '#38BDF8', fontWeight: 'bold' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  saveBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
});