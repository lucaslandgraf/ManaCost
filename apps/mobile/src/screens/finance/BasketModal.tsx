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
  Share,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBasket } from '../../context/BasketContext';

interface StoreSplit {
  store_name: string;
  items_count: number;
  total_price: number;
}

interface BasketModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BasketModal: React.FC<BasketModalProps> = ({ visible, onClose }) => {
  const { items, removeItem, updateQuantity, clearBasket } = useBasket();

  // 1. Soma global
  const totalBasketPrice = useMemo(() => {
    return items.reduce((acc: number, item: any) => {
      const price = Number(item.valor ?? item.min_price) || 0;
      const qty = Number(item.quantidade) || 1;
      return acc + price * qty;
    }, 0);
  }, [items]);

  // 2. Divisão Real de Compras por Supermercado
  const storeSplits = useMemo(() => {
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

    return Object.entries(map).map(
      ([store_name, data]): StoreSplit => ({
        store_name,
        items_count: data.count,
        total_price: data.total,
      })
    );
  }, [items]);

  // 3. Exportar lista formatada para WhatsApp / Compartilhar
  const handleShareList = async () => {
    if (items.length === 0) return;

    // Agrupa itens por loja para listar com detalhes no texto
    const itemsByStore: Record<string, any[]> = {};
    items.forEach((item: any) => {
      const store =
        item.estabelecimento?.nome ||
        item.cheapest_store ||
        item.store_name ||
        'Geral';
      if (!itemsByStore[store]) itemsByStore[store] = [];
      itemsByStore[store].push(item);
    });

    let message = '🛒 *Lista de Compras • Radar de Ofertas*\n\n';

    Object.entries(itemsByStore).forEach(([store, storeItems]) => {
      const storeTotal = storeItems.reduce((acc, it) => {
        const p = Number(it.valor ?? it.min_price) || 0;
        const q = Number(it.quantidade) || 1;
        return acc + p * q;
      }, 0);

      message += `📍 *${store.toUpperCase()}* (Total: R$ ${storeTotal.toFixed(2).replace('.', ',')})\n`;

      storeItems.forEach((it) => {
        const p = Number(it.valor ?? it.min_price) || 0;
        const q = Number(it.quantidade) || 1;
        const name = it.descricao || it.display_name || 'Item';
        message += `  • ${q}x ${name} - R$ ${(p * q).toFixed(2).replace('.', ',')}\n`;
      });
      message += '\n';
    });

    message += `💰 *TOTAL GERAL: R$ ${totalBasketPrice.toFixed(2).replace('.', ',')}*`;

    try {
      await Share.share({
        message,
        title: 'Minha Lista de Compras',
      });
    } catch (error) {
      console.warn('Erro ao compartilhar lista:', error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
          {/* Indicador de Gaveta */}
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Cesta de Compras</Text>
              <Text style={styles.subtitle}>
                Roteiro e divisão prática por supermercado
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Divisão Prática por Loja (Chips Resumo) */}
          {storeSplits.length > 0 && (
            <View style={styles.splitsContainer}>
              <Text style={styles.sectionHeaderLabel}>DIVISÃO DE COMPRAS POR LOJA</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={storeSplits}
                keyExtractor={(item) => item.store_name}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <View style={styles.splitChip}>
                    <View style={styles.splitChipHeader}>
                      <Feather name="map-pin" size={10} color="#10B981" />
                      <Text style={styles.splitStoreName} numberOfLines={1}>
                        {item.store_name}
                      </Text>
                    </View>
                    <Text style={styles.splitStoreSummary}>
                      {item.items_count} {item.items_count === 1 ? 'item' : 'itens'} •{' '}
                      <Text style={styles.splitStorePrice}>
                        R$ {item.total_price.toFixed(2).replace('.', ',')}
                      </Text>
                    </Text>
                  </View>
                )}
              />
            </View>
          )}

          {/* Lista de Itens na Cesta */}
          <View style={styles.itemsSection}>
            <View style={styles.itemsHeaderRow}>
              <View>
                <Text style={styles.sectionHeaderLabel}>
                  ITENS NA LISTA ({items.length})
                </Text>
                {items.length > 0 && (
                  <Text style={styles.subtotalHeaderLabel}>
                    Subtotal: <Text style={styles.subtotalValueHighlight}>R$ {totalBasketPrice.toFixed(2).replace('.', ',')}</Text>
                  </Text>
                )}
              </View>

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
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }: { item: any }) => {
                const price = Number(item.valor ?? item.min_price) || 0;
                const store =
                  item.estabelecimento?.nome ||
                  item.cheapest_store ||
                  item.store_name ||
                  'Mercado';
                const name = item.descricao || item.display_name || 'Produto';
                const qty = Number(item.quantidade) || 1;
                const itemTotal = price * qty;

                return (
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.itemSub}>
                        R$ {price.toFixed(2).replace('.', ',')} un • {store}
                      </Text>
                      {qty > 1 && (
                        <Text style={styles.itemSubTotal}>
                          Total: R$ {itemTotal.toFixed(2).replace('.', ',')}
                        </Text>
                      )}
                    </View>

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

          {/* Barra de Rodapé: Total + Botão de Compartilhar/WhatsApp */}
          {items.length > 0 && (
            <View style={styles.footerContainer}>
              <View style={styles.footerSummary}>
                <View>
                  <Text style={styles.footerLabel}>Total Geral</Text>
                  <Text style={styles.footerSubLabel}>{storeSplits.length} {storeSplits.length === 1 ? 'loja' : 'lojas diferentes'}</Text>
                </View>
                <Text style={styles.footerTotal}>
                  R$ {totalBasketPrice.toFixed(2).replace('.', ',')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShareList}
                activeOpacity={0.8}
              >
                <Feather name="share-2" size={15} color="#0B0F19" style={{ marginRight: 6 }} />
                <Text style={styles.shareButtonText}>Exportar Lista / WhatsApp</Text>
              </TouchableOpacity>
            </View>
          )}
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
    height: '82%',
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
  splitsContainer: {
    marginTop: 12,
    marginBottom: 4,
  },
  splitChip: {
    backgroundColor: '#131927',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  splitChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  splitStoreName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  splitStoreSummary: {
    color: '#64748B',
    fontSize: 11,
  },
  splitStorePrice: {
    color: '#34D399',
    fontWeight: '700',
  },
  sectionHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  subtotalHeaderLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  subtotalValueHighlight: {
    color: '#34D399',
    fontWeight: '700',
  },
  itemsSection: {
    flex: 1,
    marginTop: 12,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  itemSubTotal: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 1,
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
  footerContainer: {
    marginTop: 8,
    marginBottom: 12,
    gap: 8,
  },
  footerSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131927',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  footerLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  footerSubLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  footerTotal: {
    color: '#34D399',
    fontSize: 18,
    fontWeight: '800',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareButtonText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyListText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});