import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
} from 'react-native';
import { supabase } from '../../config/supabase';

interface PurchasedItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PurchaseDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  transactionId: string;
  description: string;
  date: string;
  amount: number;
  onUpdated?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}

export const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({
  visible,
  onClose,
  transactionId,
  description,
  date,
  amount,
  onUpdated,
  onDeleted,
}) => {
  const [items, setItems] = useState<PurchasedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchaseRecordId, setPurchaseRecordId] = useState<string | null>(null);
  const [displayDescription, setDisplayDescription] = useState(description);
  const [displayAmount, setDisplayAmount] = useState(Number(amount));
  const receiptRequestId = useRef(0);

  // Estados de Edição
  const [isEditing, setIsEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(description);
  const [editAmount, setEditAmount] = useState(String(amount));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDisplayDescription(description);
      setDisplayAmount(Number(amount));
      setEditDesc(description);
      setEditAmount(String(amount));
      setIsEditing(false);
      loadReceiptItems();
    } else {
      receiptRequestId.current += 1;
      setItems([]);
      setPurchaseRecordId(null);
      setLoading(false);
    }
  }, [visible, transactionId, description, date, amount]);

  const loadReceiptItems = async () => {
    const requestId = ++receiptRequestId.current;
    setLoading(true);
    try {
      const storeName = description.replace(/^NFC-e:\s*/i, '').trim();

      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .select('id')
        .eq('store_name', storeName)
        .eq('purchase_date', date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (purchaseError) throw purchaseError;
      if (requestId !== receiptRequestId.current) return;

      if (purchaseData?.id) {
        setPurchaseRecordId(purchaseData.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from('purchase_items')
          .select('id, name, quantity, unit_price, total_price')
          .eq('purchase_id', purchaseData.id)
          .order('total_price', { ascending: false });

        if (itemsError) throw itemsError;
        if (requestId === receiptRequestId.current) {
          setItems((itemsData || []) as PurchasedItem[]);
        }
      } else {
        setPurchaseRecordId(null);
        setItems([]);
      }
    } catch (err) {
      console.error('Erro ao buscar itens da nota:', err);
      if (requestId === receiptRequestId.current) {
        setItems([]);
        setPurchaseRecordId(null);
      }
    } finally {
      if (requestId === receiptRequestId.current) setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    const rawAmount = editAmount.trim().replace(/[^\d,.-]/g, '');
    const normalizedAmount = rawAmount.includes(',')
      ? rawAmount.replace(/\./g, '').replace(',', '.')
      : rawAmount;
    const parsedAmount = Number(normalizedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Valor inválido', 'Insira um valor numérico válido.');
      return;
    }

    setSaving(true);
    try {
      const { data: updatedTransaction, error: txError } = await supabase
        .from('transactions')
        .update({
          description: editDesc.trim(),
          amount: parsedAmount,
        })
        .eq('id', transactionId)
        .select('description, amount')
        .single();

      if (txError) throw txError;

      if (purchaseRecordId) {
        const cleanStoreName = editDesc.replace(/^NFC-e:\s*/i, '').trim();

        const { error: pError } = await supabase
          .from('purchases')
          .update({
            store_name: cleanStoreName,
            total_amount: parsedAmount,
          })
          .eq('id', purchaseRecordId);

        if (pError) throw pError;
      }

      const savedDescription = editDesc.trim();
      setDisplayDescription(savedDescription);
      setDisplayAmount(parsedAmount);
      setEditDesc(savedDescription);
      setEditAmount(parsedAmount.toFixed(2).replace('.', ','));
      setIsEditing(false);

      // Only reload receipt rows from Supabase; editing the purchase total never changes item prices.
      if (purchaseRecordId) {
        const { data: itemsData, error: itemsError } = await supabase
          .from('purchase_items')
          .select('id, name, quantity, unit_price, total_price')
          .eq('purchase_id', purchaseRecordId)
          .order('total_price', { ascending: false });

        if (itemsError) throw itemsError;
        setItems((itemsData || []) as PurchasedItem[]);
      }

      setDisplayDescription(updatedTransaction.description);
      setDisplayAmount(Number(updatedTransaction.amount));
      setEditDesc(updatedTransaction.description);
      setEditAmount(Number(updatedTransaction.amount).toFixed(2).replace('.', ','));

      setIsEditing(false);
      await onUpdated?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar alterações.';
      Alert.alert('Erro ao atualizar', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Excluir Lançamento',
      `Tem certeza que deseja apagar "${description}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Remove itens e a compra em cascata
              if (purchaseRecordId) {
                await supabase
                  .from('purchase_items')
                  .delete()
                  .eq('purchase_id', purchaseRecordId);
                await supabase
                  .from('purchases')
                  .delete()
                  .eq('id', purchaseRecordId);
              }

              // 2. Remove o lançamento financeiro
              const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', transactionId);

              if (error) throw error;

              await onDeleted?.();
              onClose();
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : 'Não foi possível apagar o lançamento.';
              Alert.alert('Erro ao excluir', message);
            }
          },
        },
      ]
    );
  };

  // Monetary arithmetic uses cents; this value is display-only and never written to receipt items.
  const itemsSumCents = items.reduce((sum, item) => {
    const itemTotal = Number(item.total_price);
    return sum + (Number.isFinite(itemTotal) ? Math.round(itemTotal * 100) : 0);
  }, 0);
  const adjustmentCents = Math.round(displayAmount * 100) - itemsSumCents;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <Text style={styles.title}>Detalhe do Cupom Fiscal</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Dados Principais ou Formulário de Edição */}
          {isEditing ? (
            <View style={styles.editSection}>
              <Text style={styles.inputLabel}>Descrição / Estabelecimento</Text>
              <TextInput
                style={styles.textInput}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholderTextColor="#64748B"
              />

              <Text style={styles.inputLabel}>Valor Total (R$)</Text>
              <TextInput
                style={styles.textInput}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />

              <View style={styles.editActionRow}>
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => setIsEditing(false)}
                  disabled={saving}
                >
                  <Text style={styles.cancelEditText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveEditBtn}
                  onPress={handleSaveEdit}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.saveEditText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.descText}>{displayDescription}</Text>
              <Text style={styles.dateText}>Data da Compra: {date}</Text>

              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>Valor Total Pago</Text>
                <Text style={styles.amountValue}>
                  R$ {displayAmount.toFixed(2).replace('.', ',')}
                </Text>
              </View>
            </View>
          )}

          {/* Itens Comprados (Descritivo da Nota) */}
          <View style={styles.itemsSection}>
            <Text style={styles.sectionSubtitle}>Itens Discriminados na Nota:</Text>

            {loading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.loadingText}>Buscando produtos da nota...</Text>
              </View>
            ) : items.length > 0 ? (
              <View style={{ flexShrink: 1 }}>
                <FlatList
                  data={items}
                  keyExtractor={(item) => item.id}
                  style={styles.itemsList}
                  showsVerticalScrollIndicator={true}
                  renderItem={({ item }) => (
                    <View style={styles.receiptItemRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.receiptItemName} numberOfLines={2}>
                          {item.name}
                        </Text>
                        <Text style={styles.receiptItemQty}>
                          {item.quantity} un x R${' '}
                          {Number(item.unit_price).toFixed(2).replace('.', ',')}
                        </Text>
                      </View>
                      <Text style={styles.receiptItemTotal}>
                        R$ {Number(item.total_price).toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                  )}
                />

                {/* Exibe o ajuste/desconto caso haja diferença entre os itens e o total pago */}
                {adjustmentCents !== 0 && (
                  <View style={styles.adjustmentRow}>
                    <Text style={styles.adjustmentLabel}>
                      {adjustmentCents < 0
                        ? 'Desconto Comercial / Ajuste:'
                        : 'Acréscimo / Taxas:'}
                    </Text>
                    <Text
                      style={[
                        styles.adjustmentValue,
                        { color: adjustmentCents < 0 ? '#10B981' : '#F59E0B' },
                      ]}
                    >
                      {adjustmentCents < 0 ? '-' : '+'} R${' '}
                      {(Math.abs(adjustmentCents) / 100).toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.emptyItemsBox}>
                <Text style={styles.noItemsText}>
                  Nenhum item discriminado foi encontrado para este comprovante.
                </Text>
              </View>
            )}
          </View>

          {/* Botões de Ação */}
          {!isEditing && (
            <View style={styles.bottomActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => setIsEditing(true)}
              >
                <Text style={styles.editBtnText}>✏️ Editar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
              >
                <Text style={styles.deleteBtnText}>🗑️ Excluir</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.actionBtn} onPress={onClose}>
            <Text style={styles.actionBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    marginBottom: 12,
  },
  descText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  dateText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  amountBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  amountLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#10B981',
  },
  editSection: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
    fontSize: 14,
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cancelEditBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelEditText: {
    color: '#94A3B8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  saveEditBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveEditText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  itemsSection: {
    marginVertical: 10,
    flexShrink: 1,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  itemsList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#0F172A',
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  receiptItemName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '500',
  },
  receiptItemQty: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  receiptItemTotal: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
  },
  adjustmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  adjustmentLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  adjustmentValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyItemsBox: {
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  noItemsText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  centerLoading: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 6,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  editBtn: {
    flex: 1,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  editBtnText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 13,
  },
  actionBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 14,
  },
});