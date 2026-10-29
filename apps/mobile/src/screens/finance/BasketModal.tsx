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
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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

  // Soma global considerando quantidades
  const totalBasketPrice = useMemo(() => {
    return items.reduce((acc: number, item: any) => {
      const price = Number(item.valor ?? item.min_price) || 0;
      const qty = Number(item.quantidade) || 1;
      return acc + price * qty;
    }, 0);
  }, [items]);

  // Agrupamento ordenado do mais barato para o mais caro
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
      .sort((a, b) => a.total_price - b.total_price);
  }, [items]);

  const bestStorePrice = storeRanking.length > 0 ? storeRanking[0].total_price : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
          {/* Indicador de Gaveta / Puxador */}
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Cesta Inteligente</Text>
              <Text style={styles.subtitle}>
                Onde a sua compra total fica mais barata
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Comparativo de Pódio por Mercado */}
          <View style={styles.rankingSection}>
            <Text style={styles.sectionHeaderLabel}>SIMULAÇÃO POR SUPERMERCADO</Text>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>Adicione itens à cesta para comparar os mercados.</Text>
            ) : (
              <FlatList
                data={storeRanking}
                keyExtractor={(item) => item.store_name}
                scrollEnabled={false}
                renderItem={({ item, index }) => {
                  const isWinner = index === 0;
                  const diff = item.total_price - bestStorePrice;

                  return (
                    <View
                      style={[
                        styles.storeRankCard,
                        isWinner && styles.storeRankCardWinner,
                      ]}
                    >
                      <View style={styles.rankBadgeCol}>
                        <View style={[styles.rankNumberCircle, isWinner && styles.rankNumberCircleWinner]}>
                          {isWinner ? (
                            <Feather name="award" size={13} color="#0B0F19" />
                          ) : (
                            <Text style={styles.rankNumberText}>{index + 1}</Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.storeRankInfo}>
                        <Text style={[styles.storeRankName, isWinner && styles.storeRankNameWinner]}>
                          {item.store_name}
                        </Text>
                        <Text style={styles.storeRankCount}>
                          {isWinner ? 'Melhor opção consolidada' : `+ R$ ${diff.toFixed(2).replace('.', ',')} mais caro`}
                        </Text>
                      </View>

                      <View style={styles.storeRankPriceCol}>
                        <Text style={[styles.storeRankPrice, isWinner && styles.storeRankPriceWinner]}>
                          R$ {item.total_price.toFixed(2).replace('.', ',')}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>

          {/* Lista de Itens na Cesta */}
          <View style={styles.itemsSection}>
            <View style={styles.itemsHeaderRow}>
              <Text style={styles.sectionHeaderLabel}>
                ITENS NA LISTA ({items.length})
              </Text>
              {items.length > 0 && (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Limpar Cesta', 'Deseja remover todos os itens?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Limpar', style: 'destructive', onPress: clearBasket },
                    ])
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearText}>Limpar Tudo</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={items}
              keyExtractor={(item: any) => String(item.id)}
              showsVerticalScrollIndicator={false}
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
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.itemSub}>
                        R$ {price.toFixed(2).replace('.', ',')} un • {store}
                      </Text>
                    </View>

                    {/* Controles de Quantidade */}
                    <View style={styles.qtyControlRow}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => (updateQuantity ? updateQuantity(item.id, -1) : removeItem(item.id))}
                        activeOpacity={0.7}
                      >
                        <Feather name="minus" size={12} color="#F8FAFC" />
                      </TouchableOpacity>

                      <Text style={styles.qtyNumber}>{qty}</Text>

                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => updateQuantity && updateQuantity(item.id, 1)}
                        activeOpacity={0.7}
                      >
                        <Feather name="plus" size={12} color="#F8FAFC" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => removeItem(item.id)}
                        style={styles.trashBtn}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Feather name="trash-2" size={13} color="#F87171" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyListText}>A sua cesta está vazia no momento.</Text>
              }
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '90%',
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  dragHandleBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingSection: {
    marginTop: 14,
    marginBottom: 8,
  },
  sectionHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  storeRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  storeRankCardWinner: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  rankBadgeCol: {
    marginRight: 10,
  },
  rankNumberCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumberCircleWinner: {
    backgroundColor: '#10B981',
  },
  rankNumberText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  storeRankInfo: {
    flex: 1,
  },
  storeRankName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  storeRankNameWinner: {
    color: '#34D399',
  },
  storeRankCount: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  storeRankPriceCol: {
    alignItems: 'flex-end',
  },
  storeRankPrice: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  storeRankPriceWinner: {
    color: '#34D399',
    fontSize: 15,
  },
  itemsSection: {
    flex: 1,
    marginTop: 8,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  clearText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  itemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  itemSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  qtyNumber: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 16,
    textAlign: 'center',
  },
  trashBtn: {
    padding: 5,
    marginLeft: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  emptyListText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});