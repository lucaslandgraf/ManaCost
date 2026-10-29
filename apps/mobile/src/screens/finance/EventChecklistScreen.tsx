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
  ScrollView,
  Share,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
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

  const [modalVisible, setModalVisible] = useState(false);
  const [itemTitleInput, setItemTitleInput] = useState('');
  const [itemDescInput, setItemDescInput] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [reportModalVisible, setReportModalVisible] = useState(false);

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
  const pendingCount = items.length - completedCount;
  const progressPercent = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  const handleShareWhatsApp = async () => {
    let text = `*CHECKLIST DE BAGAGEM & VIAGEM: ${title.toUpperCase()}*\n`;
    text += `Progresso: ${completedCount} de ${items.length} itens prontos (${Math.round(progressPercent)}%)\n\n`;

    if (items.length > 0) {
      text += `*ITENS DO CHECKLIST:*\n`;
      items.forEach((it) => {
        const icon = it.is_completed ? '[OK]' : '[ ]';
        text += `${icon} *${it.title}*`;
        if (it.description) {
          text += `\n   └ Observação: ${it.description}`;
        }
        text += `\n`;
      });
    } else {
      text += `Nenhum item adicionado no checklist.\n`;
    }

    try {
      await Share.share({ message: text });
    } catch (err: any) {
      Alert.alert('Erro ao compartilhar', err.message);
    }
  };

  const handleExportExcel = async () => {
    if (items.length === 0) {
      Alert.alert('Aviso', 'Não há itens no checklist para exportar.');
      return;
    }

    try {
      const dataRows: any[] = items.map((it) => ({
        'Status': it.is_completed ? 'CONCLUÍDO' : 'PENDENTE',
        'Item': it.title,
        'Descrição / Observações': it.description || '—',
      }));

      dataRows.push(
        { 'Status': '', 'Item': '', 'Descrição / Observações': '' },
        { 'Status': 'RESUMO', 'Item': 'TOTAL DE ITENS', 'Descrição / Observações': items.length },
        { 'Status': 'RESUMO', 'Item': 'ITENS PRONTOS', 'Descrição / Observações': completedCount },
        { 'Status': 'RESUMO', 'Item': 'ITENS PENDENTES', 'Descrição / Observações': pendingCount },
        { 'Status': 'RESUMO', 'Item': 'TAXA DE CONCLUSÃO', 'Descrição / Observações': `${Math.round(progressPercent)}%` }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);

      worksheet['!cols'] = [
        { wch: 16 },
        { wch: 36 },
        { wch: 48 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist');

      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const safeName = title.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Checklist_${safeName}_${Date.now()}.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `Exportar Checklist - ${title}`,
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('Sucesso', `Planilha guardada em: ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar Excel', err.message);
    }
  };

  const handleExportCSV = async () => {
    if (items.length === 0) {
      Alert.alert('Aviso', 'Não há itens no checklist para exportar.');
      return;
    }

    try {
      let csvContent = '\uFEFFStatus;Item;Descrição / Observações\n';

      items.forEach((it) => {
        const st = it.is_completed ? 'CONCLUÍDO' : 'PENDENTE';
        csvContent += `"${st}";"${it.title.replace(/"/g, '""')}";"${(it.description || '').replace(/"/g, '""')}"\n`;
      });

      csvContent += `;\n`;
      csvContent += `RESUMO;"TOTAL DE ITENS";"${items.length}"\n`;
      csvContent += `RESUMO;"ITENS PRONTOS";"${completedCount}"\n`;
      csvContent += `RESUMO;"ITENS PENDENTES";"${pendingCount}"\n`;
      csvContent += `RESUMO;"PERCENTUAL CONCLUÍDO";"${Math.round(progressPercent)}%"\n`;

      const safeName = title.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Checklist_${safeName}_${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Exportar CSV - ${title}`,
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Sucesso', `Ficheiro guardado em: ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar CSV', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={20} color="#10B981" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Checklist de Bagagem</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{title}</Text>
        </View>

        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => setReportModalVisible(true)}
          activeOpacity={0.7}
        >
          <Feather name="bar-chart-2" size={15} color="#38BDF8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingItemId(null);
            setItemTitleInput('');
            setItemDescInput('');
            setModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={12} color="#0B0F19" style={{ marginRight: 3 }} />
          <Text style={styles.addButtonText}>Item</Text>
        </TouchableOpacity>
      </View>

      {/* Cartão de Progresso da Bagagem */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>ITENS PREPARADOS</Text>
          <Text style={styles.progressCount}>
            {completedCount} de {items.length} ({Math.round(progressPercent)}%)
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Lista de Itens */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 100 : 80 }}
          renderItem={({ item }) => (
            <View style={[styles.itemCard, item.is_completed && styles.itemCardCompleted]}>
              <TouchableOpacity
                style={styles.checkboxTouchArea}
                activeOpacity={0.7}
                onPress={() => toggleItem(item)}
              >
                <View style={[styles.checkbox, item.is_completed && styles.checkboxChecked]}>
                  {item.is_completed && <Feather name="check" size={12} color="#0B0F19" />}
                </View>

                <View style={{ flex: 1, paddingRight: 6 }}>
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
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="edit-2" size={13} color="#64748B" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDeleteItem(item.id, item.title)}
                  style={styles.actionBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={13} color="#F87171" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="check-square" size={30} color="#64748B" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>Nenhum item registado no checklist da mala.</Text>
            </View>
          }
        />
      )}

      {/* Modal de Relatório do Checklist */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bottomModalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="bar-chart-2" size={15} color="#38BDF8" />
                  <Text style={styles.modalTitle} numberOfLines={1}>Relatório: Checklist</Text>
                </View>
                <Text style={styles.reportSubtitle}>Auditoria de bagagem para {title}</Text>
              </View>
              <TouchableOpacity onPress={() => setReportModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={styles.reportMetricsCard}>
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Total</Text>
                  <Text style={[styles.reportMetricVal, { color: '#38BDF8' }]}>
                    {items.length}
                  </Text>
                </View>
                <View style={styles.reportMetricDivider} />
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Prontos</Text>
                  <Text style={[styles.reportMetricVal, { color: '#34D399' }]}>
                    {completedCount}
                  </Text>
                </View>
                <View style={styles.reportMetricDivider} />
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Pendentes</Text>
                  <Text style={[styles.reportMetricVal, { color: pendingCount > 0 ? '#F59E0B' : '#64748B' }]}>
                    {pendingCount}
                  </Text>
                </View>
                <View style={styles.reportMetricDivider} />
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Concluído</Text>
                  <Text style={[styles.reportMetricVal, { color: progressPercent === 100 ? '#34D399' : '#38BDF8' }]}>
                    {Math.round(progressPercent)}%
                  </Text>
                </View>
              </View>

              <View style={styles.reportActionsContainer}>
                <TouchableOpacity
                  style={styles.exportExcelBtn}
                  onPress={handleExportExcel}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={14} color="#0B0F19" style={{ marginRight: 6 }} />
                  <Text style={styles.exportExcelBtnText}>Exportar Planilha Excel (.xlsx)</Text>
                </TouchableOpacity>

                <View style={styles.secondaryExportRow}>
                  <TouchableOpacity
                    style={styles.shareWhatsAppBtn}
                    onPress={handleShareWhatsApp}
                    activeOpacity={0.7}
                  >
                    <Feather name="share-2" size={12} color="#38BDF8" style={{ marginRight: 4 }} />
                    <Text style={styles.shareWhatsAppBtnText}>Partilhar Texto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportCsvBtn}
                    onPress={handleExportCSV}
                    activeOpacity={0.7}
                  >
                    <Feather name="download" size={12} color="#F8FAFC" style={{ marginRight: 6 }} />
                    <Text style={styles.exportCsvBtnText}>Exportar CSV</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeFullBtn}
                onPress={() => setReportModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeFullBtnText}>Concluído</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Adicionar / Editar Item */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomModalOverlay}
        >
          <View style={styles.bottomModalCard}>
            <View style={styles.dragHandleBox}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bottomModalHeader}>
              <Text style={styles.modalTitle}>
                {editingItemId ? 'Editar Item' : 'Novo Item do Checklist'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>TÍTULO DO ITEM</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Medicamentos básicos, Casaco térmico"
              placeholderTextColor="#64748B"
              value={itemTitleInput}
              onChangeText={setItemTitleInput}
            />

            <Text style={styles.fieldLabel}>OBSERVAÇÕES / DETALHES (OPCIONAL)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ex: Levar na mala de mão, verificar validade"
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
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveItem}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>
                  {editingItemId ? 'Atualizar' : 'Adicionar Item'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    gap: 8,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#131927',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTitleContainer: {
    flex: 1,
    paddingLeft: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  reportButton: {
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  addButtonText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 12,
  },
  progressCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  progressCount: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#0B0F19',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131927',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  itemCardCompleted: {
    backgroundColor: 'rgba(19, 25, 39, 0.5)',
    borderColor: 'rgba(255, 255, 255, 0.02)',
  },
  checkboxTouchArea: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
    backgroundColor: '#0B0F19',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  itemTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  itemTitleCompleted: {
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  itemDesc: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
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
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  bottomModalCard: {
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
  bottomModalHeader: {
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
  reportSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    fontSize: 13,
  },
  textArea: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
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
  reportMetricsCard: {
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  reportMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  reportMetricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  reportMetricLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  reportMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  reportActionsContainer: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  exportExcelBtn: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportExcelBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryExportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shareWhatsAppBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareWhatsAppBtnText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  exportCsvBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131927',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  exportCsvBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
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
});