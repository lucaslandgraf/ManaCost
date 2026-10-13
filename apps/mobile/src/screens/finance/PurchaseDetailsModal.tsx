import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
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
  description: string;
  date: string;
  amount: number;
}

export const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({
  visible,
  onClose,
  description,
  date,
  amount,
}) => {
  const [items, setItems] = useState<PurchasedItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadReceiptItems();
    } else {
      setItems([]);
    }
  }, [visible, description, date]);

  const loadReceiptItems = async () => {
    setLoading(true);
    try {
      // 1. Limpa o prefixo "NFC-e: " para buscar o estabelecimento
      const storeName = description.replace(/^NFC-e:\s*/i, '').trim();

      // 2. Busca a compra registrada na tabela purchases pelo nome da loja e data
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .select('id')
        .ilike('store_name', `%${storeName}%`)
        .eq('purchase_date', date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (purchaseError) throw purchaseError;

      if (purchaseData?.id) {
        // 3. Busca todos os itens discriminados da nota fiscal
        const { data: itemsData, error: itemsError } = await supabase
          .from('purchase_items')
          .select('id, name, quantity, unit_price, total_price')
          .eq('purchase_id', purchaseData.id)
          .order('total_price', { ascending: false });

        if (itemsError) throw itemsError;
        setItems(itemsData || []);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Erro ao buscar itens da nota:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <Text style={styles.title}>Detalhe do Cupom Fiscal</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Dados Gerais da Compra */}
          <View style={styles.content}>
            <Text style={styles.descText}>{description}</Text>
            <Text style={styles.dateText}>Data da Compra: {date}</Text>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Valor Total Pago</Text>
              <Text style={styles.amountValue}>
                R$ {Number(amount).toFixed(2).replace('.', ',')}
              </Text>
            </View>
          </View>

          {/* Itens Comprados (Descritivo da Nota) */}
          <View style={styles.itemsSection}>
            <Text style={styles.sectionSubtitle}>Itens Discriminados na Nota:</Text>

            {loading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.loadingText}>Buscando produtos da nota...</Text>
              </View>
            ) : items.length > 0 ? (
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
                        {item.quantity} un x R$ {Number(item.unit_price).toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                    <Text style={styles.receiptItemTotal}>
                      R$ {Number(item.total_price).toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                )}
              />
            ) : (
              <View style={styles.emptyItemsBox}>
                <Text style={styles.noItemsText}>
                  Nenhum item discriminado foi encontrado no portal da SEFAZ para este comprovante.
                </Text>
              </View>
            )}
          </View>

          {/* Botão de Fechar */}
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
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxHeight: '85%',
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
    maxHeight: 220,
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
  actionBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 14,
  },
});