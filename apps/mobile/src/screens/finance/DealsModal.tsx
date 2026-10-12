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
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../../config/supabase';

interface Deal {
  id: string;
  store_name: string;
  product_name: string;
  deal_price: number;
  valid_until: string;
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
  const [activeTab, setActiveTab] = useState<'products' | 'flyers'>('flyers');

  // Controle de visualização interna do Encarte
  const [previewFlyer, setPreviewFlyer] = useState<{ name: string; url: string } | null>(null);
  const [loadingWeb, setLoadingWeb] = useState(true);

  // Estados de Produtos e Encartes
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
    const { data } = await supabase
      .from('flyer_deals')
      .select('*')
      .order('deal_price', { ascending: true });

    if (data) {
      setDeals(data as Deal[]);
    }
    setLoadingDeals(false);
  };

  const fetchFlyers = async () => {
    setLoadingFlyers(true);
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
    setLoadingFlyers(false);
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

    // Se for Instagram, o app oficial dá uma experiência melhor; caso contrário, abre no WebView interno
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

    // Abre na visualização integrada interna
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
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.container}>
          {/* Se um encarte estiver aberto em pré-visualização interna */}
          {previewFlyer ? (
            <View style={{ flex: 1 }}>
              <View style={styles.previewHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    📰 {previewFlyer.name}
                  </Text>
                  <Text style={styles.previewSubtitle}>Folheto da semana em Londrina</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPreviewFlyer(null)}
                  style={styles.closePreviewBtn}
                >
                  <Text style={styles.closePreviewText}>✕ Fechar</Text>
                </TouchableOpacity>
              </View>

              {loadingWeb && (
                <View style={styles.webLoadingOverlay}>
                  <ActivityIndicator size="large" color="#38BDF8" />
                  <Text style={styles.loadingText}>Carregando encarte...</Text>
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
                  // Se for um link de app de terceiro (como whatsapp/intent), despacha
                  if (request.url.startsWith('whatsapp:') || request.url.startsWith('intent:')) {
                    Linking.openURL(request.url);
                    return false;
                  }
                  // Mantém qualquer URL http/https navegando exclusivamente DENTRO do WebView
                  return true;
                }}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.warn('Erro no WebView: ', nativeEvent);
                  setLoadingWeb(false);
                }}
              />
            </View>
          ) : (
            // Lista Padrão de Abas
            <>
              {/* Cabeçalho */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Economia em Londrina</Text>
                  <Text style={styles.subtitle}>Encartes e promoções ativas da região</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Seletor de Abas */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'flyers' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('flyers')}
                >
                  <Text style={[styles.tabText, activeTab === 'flyers' && styles.tabTextActive]}>
                    📰 Encartes & Folhetos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'products' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('products')}
                >
                  <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>
                    🔍 Produtos & Preços
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Aba Encartes */}
              {activeTab === 'flyers' && (
                <View style={{ flex: 1 }}>
                  {loadingFlyers ? (
                    <View style={styles.centerContainer}>
                      <ActivityIndicator size="large" color="#38BDF8" />
                      <Text style={styles.loadingText}>Carregando encartes...</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={flyers}
                      keyExtractor={(item) => String(item.id || item.store_name)}
                      contentContainerStyle={styles.flyersList}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.flyerCard}
                          onPress={() => handleOpenFlyer(item)}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.flyerStoreName}>{item.store_name}</Text>
                              <View
                                style={[
                                  styles.categoryBadge,
                                  { backgroundColor: `${item.badge_color || '#38BDF8'}20` },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.categoryBadgeText,
                                    { color: item.badge_color || '#38BDF8' },
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
                              Visualizar lâminas dentro do app
                            </Text>
                          </View>
                          <Text style={styles.flyerArrow}>👁️</Text>
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
                      <TouchableOpacity
                        onPress={() => setSearchQuery('')}
                        style={styles.clearSearchBtn}
                      >
                        <Text style={styles.clearSearchText}>✕</Text>
                      </TouchableOpacity>
                    )}
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
                      <Text style={styles.loadingText}>Carregando preços...</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={filteredDeals}
                      keyExtractor={(item) => item.id}
                      contentContainerStyle={styles.listContent}
                      renderItem={({ item }) => (
                        <View style={styles.dealCard}>
                          <View style={styles.dealInfo}>
                            <Text style={styles.storeBadge}>{item.store_name.toUpperCase()}</Text>
                            <Text style={styles.productName}>{item.product_name}</Text>
                            <Text style={styles.validUntil}>
                              Válido até: {item.valid_until}
                            </Text>
                          </View>
                          <View style={styles.priceContainer}>
                            <Text style={styles.priceLabel}>Por apenas</Text>
                            <Text style={styles.dealPrice}>
                              R$ {item.deal_price.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      )}
                    />
                  )}
                </View>
              )}

              {/* Botão Fechar Modal Geral */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.actionBtn} onPress={onClose}>
                  <Text style={styles.actionBtnText}>Fechar</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '92%',
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  previewSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  closePreviewBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closePreviewText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 12,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  webLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  subtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  closeBtn: { padding: 6 },
  closeBtnText: { color: '#94A3B8', fontSize: 20, fontWeight: 'bold' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  flyersList: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  flyerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  flyerStoreName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  flyerActionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
  },
  flyerArrow: {
    fontSize: 16,
    marginLeft: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 42, color: '#F8FAFC', fontSize: 14 },
  clearSearchBtn: { padding: 6 },
  clearSearchText: { color: '#94A3B8', fontSize: 14, fontWeight: 'bold' },
  storeFilterContainer: { marginVertical: 8 },
  storeFilterList: { paddingHorizontal: 20, gap: 8 },
  storeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1E293B',
  },
  storeChipSelected: { backgroundColor: '#10B981' },
  storeChipText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  storeChipTextSelected: { color: '#FFFFFF', fontWeight: 'bold' },
  listContent: { paddingHorizontal: 20, paddingBottom: 16 },
  dealCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  dealInfo: { flex: 1, paddingRight: 10 },
  storeBadge: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  productName: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold' },
  validUntil: { color: '#64748B', fontSize: 11, marginTop: 4 },
  priceContainer: { alignItems: 'flex-end' },
  priceLabel: { color: '#94A3B8', fontSize: 10, marginBottom: 2 },
  dealPrice: { color: '#34D399', fontSize: 16, fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 10, fontSize: 13 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  actionBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: { color: '#F8FAFC', fontWeight: 'bold', fontSize: 14 },
});