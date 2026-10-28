import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { syncAllPendingBillsReminders } from '../../services/notificationService';

export interface BillToPay {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  is_paid: boolean;
  barcode_or_pix?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  currentMonthDate?: Date; // Mês selecionado no Dashboard
  onBillSettled?: () => void;
}

export const BillsToPayModal: React.FC<Props> = ({
  visible,
  onClose,
  currentMonthDate = new Date(),
  onBillSettled,
}) => {
  const { user } = useAuth();
  const [bills, setBills] = useState<BillToPay[]>([]);
  const [loading, setLoading] = useState(false);

  // Controle de Mês e Filtro
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(currentMonthDate));
  const [showAllPending, setShowAllPending] = useState(false);

  // Estados de criação/edição
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedDate(new Date(currentMonthDate));
      setShowAllPending(false);
      fetchBills();
    }
  }, [visible, currentMonthDate]);

  const changeMonth = (delta: number) => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() + delta);
    setSelectedDate(next);
  };

  const formatMonthTitle = (date: Date) => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const applyDateMask = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const normalizeToISODate = (input: string): string => {
    const clean = input.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const year = y.length === 2 ? `20${y}` : y;
        return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 8) {
      return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    }
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3 && parts[0].length === 4) return clean;
    }
    return '';
  };

  const isValidCalendarDate = (isoStr: string): boolean => {
    const parts = isoStr.split('-');
    if (parts.length !== 3) return false;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
    if (year < 1900 || year > 2100 || month < 1 || month > 12) return false;
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  };

  const fetchBills = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bills_to_pay')
        .select('*')
        .eq('user_id', user.id)
        .order('is_paid', { ascending: true })
        .order('due_date', { ascending: true });

      if (error) throw error;
      const loadedBills = data || [];
      setBills(loadedBills);

      // Reagenda automaticamente os alertas de contas futuras no telemóvel
      if (loadedBills.length > 0) {
        syncAllPendingBillsReminders(loadedBills);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar contas a pagar:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBillStatus = async (item: BillToPay) => {
    const nextStatus = !item.is_paid;
    setBills((prev) =>
      prev.map((b) => (b.id === item.id ? { ...b, is_paid: nextStatus } : b))
    );

    try {
      const { error } = await supabase
        .from('bills_to_pay')
        .update({ is_paid: nextStatus })
        .eq('id', item.id);

      if (error) throw error;

      if (nextStatus) {
        const dFormat = item.due_date ? item.due_date.split('-').reverse().join('/') : '';

        Alert.alert(
          'Conta Paga 🎉',
          `Pretende registar "- R$ ${Number(item.amount).toFixed(2)}" no extrato do mês de vencimento (${dFormat})?`,
          [
            {
              text: 'Apenas marcar no checklist',
              style: 'cancel',
              onPress: () => fetchBills(),
            },
            {
              text: 'Registar no Extrato',
              style: 'default',
              onPress: async () => {
                const targetDate = item.due_date || new Date().toISOString().split('T')[0];

                await supabase.from('transactions').insert([
                  {
                    user_id: user?.id,
                    description: item.title,
                    amount: item.amount,
                    type: 'expense',
                    date: targetDate,
                    is_settled: true,
                    budget_bucket: 'needs',
                  },
                ]);
                fetchBills();
                if (onBillSettled) onBillSettled();
              },
            },
          ]
        );
      } else {
        fetchBills();
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar estado da conta.');
      fetchBills();
    }
  };

  const handleSaveBill = async () => {
    const parsedAmount = parseFloat(amountInput.replace(',', '.'));
    if (!titleInput.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Atenção', 'Informe um título e valor válidos.');
      return;
    }

    const isoDate = normalizeToISODate(dateInput);
    if (!isValidCalendarDate(isoDate)) {
      Alert.alert('Data Inválida', 'Informe a data de vencimento no formato DD/MM/AAAA.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: titleInput.trim(),
        amount: parsedAmount,
        due_date: isoDate,
        barcode_or_pix: notesInput.trim() ? notesInput.trim() : null,
      };

      if (editingBillId) {
        const { error } = await supabase
          .from('bills_to_pay')
          .update(payload)
          .eq('id', editingBillId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bills_to_pay').insert([
          {
            user_id: user?.id,
            ...payload,
            is_paid: false,
          },
        ]);
        if (error) throw error;
      }

      setFormModalVisible(false);
      setTitleInput('');
      setAmountInput('');
      setDateInput('');
      setNotesInput('');
      setEditingBillId(null);
      fetchBills();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao guardar conta.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBill = (item: BillToPay) => {
    Alert.alert('Excluir Conta', `Como deseja remover "${item.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apenas do Checklist',
        style: 'default',
        onPress: async () => {
          await supabase.from('bills_to_pay').delete().eq('id', item.id);
          fetchBills();
        },
      },
      {
        text: 'Apagar Tudo (Inclusive do Extrato)',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('bills_to_pay').delete().eq('id', item.id);

          if (user?.id) {
            await supabase
              .from('transactions')
              .delete()
              .eq('user_id', user.id)
              .ilike('description', item.title.trim())
              .eq('date', item.due_date);
          }

          fetchBills();
          if (onBillSettled) onBillSettled();
        },
      },
    ]);
  };

  // Lógica de Filtragem por Mês ou Todas Pendentes
  const targetYear = selectedDate.getFullYear();
  const targetMonth = selectedDate.getMonth();

  const filteredBills = bills.filter((b) => {
    if (showAllPending) {
      return !b.is_paid;
    }
    if (!b.due_date) return false;
    const parts = b.due_date.split('-');
    if (parts.length !== 3) return false;
    const bYear = parseInt(parts[0], 10);
    const bMonth = parseInt(parts[1], 10) - 1;
    return bYear === targetYear && bMonth === targetMonth;
  });

  const totalPending = filteredBills
    .filter((b) => !b.is_paid)
    .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  const totalPaid = filteredBills
    .filter((b) => b.is_paid)
    .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  const handleShareWhatsApp = async () => {
    const labelHeader = showAllPending
      ? 'TODAS AS CONTAS PENDENTES'
      : `CONTAS DE ${formatMonthTitle(selectedDate).toUpperCase()}`;

    let text = `📑 *LEMBRETE: CONTAS A PAGAR - ${labelHeader}*\n`;
    text += `⏳ *Pendente:* R$ ${totalPending.toFixed(2)}\n`;
    text += `✅ *Pago:* R$ ${totalPaid.toFixed(2)}\n\n`;

    if (filteredBills.length > 0) {
      text += `*Discriminação das Contas:*\n`;
      filteredBills.forEach((b) => {
        const dFormat = b.due_date ? b.due_date.split('-').reverse().join('/') : '';
        const icon = b.is_paid ? '✅' : '⏳';
        text += `${icon} *${b.title}* - R$ ${Number(b.amount).toFixed(2)} (Venc: ${dFormat})\n`;
        if (b.barcode_or_pix) text += `   └ Pix/Cód: ${b.barcode_or_pix}\n`;
      });
    } else {
      text += `Nenhuma conta encontrada neste período.\n`;
    }

    try {
      await Share.share({ message: text });
    } catch (err: any) {
      Alert.alert('Erro ao partilhar', err.message);
    }
  };

  const handleExportExcel = async () => {
    if (filteredBills.length === 0) {
      Alert.alert('Aviso', 'Não existem contas filtradas para exportar.');
      return;
    }

    try {
      const dataRows: any[] = filteredBills.map((b) => ({
        'Estado': b.is_paid ? 'PAGA' : 'PENDENTE',
        'Conta / Título': b.title,
        'Valor (R$)': Number(b.amount) || 0,
        'Vencimento': b.due_date ? b.due_date.split('-').reverse().join('/') : '',
        'Pix / Código de Barras': b.barcode_or_pix || '—',
      }));

      dataRows.push(
        { 'Estado': '', 'Conta / Título': '', 'Valor (R$)': '', 'Vencimento': '', 'Pix / Código de Barras': '' },
        { 'Estado': 'RESUMO', 'Conta / Título': 'TOTAL PENDENTE', 'Valor (R$)': totalPending, 'Vencimento': '', 'Pix / Código de Barras': '' },
        { 'Estado': 'RESUMO', 'Conta / Título': 'TOTAL PAGO', 'Valor (R$)': totalPaid, 'Vencimento': '', 'Pix / Código de Barras': '' }
      );

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 32 },
        { wch: 16 },
        { wch: 16 },
        { wch: 38 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contas');

      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const fileName = `Contas_${Date.now()}.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Exportar Contas a Pagar',
          UTI: 'com.microsoft.excel.xlsx',
        });
      }
    } catch (err: any) {
      Alert.alert('Erro ao exportar Excel', err.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Cabeçalho */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>📑 Contas a Pagar & Lembretes</Text>
              <Text style={styles.sub}>Checklist e prazos de boletos e faturas</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Seletor de Mês & Botão "Todas Pendentes" */}
          <View style={styles.filterControlsRow}>
            {!showAllPending ? (
              <View style={styles.monthNav}>
                <TouchableOpacity style={styles.monthArrowBtn} onPress={() => changeMonth(-1)}>
                  <Text style={styles.monthArrowText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.monthTitleText}>{formatMonthTitle(selectedDate)}</Text>
                <TouchableOpacity style={styles.monthArrowBtn} onPress={() => changeMonth(1)}>
                  <Text style={styles.monthArrowText}>›</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.allPendingLabelBox}>
                <Text style={styles.allPendingLabelText}>⏳ Todas as Contas Pendentes</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.filterToggleBtn, showAllPending && styles.filterToggleBtnActive]}
              onPress={() => setShowAllPending(!showAllPending)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterToggleText, showAllPending && styles.filterToggleTextActive]}>
                {showAllPending ? 'Ver por Mês' : 'Todas Pendentes'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Resumo Pendente vs Pago */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Total Pendente</Text>
              <Text style={[styles.summaryVal, { color: '#EF4444' }]}>
                R$ {totalPending.toFixed(2)}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>Total Pago</Text>
              <Text style={[styles.summaryVal, { color: '#10B981' }]}>
                R$ {totalPaid.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Botões de Ação Topo */}
          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={styles.btnAdd}
              onPress={() => {
                setEditingBillId(null);
                setTitleInput('');
                setAmountInput('');
                const y = selectedDate.getFullYear();
                const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                setDateInput(`10/${m}/${y}`);
                setNotesInput('');
                setFormModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.btnAddText}>+ Nova Conta</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnExportMini} onPress={handleShareWhatsApp}>
              <Text style={styles.btnExportMiniText}>💬 Enviar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnExportMini} onPress={handleExportExcel}>
              <Text style={styles.btnExportMiniText}>📊 Excel</Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Contas */}
          {loading ? (
            <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={filteredBills}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => {
                const dFormat = item.due_date ? item.due_date.split('-').reverse().join('/') : '';
                return (
                  <View style={styles.itemRow}>
                    <TouchableOpacity
                      style={styles.checkArea}
                      activeOpacity={0.7}
                      onPress={() => toggleBillStatus(item)}
                    >
                      <View style={[styles.checkbox, item.is_paid && styles.checkboxChecked]}>
                        {item.is_paid && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, item.is_paid && styles.itemTitlePaid]}>
                          {item.title}
                        </Text>
                        <Text style={styles.itemDate}>Vencimento: {dFormat}</Text>
                        {item.barcode_or_pix ? (
                          <Text style={styles.itemNotes} numberOfLines={1}>
                            Pix/Cód: {item.barcode_or_pix}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    <View style={styles.rightActions}>
                      <Text
                        style={[
                          styles.itemAmount,
                          { color: item.is_paid ? '#10B981' : '#EF4444' },
                        ]}
                      >
                        R$ {Number(item.amount).toFixed(2)}
                      </Text>
                      <View style={styles.iconsRow}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => {
                            setEditingBillId(item.id);
                            setTitleInput(item.title);
                            setAmountInput(String(item.amount));
                            setDateInput(dFormat);
                            setNotesInput(item.barcode_or_pix || '');
                            setFormModalVisible(true);
                          }}
                        >
                          <Text style={styles.iconAction}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleDeleteBill(item)}
                        >
                          <Text style={styles.iconAction}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {showAllPending
                    ? '🎉 Não há contas pendentes no momento!'
                    : `Nenhuma conta encontrada em ${formatMonthTitle(selectedDate)}.\nToque em "+ Nova Conta" para adicionar.`}
                </Text>
              }
            />
          )}
        </View>
      </View>

      {/* Modal de Criação / Edição de Conta */}
      <Modal visible={formModalVisible} transparent animationType="fade">
        <View style={styles.innerModalOverlay}>
          <View style={styles.innerCard}>
            <Text style={styles.innerTitle}>
              {editingBillId ? 'Editar Conta' : 'Nova Conta a Pagar'}
            </Text>

            <Text style={styles.inputLabel}>Descrição da Conta:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Fatura Cartão, Conta de Luz"
              placeholderTextColor="#64748B"
              value={titleInput}
              onChangeText={setTitleInput}
            />

            <Text style={styles.inputLabel}>Valor (R$):</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
            />

            <Text style={styles.inputLabel}>Data de Vencimento (DD/MM/AAAA):</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 10/11/2026"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              maxLength={10}
              value={dateInput}
              onChangeText={(txt) => setDateInput(applyDateMask(txt))}
            />

            <Text style={styles.inputLabel}>Chave Pix ou Código de Barras (opcional):</Text>
            <TextInput
              style={styles.input}
              placeholder="Cole a chave Pix ou linha digitável"
              placeholderTextColor="#64748B"
              value={notesInput}
              onChangeText={setNotesInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setFormModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveBill}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'A guardar...' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: 'bold', color: '#F8FAFC' },
  sub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  closeBtn: { padding: 4 },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  filterControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 6,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthArrowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  monthArrowText: {
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: 'bold',
  },
  monthTitleText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
  },
  allPendingLabelBox: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  allPendingLabelText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: 'bold',
  },
  filterToggleBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterToggleBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  filterToggleText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterToggleTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  summaryBox: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: '#334155' },
  summaryLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 3 },
  summaryVal: { fontSize: 15, fontWeight: 'bold' },
  topActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  btnAdd: {
    flex: 2,
    backgroundColor: '#10B981',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnAddText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 13 },
  btnExportMini: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnExportMiniText: { color: '#38BDF8', fontWeight: '600', fontSize: 12 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkmark: { color: '#0F172A', fontSize: 13, fontWeight: 'bold' },
  itemTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '500' },
  itemTitlePaid: { color: '#64748B', textDecorationLine: 'line-through' },
  itemDate: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  itemNotes: { color: '#38BDF8', fontSize: 10, marginTop: 2 },
  rightActions: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 14, fontWeight: 'bold' },
  iconsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  iconBtn: { padding: 2 },
  iconAction: { fontSize: 13 },
  emptyText: { color: '#64748B', textAlign: 'center', marginVertical: 30, fontSize: 13, lineHeight: 18 },
  innerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  innerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  innerTitle: { fontSize: 17, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 12 },
  inputLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 5 },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 11,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 14,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 9, paddingHorizontal: 14 },
  cancelBtnText: { color: '#94A3B8', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveBtnText: { color: '#F8FAFC', fontWeight: 'bold' },
});