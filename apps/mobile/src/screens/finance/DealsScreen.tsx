import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../../config/supabase';

interface Deal {
  id: string;
  store_name: string;
  product_name: string;
  price: number;
  category: string;
  valid_until: string;
  image_url: string;
}

export const DealsScreen = ({ onBack }: { onBack: () => void }) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string>('Todos');

  const fetchDeals = async () => {
    try {
      const { data, error } = await supabase
        .from('flyer_deals')
        .select('*')
        .order('price', { ascending: true });

      if (error) throw error;
      setDeals(data || []);
    } catch (err) {
      console.error('Erro ao buscar ofertas:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDeals();
  };

  const stores = ['Todos', ...Array.from(new Set(deals.map((d) => d.store_name)))];

  const filteredDeals =
    selectedStore === 'Todos'
      ? deals
      : deals.filter((d) => d.store_name === selectedStore);

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Encartes & Ofertas</Text>
      </View>

      {/* Filtro rápido por supermercado */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={stores}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.chip,
                selectedStore === item && styles.chipActive,
              ]}
              onPress={() => setSelectedStore(item)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedStore === item && styles.chipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Lista de Produtos */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={filteredDeals}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#10B981"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
              ) : null}
              <View style={styles.cardBody}>
                <View style={styles.badgeRow}>
                  <Text style={styles.storeBadge}>{item.store_name}</Text>
                  {item.category && (
                    <Text style={styles.categoryBadge}>{item.category}</Text>
                  )}
                </View>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.product_name}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>R$</Text>
                  <Text style={styles.priceValue}>
                    {Number(item.price).toFixed(2).replace('.', ',')}
                  </Text>
                </View>
                {item.valid_until && (
                  <Text style={styles.validText}>
                    Válido até: {item.valid_until}
                  </Text>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  backButton: {
    marginRight: 12,
  },
  backText: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: 'bold',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardImage: {
    width: 95,
    height: 95,
    backgroundColor: '#0F172A',
  },
  cardBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  storeBadge: {
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadge: {
    backgroundColor: '#334155',
    color: '#94A3B8',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceLabel: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: 'bold',
    marginRight: 2,
  },
  priceValue: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
  },
  validText: {
    color: '#64748B',
    fontSize: 11,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});