import React, { useEffect, useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Linking,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { supabase } from '../../config/supabase';

interface Deal {
  id: string;
  store_name: string;
  product_name: string;
  deal_price: number | string;
  valid_until?: string;
}

interface Flyer {
  id: string;
  store_name: string;
  flyer_url: string;
  category: 'encarte' | 'instagram' | 'tabloide';
  badge_color: string;
}

interface DealsModalProps {
  visible: boolean;
  onClose: () => void;
}

const FALLBACK_FLYER_URLS: Record<string, string> = {
  'Super Muffato': 'https://www.supermuffato.com.br/lojas-fisicas?tab=encartes&loja=26',
  'Max Atacadista': 'https://www.maxatacadista.com.br/lojas/encartes-e-videos/?loja=110',
  'Hiper Condor': 'https://institucional.condor.com.br/ofertas/cidade/londrina',
  'Santarém Supermercado': 'https://www.instagram.com/supermercados_santarem/',
  'Almeida Mercados': 'https://www.tiendeo.com.br/londrina/almeida-mercados',
  'Viscardi': 'https://www.instagram.com/viscardioficial/',
  'Atacadão Tiradentes': 'https://www.atacadao.com.br/loja/londrina-tiradentes',
  'Tonhão Maxi': 'https://www.supermercadostonhaomaxi.com/encarte',
  'Super Golff': 'https://supergolff.com.br/ofertas#book/',
};

export const DealsModal: React.FC<DealsModalProps> = ({ visible, onClose }) => {
  const [activeTab, setActiveTab] = useState<'flyers' | 'products'>('flyers');

  const [previewFlyer, setPreviewFlyer] = useState<{ name: string; url: string } | null>(null);
  const [loadingWeb, setLoadingWeb] = useState(true);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState<string>('Todos');

  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loadingFlyers, setLoadingFlyers] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchFlyers();
      fetchDeals();
      setPreviewFlyer(null);
    }
  }, [visible]);

  const fetchDeals = async () => {
    setLoadingDeals(true);
    try {
      const { data, error } = await supabase
        .from('flyer_deals')
        .select('id, store_name, product_name, deal_price, valid_until')
        .order('deal_price', { ascending: true })
        .limit(100);

      if (!error && data) {
        setDeals(data as Deal[]);
      }
    } catch (e) {
      console.warn('Erro ao carregar ofertas:', e);
    } finally {
      setLoadingDeals(false);
    }
  };

  const fetchFlyers = async () => {
    setLoadingFlyers(true);
    try {
      const { data } = await supabase
        .from('weekly_flyers')
        .select('*')
        .order('store_name', { ascending: true });

      if (data && data.length > 0) {
        setFlyers(data as Flyer[]);
      } else {
        setFlyers([
          { id: '1', store_name: 'Super Muffato', flyer_url: FALLBACK_FLYER_URLS['Super Muffato'], category: 'encarte', badge_color: '#10B981' },
          { id: '2', store_name: 'Max Atacadista', flyer_url: FALLBACK_FLYER_URLS['Max Atacadista'], category: 'encarte', badge_color: '#F59E0B' },
          { id: '3', store_name: 'Hiper Condor', flyer_url: FALLBACK_FLYER_URLS['Hiper Condor'], category: 'encarte', badge_color: '#38BDF8' },
          { id: '4', store_name: 'Santarém Supermercado', flyer_url: FALLBACK_FLYER_URLS['Santarém Supermercado'], category: 'instagram', badge_color: '#EC4899' },
          { id: '5', store_name: 'Almeida Mercados', flyer_url: FALLBACK_FLYER_URLS['Almeida Mercados'], category: 'tabloide', badge_color: '#8B5CF6' },
          { id: '6', store_name: 'Viscardi', flyer_url: FALLBACK_FLYER_URLS['Viscardi'], category: 'instagram', badge_color: '#EC4899' },
          { id: '7', store_name: 'Atacadão Tiradentes', flyer_url: FALLBACK_FLYER_URLS['Atacadão Tiradentes'], category: 'encarte', badge_color: '#F97316' },
          { id: '8', store_name: 'Tonhão Maxi', flyer_url: FALLBACK_FLYER_URLS['Tonhão Maxi'], category: 'encarte', badge_color: '#14B8A6' },
          { id: '9', store_name: 'Super Golff', flyer_url: FALLBACK_FLYER_URLS['Super Golff'], category: 'encarte', badge_color: '#6366F1' },
        ]);
      }
    } catch (e) {
      console.warn('Erro ao carregar encartes:', e);
    } finally {
      setLoadingFlyers(false);
    }
  };

  const handleOpenFlyer = async (flyer?: any) => {
    if (!flyer) return;

    const storeName = flyer.store_name || '';
    const targetUrl =
      flyer.flyer_url ||
      flyer.url ||
      FALLBACK_FLYER_URLS[storeName] ||
      '';

    if (!targetUrl) return;

    if (flyer.category === 'instagram' || targetUrl.includes('instagram.com')) {
      const username = storeName.toLowerCase().includes('santarem')
        ? 'supermercados_santarem'
        : 'viscardioficial';

      const appUrl = `instagram://user?username=${username}`;
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
        return;
      }
    }

    setLoadingWeb(true);
    setPreviewFlyer({ name: storeName, url: targetUrl });
  };

  const stores = useMemo(() => {
    const list = Array.from(new Set(deals.map((d) => d.store_name)));
    return ['Todos', ...list];
  }, [deals]);

  const filteredDeals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return deals.filter((deal) => {
      const matchesStore =
        selectedStore === 'Todos' || deal.store_name === selectedStore;
      const matchesSearch =
        !query ||
        deal.product_name.toLowerCase().includes(query) ||
        deal.store_name.toLowerCase().includes(query);
      return matchesStore && matchesSearch;
    });
  }, [deals, selectedStore, searchQuery]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
          {previewFlyer ? (
            <View style={{ flex: 1 }}>
              <View style={styles.previewHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="book-open" size={15} color="#F8FAFC" />
                    <Text style={styles.previewTitle} numberOfLines={1}>
                      {previewFlyer.name}
                    </Text>
                  </View>
                  <Text style={styles.previewSubtitle}>Folheto oficial da semana em Londrina</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPreviewFlyer(null)}
                  style={styles.closePreviewBtn}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={14} color="#F8FAFC" style={{ marginRight: 4 }} />
                  <Text style={styles.closePreviewText}>Fechar</Text>
                </TouchableOpacity>
              </View>

              {loadingWeb && (
                <View style={styles.webLoadingOverlay}>
                  <ActivityIndicator size="large" color="#10B981" />
                  <Text style={styles.loadingText}>A carregar folheto...</Text>
                </View>
              )}

              <WebView
                source={{ uri: previewFlyer.url }}
                style={styles.webView}
                onLoadStart={() => setLoadingWeb(true)}
                onLoadEnd={() => setLoadingWeb(false)}
                startInLoadingState={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scalesPageToFit={true}
                originWhitelist={['*']}
                userAgent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
                onShouldStartLoadWithRequest={(request) => {
                  if (request.url.startsWith('whatsapp:') || request.url.startsWith('intent:')) {
                    Linking.openURL(request.url);
                    return false;
                  }
                  return true;
                }}
                onError={() => setLoadingWeb(false)}
              />
            </View>
          ) : (
            <>
              {/* Barra de Arraste Superior */}
              <View style={styles.dragHandleBox}>
                <View style={styles.dragHandle} />
              </View>

              {/* Cabeçalho */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Economia em Londrina</Text>
                  <Text style={styles.subtitle}>Encartes e promoções ativas da região</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Seletor de Abas Segmentadas */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'flyers' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('flyers')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, activeTab === 'flyers' && styles.tabTextActive]}>
                    Encartes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'products' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('products')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>
                    Produtos
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Aba Encartes */}
              {activeTab === 'flyers' && (
                <View style={{ flex: 1 }}>
                  {loadingFlyers ? (
                    <View style={styles.centerContainer}>
                      <ActivityIndicator size="large" color="#10B981" />
                      <Text style={styles.loadingText}>A carregar encartes...</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={flyers}
                      keyExtractor={(item) => String(item.id || item.store_name)}
                      contentContainerStyle={styles.flyersList}
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.flyerCard}
                          onPress={() => handleOpenFlyer(item)}
                          activeOpacity={0.75}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.flyerStoreName}>{item.store_name}</Text>
                              <View
                                style={[
                                  styles.categoryBadge,
                                  { backgroundColor: `${item.badge_color || '#10B981'}20` },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.categoryBadgeText,
                                    { color: item.badge_color || '#10B981' },
                                  ]}
                                >
                                  {item.category === 'instagram'
                                    ? 'Instagram'
                                    : item.category === 'tabloide'
                                    ? 'Tabloide'
                                    : 'Oficial'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.flyerActionHint}>
                              Toque para abrir lâminas no ecrã
                            </Text>
                          </View>
                          <Feather name="chevron-right" size={18} color="#64748B" />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>
              )}

              {/* Aba Produtos */}
              {activeTab === 'products' && (
                <View style={{ flex: 1 }}>
                  <View style={styles.searchContainer}>
                    <View style={styles.searchBox}>
                      <Feather name="search" size={14} color="#64748B" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Pesquisar produto ou mercado..."
                        placeholderTextColor="#64748B"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                          <Feather name="x" size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <View style={styles.storeFilterContainer}>
                    <FlatList
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      data={stores}
                      keyExtractor={(item) => item}
                      contentContainerStyle={styles.storeFilterList}
                      renderItem={({ item }) => {
                        const isSelected = selectedStore === item;
                        return (
                          <TouchableOpacity
                            style={[
                              styles.storeChip,
                              isSelected && styles.storeChipSelected,
                            ]}
                            onPress={() => setSelectedStore(item)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.storeChipText,
                                isSelected && styles.storeChipTextSelected,
                              ]}
                            >
                              {item}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>

                  {loadingDeals ? (
                    <View style={styles.centerContainer}>
                      <ActivityIndicator size="large" color="#10B981" />
                      <Text style={styles.loadingText}>A carregar preços...</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredDeals}
                      keyExtractor={(item) => item.id}
                      contentContainerStyle={styles.listContent}
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => {
                        const safePrice = Number(item.deal_price || 0);

                        return (
                          <View style={styles.dealCard}>
                            <View style={styles.dealInfo}>
                              <Text style={styles.storeBadge}>{item.store_name?.toUpperCase()}</Text>
                              <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
                              {item.valid_until && (
                                <Text style={styles.validUntil}>
                                  Válido até: {item.valid_until}
                                </Text>
                              )}
                            </View>
                            <View style={styles.priceContainer}>
                              <Text style={styles.priceLabel}>Valor anunciado</Text>
                              <Text style={styles.dealPrice}>
                                R$ {safePrice.toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                          </View>
                        );
                      }}
                      ListEmptyComponent={
                        <View style={styles.centerContainer}>
                          <Text style={styles.emptyText}>Nenhuma oferta encontrada.</Text>
                        </View>
                      }
                    />
                  )}
                </View>
              )}

              {/* Rodapé */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.actionBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={styles.actionBtnText}>Concluído</Text>
                </TouchableOpacity>
              </View>
            </>
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
    height: '92%',
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  dragHandleBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#0B0F19',
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  previewSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  closePreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closePreviewText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  webLoadingOverlay: {
    position: 'absolute',
    top: 50,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#131927',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#131927',
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0B0F19',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  flyersList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  flyerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131927',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  flyerStoreName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  flyerActionHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
  },
  storeFilterContainer: { marginBottom: 10 },
  storeFilterList: { paddingHorizontal: 16, gap: 6 },
  storeChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  storeChipSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  storeChipText: { color: '#94A3B8', fontSize: 11, fontWeight: '500' },
  storeChipTextSelected: { color: '#10B981', fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  dealCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  dealInfo: { flex: 1, paddingRight: 8 },
  storeBadge: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 2,
  },
  productName: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  validUntil: { color: '#64748B', fontSize: 10, marginTop: 2 },
  priceContainer: { alignItems: 'flex-end' },
  priceLabel: { color: '#64748B', fontSize: 9, marginBottom: 1 },
  dealPrice: { color: '#34D399', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: '#64748B', marginTop: 8, fontSize: 12 },
  emptyText: { color: '#64748B', fontSize: 13 },
  footer: { paddingHorizontal: 16, paddingBottom: Platform.OS === 'android' ? 24 : 32, paddingTop: 6 },
  actionBtn: {
    backgroundColor: '#131927',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionBtnText: { color: '#F8FAFC', fontWeight: '700', fontSize: 13 },
});