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
} from 'react-native';
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

  // Modal de adicionar/editar
  const [modalVisible, setModalVisible] = useState(false);
  const [itemTitleInput, setItemTitleInput] = useState('');
  const [itemDescInput, setItemDescInput] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Modal de Relatório do Checklist
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

  // Compartilhamento via WhatsApp / Texto
  const handleShareWhatsApp = async () => {
    let text = `📋 *CHECKLIST DE BAGAGEM & VIAGEM: ${title.toUpperCase()}*\n`;
    text += `Progresso: ${completedCount} de ${items.length} itens prontos (${Math.round(progressPercent)}%)\n\n`;

    if (items.length > 0) {
      text += `*ITENS DO CHECKLIST:*\n`;
      items.forEach((it) => {
        const icon = it.is_completed ? '✅' : '⬜';
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

  // Exportação em Excel (.xlsx)
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

      // Linha em branco e Totais Consolidados no rodapé
      dataRows.push(
        { 'Status': '', 'Item': '', 'Descrição / Observações': '' },
        { 'Status': 'RESUMO', 'Item': 'TOTAL DE ITENS', 'Descrição / Observações': items.length },
        { 'Status': 'RESUMO', 'Item': 'ITENS PRONTOS', 'Descrição / Observações': completedCount },
        { 'Status': 'RESUMO', 'Item': 'ITENS PENDENTES', 'Descrição / Observações': pendingCount },
        { 'Status': 'RESUMO', 'Item': 'TAXA DE CONCLUSÃO', 'Descrição / Observações': `${Math.round(progressPercent)}%` }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);

      worksheet['!cols'] = [
        { wch: 16 }, // Status
        { wch: 36 }, // Item
        { wch: 48 }, // Descrição / Observações
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

  // Exportação em CSV (com UTF-8 BOM)
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

        {/* Botão de Relatório do Checklist */}
        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => setReportModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.reportButtonIcon}>📊</Text>
        </TouchableOpacity>

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
          contentContainerStyle={{ paddingBottom: 100 }}
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
      <View style={styles.bottomBarBarrier} />

      {/* Modal de Relatório e Exportação do Checklist */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.bottomModalOverlay}>
          <View style={styles.bottomModalCard}>
            <View style={styles.bottomModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>📊 Relatório: Checklist</Text>
                <Text style={styles.reportSubtitle}>Auditoria de bagagem para {title}</Text>
              </View>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Card de Indicadores do Checklist */}
              <View style={styles.reportMetricsCard}>
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Total de Itens</Text>
                  <Text style={[styles.reportMetricVal, { color: '#38BDF8' }]}>
                    {items.length}
                  </Text>
                </View>
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Prontos</Text>
                  <Text style={[styles.reportMetricVal, { color: '#10B981' }]}>
                    {completedCount}
                  </Text>
                </View>
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Pendentes</Text>
                  <Text style={[styles.reportMetricVal, { color: pendingCount > 0 ? '#F59E0B' : '#64748B' }]}>
                    {pendingCount}
                  </Text>
                </View>
                <View style={styles.reportMetricBox}>
                  <Text style={styles.reportMetricLabel}>Concluído</Text>
                  <Text style={[styles.reportMetricVal, { color: progressPercent === 100 ? '#10B981' : '#38BDF8' }]}>
                    {Math.round(progressPercent)}%
                  </Text>
                </View>
              </View>

              {/* Botões de Exportação */}
              <View style={styles.reportActionsContainer}>
                <TouchableOpacity
                  style={styles.exportExcelBtn}
                  onPress={handleExportExcel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.exportExcelBtnText}>📊 Exportar Planilha Excel (.xlsx)</Text>
                </TouchableOpacity>

                <View style={styles.secondaryExportRow}>
                  <TouchableOpacity
                    style={styles.shareWhatsAppBtn}
                    onPress={handleShareWhatsApp}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.shareWhatsAppBtnText}>💬 WhatsApp / Texto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportCsvBtn}
                    onPress={handleExportCSV}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.exportCsvBtnText}>📄 Exportar CSV</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeFullBtn}
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={styles.closeFullBtnText}>Fechar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  bottomBarBarrier: {
    height: Platform.OS === 'android' ? 68 : 0,
    backgroundColor: '#0F172A',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
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
  reportButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportButtonIcon: { fontSize: 16 },
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
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 4 },
  reportSubtitle: { fontSize: 11, color: '#64748B', marginBottom: 14 },
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
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  bottomModalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  bottomModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold', padding: 4 },
  reportMetricsCard: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  reportMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  reportMetricLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 3,
  },
  reportMetricVal: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  reportActionsContainer: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 8,
  },
  exportExcelBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportExcelBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 14,
  },
  secondaryExportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shareWhatsAppBtn: {
    flex: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareWhatsAppBtnText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 12,
  },
  exportCsvBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportCsvBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
  closeFullBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  closeFullBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 14 },
});