import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../config/supabase';

interface PurchaseItem {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  description: string;
  date: string;
  amount: number;
}

export const PurchaseDetailsModal = ({
  visible,
  onClose,
  description,
  date,
  amount,
}: Props) => {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState('');

  const isNfce = description.startsWith('NFC-e:');

  useEffect(() => {
    if (visible && isNfce) {
      fetchPurchaseItems();
    } else {
      setItems([]);
    }
  }, [visible]);

  const fetchPurchaseItems = async () => {
    setLoading(true);
    try {
      const parsedStore = description.replace('NFC-e:', '').trim();
      setStoreName(parsedStore);

      // Busca a compra correspondente pela data e loja aproximada
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .select('id, store_name')
        .eq('purchase_date', date)
        .ilike('store_name', `%${parsedStore}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (purchaseError || !purchaseData) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Busca os itens vinculados a essa compra
      const { data: itemsData, error: itemsError } = await supabase
        .from('purchase_items')
        .select('*')
        .eq('purchase_id', purchaseData.id)
        .order('total_price', { ascending: false });

      if (!itemsError && itemsData) {
        setItems(itemsData);
      }
    } catch (err) {
      console.error('Erro ao buscar itens:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {isNfce ? storeName || 'Cupom Fiscal' : 'Detalhes do Lançamento'}
              </Text>
              <Text style={styles.subTitle}>{date}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Valor Total */}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total da Nota</Text>
            <Text style={styles.totalVal}>R$ {Number(amount).toFixed(2)}</Text>
          </View>

          {/* Conteúdo */}
          {!isNfce ? (
            <View style={styles.centerInfo}>
              <Text style={styles.emptyText}>
                Lançamento manual simples (sem lista de itens fiscais).
              </Text>
            </View>
          ) : loading ? (
            <View style={styles.centerInfo}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Carregando itens da nota...</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centerInfo}>
              <Text style={styles.emptyText}>
                Nenhum item individual encontrado para esta nota.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.itemRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemDetail}>
                      {Number(item.quantity).toFixed(2)} x R${' '}
                      {Number(item.unit_price).toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>
                    R$ {Number(item.total_price).toFixed(2)}
                  </Text>
                </View>
              )}
            />
          )}

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subTitle: {
    color: '#94A3B8',
    fontSize: 13,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalBox: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  totalVal: {
    color: '#EF4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
  list: {
    paddingBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  itemName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '500',
  },
  itemDetail: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  itemTotal: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  centerInfo: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 8,
    fontSize: 13,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
});