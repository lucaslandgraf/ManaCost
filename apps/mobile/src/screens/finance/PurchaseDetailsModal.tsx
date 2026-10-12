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

interface DealTip {
  id: string;
  store_name: string;
  product_name: string;
  deal_price: number;
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
  const [tips, setTips] = useState<DealTip[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);

  useEffect(() => {
    if (visible && description) {
      searchRelatedDeals(description);
    } else {
      setTips([]);
    }
  }, [visible, description]);

  const searchRelatedDeals = async (text: string) => {
    setLoadingTips(true);

    // Palavras-chave genéricas comuns para buscar sugestões de feira/mercado
    const keywords = ['arroz', 'feijao', 'leite', 'oleo', 'cafe', 'detergente', 'sabao'];
    const matched = keywords.filter((k) =>
      text.toLowerCase().includes(k)
    );

    let query = supabase.from('flyer_deals').select('id, store_name, product_name, deal_price');

    if (matched.length > 0) {
      query = query.ilike('product_name', `%${matched[0]}%`);
    } else if (text.toLowerCase().includes('mercado') || text.toLowerCase().includes('nfc-e')) {
      // Se for compra de mercado genérica, pega até 2 ofertas de destaque da cidade
      query = query.limit(2);
    } else {
      setTips([]);
      setLoadingTips(false);
      return;
    }

    const { data } = await query.limit(3);
    if (data && data.length > 0) {
      setTips(data as DealTip[]);
    } else {
      setTips([]);
    }
    setLoadingTips(false);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <Text style={styles.title}>Detalhe do Lançamento</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Dados Principais */}
          <View style={styles.content}>
            <Text style={styles.descText}>{description}</Text>
            <Text style={styles.dateText}>Data do registro: {date}</Text>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Valor Total</Text>
              <Text style={styles.amountValue}>R$ {Number(amount).toFixed(2)}</Text>
            </View>
          </View>

          {/* Dicas Construtivas para Próximas Compras */}
          {loadingTips ? (
            <View style={styles.tipsLoading}>
              <ActivityIndicator size="small" color="#38BDF8" />
              <Text style={styles.tipsLoadingText}>Consultando encartes locais...</Text>
            </View>
          ) : tips.length > 0 ? (
            <View style={styles.tipsContainer}>
              <View style={styles.tipsHeader}>
                <Text style={styles.tipsIcon}>💡</Text>
                <Text style={styles.tipsTitle}>Dica para a próxima feira:</Text>
              </View>
              <Text style={styles.tipsSub}>
                Ofertas ativas encontradas nos mercados de Londrina:
              </Text>

              {tips.map((item) => (
                <View key={item.id} style={styles.tipItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tipStore}>{item.store_name.toUpperCase()}</Text>
                    <Text style={styles.tipProduct} numberOfLines={1}>
                      {item.product_name}
                    </Text>
                  </View>
                  <Text style={styles.tipPrice}>R$ {item.deal_price.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Rodapé */}
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
    marginBottom: 16,
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
    marginBottom: 16,
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
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  amountLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  tipsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  tipsLoadingText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  tipsContainer: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipsIcon: {
    fontSize: 14,
  },
  tipsTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  tipsSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 8,
  },
  tipItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  tipStore: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tipProduct: {
    color: '#F8FAFC',
    fontSize: 12,
  },
  tipPrice: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 8,
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