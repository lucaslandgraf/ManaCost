import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../config/supabase';

interface Deal {
  id: string;
  store_name: string;
  product_name: string;
  deal_price: number;
  valid_until?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const DealsModal = ({ visible, onClose }: Props) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStore, setSelectedStore] = useState<string>('Todos');

  useEffect(() => {
    if (visible) {
      fetchDeals();
    } else {
      setSearch('');
      setSelectedStore('Todos');
    }
  }, [visible]);

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('flyer_deals')
        .select('id, store_name, product_name, deal_price, valid_until')
        .order('deal_price', { ascending: true });

      if (error) throw error;
      setDeals(data || []);
      setFilteredDeals(data || []);
    } catch (err) {
      console.error('Erro ao carregar ofertas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = deals;

    if (selectedStore !== 'Todos') {
      result = result.filter((d) => d.store_name === selectedStore);
    }

    if (search.trim().length > 0) {
      const query = search.toUpperCase();
      result = result.filter(
        (d) =>
          d.product_name.toUpperCase().includes(query) ||
          d.store_name.toUpperCase().includes(query)
      );
    }

    setFilteredDeals(result);
  }, [search, selectedStore, deals]);

  const stores = ['Todos', ...Array.from(new Set(deals.map((d) => d.store_name)))];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>🏷️ Encartes & Promoções</Text>
              <Text style={styles.subTitle}>Ofertas ativas nos mercados da região</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Campo de Busca */}
          <TextInput
            style={styles.searchInput}
            placeholder="Pesquisar produto ou mercado..."
            placeholderTextColor="#64748B"
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />

          {/* Filtro horizontal por Estabelecimento */}
          <View style={styles.storeFilterContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={stores}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = selectedStore === item;
                return (
                  <TouchableOpacity
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setSelectedStore(item)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* Lista de Promoções */}
          {loading ? (
            <View style={styles.centerInfo}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>A carregar promoções...</Text>
            </View>
          ) : filteredDeals.length === 0 ? (
            <View style={styles.centerInfo}>
              <Text style={styles.emptyText}>Nenhuma promoção encontrada.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredDeals}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.dealCard}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.storeTag}>{item.store_name}</Text>
                    <Text style={styles.productName} numberOfLines={2}>
                      {item.product_name}
                    </Text>
                    {item.valid_until && (
                      <Text style={styles.validText}>
                        Válido até: {item.valid_until}
                      </Text>
                    )}
                  </View>
                  <View style={styles.priceContainer}>
                    <Text style={styles.priceLabel}>Por apenas</Text>
                    <Text style={styles.dealPrice}>
                      R$ {Number(item.deal_price).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}

          {/* Botão de Fechar */}
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
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subTitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  storeFilterContainer: {
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#10B981',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  list: {
    paddingBottom: 16,
  },
  dealCard: {
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  storeTag: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  productName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  validText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    color: '#94A3B8',
    fontSize: 10,
  },
  dealPrice: {
    color: '#34D399',
    fontSize: 16,
    fontWeight: 'bold',
  },
  centerInfo: {
    paddingVertical: 40,
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
    marginTop: 8,
  },
  buttonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
});