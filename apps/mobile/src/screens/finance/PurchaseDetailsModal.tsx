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

interface DealAlert {
  store_name: string;
  deal_price: number;
}

interface PurchaseItemWithDeal {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  cheaperDeal?: DealAlert | null;
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
  const [items, setItems] = useState<PurchaseItemWithDeal[]>([]);
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

      const { data: purchaseData } = await supabase
        .from('purchases')
        .select('id, store_name')
        .eq('purchase_date', date)
        .ilike('store_name', `%${parsedStore}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!purchaseData) {
        setItems([]);
        setLoading(false);
        return;
      }

      // 1. Busca os itens da nota
      const { data: itemsData } = await supabase
        .from('purchase_items')
        .select('*')
        .eq('purchase_id', purchaseData.id)
        .order('total_price', { ascending: false });

      if (!itemsData || itemsData.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // 2. Filtra elegibilidade: apenas supermercados, atacados e farmácias
      const storeUpper = parsedStore.toUpperCase();
      const isEligibleForDeals =
        storeUpper.includes('MERCADO') ||
        storeUpper.includes('SUPER') ||
        storeUpper.includes('ATACAD') ||
        storeUpper.includes('HIPER') ||
        storeUpper.includes('DROGA') ||
        storeUpper.includes('FARMA');

      let activeDeals: any[] = [];
      if (isEligibleForDeals) {
        const { data: deals } = await supabase
          .from('flyer_deals')
          .select('store_name, product_name, deal_price');
        activeDeals = deals || [];
      }

      // 3. Cruza os itens da nota com ofertas apenas se o local for elegível
      const processedItems: PurchaseItemWithDeal[] = itemsData.map((item) => {
        let cheaperDeal: DealAlert | null = null;

        if (activeDeals.length > 0) {
          const itemKeywords = item.name
            .toUpperCase()
            .split(/[:\s]+/)
            .filter((w: string) => w.length > 3);

          const match = activeDeals.find((deal) => {
            const dealName = deal.product_name.toUpperCase();
            const matchesKeyword = itemKeywords.some((kw: string) =>
              dealName.includes(kw)
            );
            return matchesKeyword && Number(deal.deal_price) < Number(item.unit_price);
          });

          if (match) {
            cheaperDeal = {
              store_name: match.store_name,
              deal_price: Number(match.deal_price),
            };
          }
        }

        return {
          ...item,
          cheaperDeal,
        };
      });

      setItems(processedItems);
    } catch (err) {
      console.error('Erro ao buscar itens e ofertas:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
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

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total da Nota</Text>
            <Text style={styles.totalVal}>R$ {Number(amount).toFixed(2)}</Text>
          </View>

          {!isNfce ? (
            <View style={styles.centerInfo}>
              <Text style={styles.emptyText}>Lançamento manual simples.</Text>
            </View>
          ) : loading ? (
            <View style={styles.centerInfo}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Carregando dados da compra...</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centerInfo}>
              <Text style={styles.emptyText}>Nenhum item encontrado para esta nota.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.itemRowWrapper}>
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

                  {item.cheaperDeal && (
                    <View style={styles.dealBadge}>
                      <Text style={styles.dealBadgeText}>
                        💡 Mais barato no {item.cheaperDeal.store_name}: R${' '}
                        {item.cheaperDeal.deal_price.toFixed(2)}
                      </Text>
                    </View>
                  )}
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
    maxHeight: '85%',
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
  itemRowWrapper: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  dealBadge: {
    marginTop: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  dealBadgeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
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