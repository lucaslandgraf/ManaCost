import React, { useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../config/supabase';

interface BudgetEvent {
  id: string;
  title: string;
  description?: string;
  target_budget: number;
  currency: string;
  start_date?: string;
  end_date?: string;
  total_spent?: number;
}

export function EventsScreen({ navigation }: any) {
  const [events, setEvents] = useState<BudgetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [newCurrency, setNewCurrency] = useState('BRL');

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: eventsData, error } = await supabase
        .from('budget_events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calcula o total gasto de cada evento
      const eventsWithTotals = await Promise.all(
        (eventsData || []).map(async (ev) => {
          const { data: expenses } = await supabase
            .from('event_expenses')
            .select('amount')
            .eq('event_id', ev.id);

          const total = (expenses || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
          return { ...ev, total_spent: total };
        })
      );

      setEvents(eventsWithTotals);
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar os eventos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const handleCreateEvent = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Atenção', 'Indique um título para a viagem ou evento.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('budget_events').insert([
        {
          user_id: user.id,
          title: newTitle.trim(),
          target_budget: parseFloat(newBudget.replace(',', '.')) || 0,
          currency: newCurrency,
        },
      ]);

      if (error) throw error;

      setModalVisible(false);
      setNewTitle('');
      setNewBudget('');
      fetchEvents();
    } catch (err: any) {
      console.error('Erro detalhado:', err);
      Alert.alert('Erro', err.message || JSON.stringify(err));
    }
  };

  const handleDeleteEvent = (id: string, title: string) => {
    Alert.alert(
      'Eliminar Evento',
      `Tem a certeza de que pretende eliminar "${title}" e todos os gastos associados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Elimina os gastos associados
              await supabase.from('event_expenses').delete().eq('event_id', id);

              // 2. Elimina o evento
              const { error } = await supabase.from('budget_events').delete().eq('id', id);
              if (error) throw error;

              fetchEvents();
              Alert.alert('Sucesso', 'Evento removido com sucesso!');
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao eliminar o evento.');
            }
          },
        },
      ]
    );
  };

  const renderEventCard = ({ item }: { item: BudgetEvent }) => {
    const spent = item.total_spent || 0;
    const target = item.target_budget || 0;
    const progress = target > 0 ? Math.min((spent / target) * 100, 100) : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('EventDetails', {
            eventId: item.id,
            title: item.title,
            currency: item.currency,
            targetBudget: item.target_budget,
          })
        }
        onLongPress={() => handleDeleteEvent(item.id, item.title)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <View style={styles.headerRightActions}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>{item.currency}</Text>
            </View>
            <TouchableOpacity
              style={styles.deleteQuickBtn}
              onPress={() => handleDeleteEvent(item.id, item.title)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.deleteQuickIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.valuesRow}>
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
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Cabeçalho com botão de retorno */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Viagens & Eventos</Text>
          <Text style={styles.headerSub}>Orçamentos fechados e dedicados</Text>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.createButtonText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nenhuma viagem ou evento registado ainda.</Text>
          }
        />
      )}

      {/* Modal de Criação de Evento */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Evento / Viagem</Text>

            <TextInput
              style={styles.input}
              placeholder="Nome (ex: Viagem, Evento, etc.)"
              placeholderTextColor="#64748B"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <TextInput
              style={styles.input}
              placeholder="Orçamento Previsto (opcional)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={newBudget}
              onChangeText={setNewBudget}
            />

            <View style={styles.currencySelector}>
              {['BRL', 'EUR', 'USD'].map((cur) => (
                <TouchableOpacity
                  key={cur}
                  style={[styles.currencyBtn, newCurrency === cur && styles.currencyBtnActive]}
                  onPress={() => setNewCurrency(cur)}
                >
                  <Text
                    style={[
                      styles.currencyBtnText,
                      newCurrency === cur && styles.currencyBtnTextActive,
                    ]}
                  >
                    {cur}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreateEvent}>
                <Text style={styles.saveBtnText}>Guardar</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
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
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  createButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
    flex: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteQuickBtn: {
    padding: 4,
  },
  deleteQuickIcon: {
    fontSize: 13,
  },
  currencyBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currencyBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  valuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  spentText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 15,
  },
  targetText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 3,
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
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
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 14,
  },
  currencySelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  currencyBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencyBtnActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  currencyBtnText: {
    color: '#94A3B8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  currencyBtnTextActive: {
    color: '#0F172A',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
});