import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useBasket } from '../../context/BasketContext';

interface StoreGroup {
  store_name: string;
  total_price: number;
  items_count: number;
}

interface BasketModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BasketModal: React.FC<BasketModalProps> = ({ visible, onClose }) => {
  const { items, removeItem, updateQuantity, clearBasket } = useBasket();

  // 1. Soma global da cesta considerando quantidade
  const totalBasketPrice = useMemo(() => {
    return items.reduce((acc: number, item: any) => {
      const price = Number(item.valor ?? item.min_price) || 0;
      const qty = Number(item.quantidade) || 1;
      return acc + price * qty;
    }, 0);
  }, [items]);

  // 2. Agrupamento e ranking por supermercado
  const storeRanking = useMemo(() => {
    if (items.length === 0) return [];

    const map: Record<string, { total: number; count: number }> = {};

    items.forEach((item: any) => {
      const store =
        item.estabelecimento?.nome ||
        item.cheapest_store ||
        item.store_name ||
        'Outros';
      const price = Number(item.valor ?? item.min_price) || 0;
      const qty = Number(item.quantidade) || 1;

      if (!map[store]) {
        map[store] = { total: 0, count: 0 };
      }
      map[store].total += price * qty;
      map[store].count += qty;
    });

    return Object.entries(map)
      .map(([store_name, data]): StoreGroup => ({
        store_name,
        total_price: data.total,
        items_count: data.count,
      }))
      .sort((a, b) => b.total_price - a.total_price);
  }, [items]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Cesta Inteligente</Text>
              <Text style={styles.subtitle}>
                {items.length} {items.length === 1 ? 'produto na lista' : 'produtos na lista'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Resumo do Total Estimado */}
          {items.length > 0 && (
            <View style={styles.totalBox}>
              <View>
                <Text style={styles.totalBoxLabel}>VALOR TOTAL DA COMPRA</Text>
                <Text style={styles.totalBoxSubtitle}>Considerando a melhor oferta de cada item</Text>
              </View>
              <Text style={styles.totalBoxPrice}>
                R$ {totalBasketPrice.toFixed(2).replace('.', ',')}
              </Text>
            </View>
          )}

          {/* Ranking / Gastos por Supermercado */}
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionTitle}>Divisão por Supermercado em Londrina:</Text>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>Adicione produtos para simular o total.</Text>
            ) : (
              <FlatList
                data={storeRanking}
                keyExtractor={(item) => item.store_name}
                renderItem={({ item, index }) => (
                  <View
                    style={[
                      styles.resultCard,
                      index === 0 && styles.resultCardHighlight,
                    ]}
                  >
                    <View style={styles.resultLeft}>
                      <Text style={styles.storeRank} numberOfLines={1}>
                        {index === 0 ? '🏆 ' : '🏬 '}
                        {item.store_name}
                      </Text>
                      <Text style={styles.availabilityText}>
                        {item.items_count} {item.items_count === 1 ? 'unidade' : 'unidades'} selecionadas
                      </Text>
                    </View>

                    <View style={styles.resultRight}>
                      <Text style={styles.storeTotalPrice}>
                        R$ {item.total_price.toFixed(2).replace('.', ',')}
                      </Text>
                      {index === 0 && (
                        <View style={styles.winnerBadge}>
                          <Text style={styles.winnerText}>MAIOR PARCELA</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              />
            )}
          </View>

          {/* Lista de Produtos Adicionados com Controles de Quantidade */}
          <View style={styles.itemsSection}>
            <View style={styles.itemsSectionHeader}>
              <Text style={styles.sectionTitle}>Produtos na Lista</Text>
              {items.length > 0 && (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Limpar Cesta', 'Tem a certeza de que deseja remover tudo?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Limpar', style: 'destructive', onPress: clearBasket },
                    ])
                  }
                >
                  <Text style={styles.clearText}>Limpar Tudo</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={items}
              keyExtractor={(item: any) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }: { item: any }) => {
                const price = Number(item.valor ?? item.min_price) || 0;
                const store =
                  item.estabelecimento?.nome ||
                  item.cheapest_store ||
                  item.store_name ||
                  'Mercado';
                const name = item.descricao || item.display_name || 'Produto';
                const qty = Number(item.quantidade) || 1;

                return (
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {name}
                      </Text>
                      <Text style={styles.itemPriceHint}>
                        R$ {price.toFixed(2).replace('.', ',')} un • {store}
                      </Text>
                    </View>

                    {/* Controles de Quantidade */}
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => (updateQuantity ? updateQuantity(item.id, -1) : removeItem(item.id))}
                      >
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>

                      <Text style={styles.qtyText}>{qty}</Text>

                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => updateQuantity && updateQuantity(item.id, 1)}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => removeItem(item.id)}
                        style={styles.removeBtn}
                      >
                        <Text style={styles.removeBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
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
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  totalBoxLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  totalBoxSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  totalBoxPrice: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#10B981',
  },
  resultsContainer: {
    maxHeight: 220,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
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
  resultCardHighlight: {
    borderColor: '#38BDF8',
  },
  resultLeft: { flex: 1, paddingRight: 8 },
  storeRank: { fontSize: 14, fontWeight: 'bold', color: '#F8FAFC' },
  availabilityText: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  resultRight: { alignItems: 'flex-end' },
  storeTotalPrice: { fontSize: 15, fontWeight: 'bold', color: '#F8FAFC' },
  winnerBadge: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  winnerText: { fontSize: 8, fontWeight: '900', color: '#0F172A' },
  itemsSection: { flex: 1, marginTop: 10 },
  itemsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
  itemName: { fontSize: 13, fontWeight: '600', color: '#F8FAFC' },
  itemPriceHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qtyContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    width: 26,
    height: 26,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: { color: '#38BDF8', fontSize: 15, fontWeight: 'bold' },
  qtyText: { color: '#F8FAFC', fontSize: 13, fontWeight: 'bold', minWidth: 18, textAlign: 'center' },
  removeBtn: { padding: 4, marginLeft: 4 },
  removeBtnText: { fontSize: 14 },
  emptyText: { color: '#64748B', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});