import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useBasket } from '../../context/BasketContext';
import { supabase } from '../../config/supabase';

interface ComparisonResult {
  store_name: string;
  total_price: number;
  items_available: number;
  missing_items: number;
  is_cheapest: boolean;
}

interface BasketModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BasketModal: React.FC<BasketModalProps> = ({ visible, onClose }) => {
  const { items, removeItem, clearBasket } = useBasket();
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(false);

  const calculateComparison = async () => {
    if (items.length === 0) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const matchIds = items.map((i) => i.id);
      const { data, error } = await supabase.rpc('calculate_basket_comparison', {
        selected_match_ids: matchIds,
      });

      if (error) throw error;
      setResults((data as ComparisonResult[]) || []);
    } catch (err) {
      console.error('Erro ao calcular comparativo de cesta:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && items.length > 0) {
      calculateComparison();
    }
  }, [visible, items.length]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Cesta Inteligente</Text>
              <Text style={styles.subtitle}>
                {items.length} {items.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Comparativo de Redes */}
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionTitle}>Ranking de Preço Total em Londrina:</Text>
            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.loadingText}>A calcular totais nas 6 redes...</Text>
              </View>
            ) : results.length === 0 ? (
              <Text style={styles.emptyText}>Adicione produtos para simular o total.</Text>
            ) : (
              <FlatList
                data={results}
                keyExtractor={(item) => item.store_name}
                renderItem={({ item, index }) => (
                  <View
                    style={[
                      styles.resultCard,
                      item.is_cheapest && styles.resultCardCheapest,
                    ]}
                  >
                    <View style={styles.resultLeft}>
                      <Text
                        style={[
                          styles.storeRank,
                          item.is_cheapest && styles.storeRankCheapest,
                        ]}
                      >
                        #{index + 1} {item.store_name}
                      </Text>
                      <Text style={styles.availabilityText}>
                        {item.missing_items === 0
                          ? '✓ Carrinho 100% completo'
                          : `Faltam ${item.missing_items} itens nesta loja`}
                      </Text>
                    </View>

                    <View style={styles.resultRight}>
                      <Text
                        style={[
                          styles.storeTotalPrice,
                          item.is_cheapest && styles.storeTotalPriceCheapest,
                        ]}
                      >
                        R$ {Number(item.total_price).toFixed(2).replace('.', ',')}
                      </Text>
                      {item.is_cheapest && (
                        <View style={styles.winnerBadge}>
                          <Text style={styles.winnerText}>MELHOR ESCOLHA</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              />
            )}
          </View>

          {/* Itens Escolhidos na Cesta */}
          <View style={styles.itemsSection}>
            <View style={styles.itemsSectionHeader}>
              <Text style={styles.sectionTitle}>Produtos na Lista</Text>
              {items.length > 0 && (
                <TouchableOpacity onPress={clearBasket}>
                  <Text style={styles.clearText}>Limpar Tudo</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => (
                <View style={styles.itemRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    <Text style={styles.itemPriceHint}>
                      A partir de R$ {Number(item.min_price).toFixed(2).replace('.', ',')} ({item.cheapest_store})
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeItem(item.id)}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeBtnText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '92%',
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC' },
  subtitle: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  closeBtn: { padding: 6 },
  closeBtnText: { color: '#94A3B8', fontSize: 20, fontWeight: 'bold' },
  resultsContainer: {
    maxHeight: 260,
    marginVertical: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  resultCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resultCardCheapest: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  resultLeft: { flex: 1 },
  storeRank: { fontSize: 15, fontWeight: 'bold', color: '#F8FAFC' },
  storeRankCheapest: { color: '#10B981' },
  availabilityText: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  resultRight: { alignItems: 'flex-end' },
  storeTotalPrice: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC' },
  storeTotalPriceCheapest: { fontSize: 18, color: '#10B981' },
  winnerBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  winnerText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF' },
  itemsSection: { flex: 1, marginTop: 8 },
  itemsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearText: { color: '#EF4444', fontSize: 12, fontWeight: 'bold' },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  itemName: { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  itemPriceHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  removeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  removeBtnText: { color: '#F87171', fontSize: 12, fontWeight: 'bold' },
  centerBox: { alignItems: 'center', paddingVertical: 20 },
  loadingText: { color: '#94A3B8', fontSize: 12, marginTop: 8 },
  emptyText: { color: '#64748B', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});