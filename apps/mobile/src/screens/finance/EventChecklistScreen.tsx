import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { supabase } from '../../config/supabase';

interface ChecklistItem {
  id: string;
  title: string;
  description?: string | null;
  is_completed: boolean;
}

const DEFAULT_ITEMS: { title: string; description?: string }[] = [
  { title: 'Levar Powerbank', description: 'Até 20.000mAh na mala de mão' },
  { title: 'Levar Tomada Universal / Adaptador', description: 'Padrão europeu / tipo C e F' },
  { title: 'Pochete interna (Doleira)', description: 'Para passaporte, cartões e dinheiro em espécie' },
  { title: 'Kit Higiene', description: 'Escova, pasta, fio dental, desodorante sólido' },
  { title: 'Medicamentos básicos', description: 'Dipirona, antialérgico, curativos, remédio p/ enjoo' },
  { title: 'Apoio de pescoço', description: 'Para os voos longos e viagens de trem' },
  { title: 'Máscara de olho', description: 'Blackout para dormir' },
  { title: 'Protetor auricular', description: 'Espuma ou silicone para isolamento acústico' },
];

export function EventChecklistScreen({ route, navigation }: any) {
  const { eventId, title } = route.params;

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de adicionar/editar
  const [modalVisible, setModalVisible] = useState(false);
  const [itemTitleInput, setItemTitleInput] = useState('');
  const [itemDescInput, setItemDescInput] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const fetchChecklist = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('event_checklists')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Se a lista estiver vazia pela primeira vez, insere os itens padrão com descrições
      if (!data || data.length === 0) {
        const defaultInserts = DEFAULT_ITEMS.map((item) => ({
          event_id: eventId,
          user_id: user.id,
          title: item.title,
          description: item.description || null,
          is_completed: false,
        }));

        const { data: createdDefaults, error: insertError } = await supabase
          .from('event_checklists')
          .insert(defaultInserts)
          .select();

        if (insertError) throw insertError;
        setItems(createdDefaults || []);
      } else {
        setItems(data);
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar o checklist.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecklist();
  }, []);

  const toggleItem = async (item: ChecklistItem) => {
    const updatedStatus = !item.is_completed;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_completed: updatedStatus } : it))
    );

    await supabase
      .from('event_checklists')
      .update({ is_completed: updatedStatus })
      .eq('id', item.id);
  };

  const handleSaveItem = async () => {
    if (!itemTitleInput.trim()) {
      Alert.alert('Atenção', 'Informe o título do item.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        title: itemTitleInput.trim(),
        description: itemDescInput.trim() ? itemDescInput.trim() : null,
      };

      if (editingItemId) {
        const { error } = await supabase
          .from('event_checklists')
          .update(payload)
          .eq('id', editingItemId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('event_checklists').insert([
          {
            event_id: eventId,
            user_id: user.id,
            ...payload,
            is_completed: false,
          },
        ]);

        if (error) throw error;
      }

      setModalVisible(false);
      setItemTitleInput('');
      setItemDescInput('');
      setEditingItemId(null);
      fetchChecklist();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao salvar item.');
    }
  };

  const handleDeleteItem = (id: string, name: string) => {
    Alert.alert('Excluir Item', `Deseja remover "${name}" do checklist?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('event_checklists').delete().eq('id', id);
          fetchChecklist();
        },
      },
    ]);
  };

  const completedCount = items.filter((it) => it.is_completed).length;
  const progressPercent = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Checklist de Viagem</Text>
          <Text style={styles.headerSub}>{title}</Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingItemId(null);
            setItemTitleInput('');
            setItemDescInput('');
            setModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+ Item</Text>
        </TouchableOpacity>
      </View>

      {/* Card de Progresso */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Itens Prontos</Text>
          <Text style={styles.progressCount}>
            {completedCount} de {items.length} ({Math.round(progressPercent)}%)
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#38BDF8" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                activeOpacity={0.7}
                onPress={() => toggleItem(item)}
              >
                <View style={[styles.checkbox, item.is_completed && styles.checkboxChecked]}>
                  {item.is_completed && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text
                    style={[
                      styles.itemTitle,
                      item.is_completed && styles.itemTitleCompleted,
                    ]}
                  >
                    {item.title}
                  </Text>
                  {item.description ? (
                    <Text
                      style={[
                        styles.itemDesc,
                        item.is_completed && styles.itemDescCompleted,
                      ]}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingItemId(item.id);
                    setItemTitleInput(item.title);
                    setItemDescInput(item.description || '');
                    setModalVisible(true);
                  }}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionIcon}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDeleteItem(item.id, item.title)}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionIcon}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nenhum item no checklist.</Text>
          }
        />
      )}

      {/* Modal Adicionar / Editar Item */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingItemId ? 'Editar Item' : 'Novo Item do Checklist'}
            </Text>

            <Text style={styles.inputLabel}>Título:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Medicamentos básicos"
              placeholderTextColor="#64748B"
              value={itemTitleInput}
              onChangeText={setItemTitleInput}
            />

            <Text style={styles.inputLabel}>Descrição / Itens específicos (opcional):</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ex: Dipirona, Antialérgico, Band-aid, Curativos"
              placeholderTextColor="#64748B"
              value={itemDescInput}
              onChangeText={setItemDescInput}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem}>
                <Text style={styles.saveBtnText}>Salvar</Text>
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
    marginBottom: 16,
    gap: 10,
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
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  headerSub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  addButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  progressCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  progressCount: { color: '#38BDF8', fontSize: 13, fontWeight: 'bold' },
  progressTrack: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkmark: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '500',
  },
  itemTitleCompleted: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  itemDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  itemDescCompleted: {
    color: '#475569',
    textDecorationLine: 'line-through',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    padding: 4,
  },
  actionIcon: {
    fontSize: 14,
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
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 14 },
  inputLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
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
  textArea: {
    height: 70,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  saveBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
});