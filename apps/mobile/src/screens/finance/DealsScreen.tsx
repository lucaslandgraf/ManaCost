import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { supabase } from '../../config/supabase';
import { useBasket } from '../../context/BasketContext';
import { BasketModal } from './BasketModal';

interface MatchItem {
  id: string;
  store_name: string;
  raw_product_name: string;
  price: number;
}

interface ProductMatch {
  id: string;
  display_name: string;
  category: string | null;
  stores_count: number;
  min_price: number;
  max_price: number;
  spread: number;
  cheapest_store: string;
  priciest_store: string;
  image_url: string | null;
  updated_at?: string;
  product_match_items: MatchItem[];
}

interface FlyerDeal {
  id: string;
  store_name: string;
  product_name: string;
  deal_price: number;
  image_url: string | null;
  category: string | null;
}

interface Flyer {
  id: string;
  store_name: string;
  flyer_url: string;
  category: 'encarte' | 'instagram' | 'tabloide';
  badge_color: string;
}

interface ProductImageWithFallbackProps {
  uri?: string | null;
  category?: string | null;
  name?: string;
}

const CATALOG_PAGE_SIZE = 100;

const STORES_LIST = [
  'Todas',
  'Super Muffato',
  'Hiper Condor',
  'Atacadão',
  'Santarém',
  'Viscardi',
  'Almeida Mercados',
  'Amigão Supermercados',
  'Carrefour',
];

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
  'Amigão Supermercados': 'https://drive.google.com/drive/folders/10nVHbmCOmeRQlmS3HTAbCRGGSlBw6E27',
  'Carrefour': 'https://www.tiendeo.com.br/Encartes-Catalogos/carrefour',
};

export const ProductImageWithFallback: React.FC<ProductImageWithFallbackProps> = ({
  uri,
  category,
  name,
}) => {
  const [hasError, setHasError] = useState(false);

  const getFallbackIcon = () => {
    const text = `${category || ''} ${name || ''}`.toLowerCase();
    if (text.includes('agua') || text.includes('água') || text.includes('mineral')) {
      return <MaterialCommunityIcons name="water" size={24} color="#38BDF8" />;
    }
    if (text.includes('bisteca') || text.includes('carne') || text.includes('suin') || text.includes('bovin') || text.includes('frango')) {
      return <MaterialCommunityIcons name="food-steak" size={24} color="#F87171" />;
    }
    if (text.includes('arroz') || text.includes('feijao') || text.includes('farinha') || text.includes('trigo')) {
      return <MaterialCommunityIcons name="barley" size={24} color="#FBBF24" />;
    }
    if (text.includes('cerveja') || text.includes('chopp')) {
      return <MaterialCommunityIcons name="glass-mug-variant" size={24} color="#F59E0B" />;
    }
    if (text.includes('refrigerante') || text.includes('suco') || text.includes('nectar')) {
      return <MaterialCommunityIcons name="bottle-soda-classic" size={24} color="#38BDF8" />;
    }
    if (text.includes('leite') || text.includes('queijo') || text.includes('iogurte') || text.includes('mussarela')) {
      return <MaterialCommunityIcons name="cheese" size={24} color="#FDE047" />;
    }
    if (text.includes('limpeza') || text.includes('detergente') || text.includes('sabao') || text.includes('amaciante') || text.includes('desinfetante')) {
      return <MaterialCommunityIcons name="broom" size={24} color="#34D399" />;
    }
    if (text.includes('dente') || text.includes('escova') || text.includes('sabonete') || text.includes('shampoo')) {
      return <MaterialCommunityIcons name="toothbrush-paste" size={24} color="#A78BFA" />;
    }
    if (text.includes('maca') || text.includes('maçã') || text.includes('laranja') || text.includes('banana') || text.includes('tomate')) {
      return <MaterialCommunityIcons name="food-apple" size={24} color="#F87171" />;
    }
    if (text.includes('pao') || text.includes('biscoito') || text.includes('bolacha')) {
      return <MaterialCommunityIcons name="bread-slice" size={24} color="#F59E0B" />;
    }
    return <Feather name="shopping-bag" size={24} color="#64748B" />;
  };

  if (!uri || hasError) {
    return (
      <View style={styles.cardImagePlaceholder}>
        {getFallbackIcon()}
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.cardImage}
      resizeMode="contain"
      onError={() => setHasError(true)}
    />
  );
};

export const DealsScreen = ({ onBack }: { onBack: () => void }) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'catalog' | 'flyers'>('matches');

  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [catalogDeals, setCatalogDeals] = useState<FlyerDeal[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingMoreCatalog, setLoadingMoreCatalog] = useState(false);
  const [hasMoreCatalog, setHasMoreCatalog] = useState(true);
  const catalogRequestId = useRef(0);
  const loadingMoreCatalogRef = useRef(false);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedStore, setSelectedStore] = useState<string>('Todas');
  const [refreshing, setRefreshing] = useState(false);

  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loadingFlyers, setLoadingFlyers] = useState(false);
  const [previewFlyer, setPreviewFlyer] = useState<{ name: string; url: string } | null>(null);
  const [loadingWeb, setLoadingWeb] = useState(true);

  const { items, addItem, removeItem } = useBasket();
  const [basketVisible, setBasketVisible] = useState(false);

  const formatUpdateDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const timeStr = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return isToday
      ? `Hoje às ${timeStr}`
      : `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${timeStr}`;
  };

  const fetchMatches = async () => {
    try {
      setLoadingMatches(true);
      const { data, error } = await supabase
        .from('product_matches')
        .select(`
          id,
          display_name,
          category,
          stores_count,
          min_price,
          max_price,
          spread,
          cheapest_store,
          priciest_store,
          image_url,
          updated_at,
          product_match_items (
            id,
            store_name,
            raw_product_name,
            price
          )
        `)
        .order('spread', { ascending: false });

      if (error) throw error;
      const list = (data as unknown as ProductMatch[]) || [];
      setMatches(list);

      const latestTimestamp = list.reduce((latest, item) => {
        const timestamp = Date.parse(item.updated_at || '');
        return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
      }, Number.NEGATIVE_INFINITY);
      setLastUpdated(
        Number.isFinite(latestTimestamp)
          ? formatUpdateDate(new Date(latestTimestamp).toISOString())
          : ''
      );
    } catch (err) {
      console.error('Erro ao buscar comparativo:', err);
      setMatches([]);
      setLastUpdated('');
    } finally {
      setLoadingMatches(false);
      setRefreshing(false);
    }
  };

  const fetchCatalog = async (loadMore = false) => {
    if (
      loadMore &&
      (!hasMoreCatalog || loadingCatalog || loadingMoreCatalogRef.current)
    ) {
      return;
    }

    const requestId = ++catalogRequestId.current;
    const offset = loadMore ? catalogDeals.length : 0;
    if (loadMore) {
      loadingMoreCatalogRef.current = true;
      setLoadingMoreCatalog(true);
    } else {
      loadingMoreCatalogRef.current = false;
      setLoadingMoreCatalog(false);
      setLoadingCatalog(true);
    }

    try {
      let query = supabase
        .from('flyer_deals')
        .select('id, store_name, product_name, deal_price, image_url, category')
        .order('deal_price', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + CATALOG_PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.ilike('product_name', `%${search.trim()}%`);
      }

      if (selectedCategory !== 'Todos') {
        query = query.eq('category', selectedCategory);
      }

      if (selectedStore !== 'Todas') {
        let storeKeyword = selectedStore;
        if (selectedStore.includes('Almeida')) storeKeyword = 'Almeida';
        else if (selectedStore.includes('Muffato')) storeKeyword = 'Muffato';
        else if (selectedStore.includes('Condor')) storeKeyword = 'Condor';
        else if (selectedStore.includes('Atacadão')) storeKeyword = 'Atacad';
        else if (selectedStore.includes('Amigão')) storeKeyword = 'Amigão';
        else if (selectedStore.includes('Carrefour')) storeKeyword = 'Carrefour';
        else if (selectedStore.includes('Santarém')) storeKeyword = 'Santarém';
        else if (selectedStore.includes('Viscardi')) storeKeyword = 'Viscardi';

        query = query.ilike('store_name', `%${storeKeyword}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (requestId !== catalogRequestId.current) return;

      const page = (data as unknown as FlyerDeal[]) || [];
      setCatalogDeals((current) => (loadMore ? [...current, ...page] : page));
      setHasMoreCatalog(page.length === CATALOG_PAGE_SIZE);
    } catch (err) {
      if (requestId !== catalogRequestId.current) return;
      console.error('Erro ao buscar catálogo geral:', err);
      if (!loadMore) setCatalogDeals([]);
      setHasMoreCatalog(false);
    } finally {
      if (requestId === catalogRequestId.current) {
        setLoadingCatalog(false);
        loadingMoreCatalogRef.current = false;
        setLoadingMoreCatalog(false);
        setRefreshing(false);
      }
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
          { id: '10', store_name: 'Amigão Supermercados', flyer_url: FALLBACK_FLYER_URLS['Amigão Supermercados'], category: 'encarte', badge_color: '#EAB308' },
          { id: '11', store_name: 'Carrefour', flyer_url: FALLBACK_FLYER_URLS['Carrefour'], category: 'encarte', badge_color: '#0284C7' },
        ]);
      }
    } catch (e) {
      console.warn('Erro ao carregar encartes:', e);
      setFlyers([]);
    } finally {
      setLoadingFlyers(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    fetchFlyers();
  }, []);

  useEffect(() => {
    if (activeTab === 'catalog') {
      const delaySearch = setTimeout(() => {
        setCatalogDeals([]);
        setHasMoreCatalog(true);
        fetchCatalog(false);
      }, 300);
      return () => {
        clearTimeout(delaySearch);
        catalogRequestId.current += 1;
        loadingMoreCatalogRef.current = false;
      };
    }
  }, [activeTab, search, selectedCategory, selectedStore]);

  const onRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'matches') fetchMatches();
    else if (activeTab === 'catalog') fetchCatalog();
    else fetchFlyers();
  };

  const handleOpenFlyer = async (flyer?: any) => {
    if (!flyer) return;

    const storeName = typeof flyer.store_name === 'string' ? flyer.store_name : '';
    const rawUrl = typeof flyer.flyer_url === 'string' ? flyer.flyer_url : '';
    const targetUrl = rawUrl || flyer.url || FALLBACK_FLYER_URLS[storeName] || '';

    if (!targetUrl) return;

    const isInstagram =
      flyer.category === 'instagram' ||
      targetUrl.includes('instagram.com') ||
      storeName.toLowerCase().includes('santarem') ||
      storeName.toLowerCase().includes('viscardi');

    if (isInstagram) {
      try {
        await Linking.openURL(targetUrl);
      } catch (err) {
        console.warn('Não foi possível abrir o link externamente:', err);
      }
      return;
    }

    setLoadingWeb(true);
    setPreviewFlyer({ name: storeName || 'Encarte', url: targetUrl });
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return ['Todos', ...Array.from(set)];
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((item) => {
      const matchesCategory =
        selectedCategory === 'Todos' || item.category === selectedCategory;
      const matchesSearch =
        !search.trim() ||
        item.display_name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [matches, selectedCategory, search]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getStoreBadgeColor = (storeName: string) => {
    const s = storeName.toLowerCase();
    if (s.includes('condor')) return '#0284C7';
    if (s.includes('muffato')) return '#059669';
    if (s.includes('atacad')) return '#EA580C';
    if (s.includes('santarem')) return '#DB2777';
    if (s.includes('almeida')) return '#7C3AED';
    return '#475569';
  };

  if (previewFlyer) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="book-open" size={15} color="#F8FAFC" />
              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewFlyer.name}
              </Text>
            </View>
            <Text style={styles.previewSubtitle}>Folheto oficial da semana</Text>
          </View>
          <TouchableOpacity onPress={() => setPreviewFlyer(null)} style={styles.closePreviewBtn} activeOpacity={0.7}>
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
            const url = request.url;
            if (url.startsWith('whatsapp:') || url.startsWith('tel:') || url.startsWith('mailto:')) {
              Linking.openURL(url).catch(() => {});
              return false;
            }
            if (url.startsWith('intent://')) {
              const fallbackMatch = url.match(/scheme=https;.*?browser_fallback_url=([^;]+)/);
              if (fallbackMatch && fallbackMatch[1]) {
                const fallbackUrl = decodeURIComponent(fallbackMatch[1]);
                Linking.openURL(fallbackUrl).catch(() => {});
              }
              return false;
            }
            return true;
          }}
          onError={() => setLoadingWeb(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Bar / Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Feather name="chevron-left" size={20} color="#10B981" />
          <Text style={styles.backText}>Voltar</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, paddingLeft: 4 }}>
          <Text style={styles.title}>Radar de Ofertas</Text>
          <Text style={styles.subtitle}>Supermercados parceiros de Londrina</Text>
        </View>

        {items.length > 0 && activeTab !== 'flyers' && (
          <TouchableOpacity
            style={styles.headerCartBadge}
            onPress={() => setBasketVisible(true)}
            activeOpacity={0.8}
          >
            <Feather name="shopping-bag" size={13} color="#10B981" style={{ marginRight: 4 }} />
            <Text style={styles.headerCartBadgeText}>{items.length}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Navegação de Abas Segmentadas */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'matches' && styles.tabButtonActive]}
          onPress={() => setActiveTab('matches')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}>
            Comparativo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'catalog' && styles.tabButtonActive]}
          onPress={() => setActiveTab('catalog')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'catalog' && styles.tabTextActive]}>
            Menor Preço
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'flyers' && styles.tabButtonActive]}
          onPress={() => setActiveTab('flyers')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'flyers' && styles.tabTextActive]}>
            Encartes
          </Text>
        </TouchableOpacity>
      </View>

      {/* Barra de Pesquisa e Filtros */}
      {activeTab !== 'flyers' && (
        <>
          <View style={styles.searchContainer}>
            <View style={styles.searchBox}>
              <Feather name="search" size={14} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={
                  activeTab === 'catalog'
                    ? 'Buscar produto em todas as ofertas...'
                    : 'Buscar café, arroz, leite, azeite...'
                }
                placeholderTextColor="#64748B"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Feather name="x" size={14} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Chips de Categorias */}
          <View style={styles.filtersContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={categories}
              keyExtractor={(item) => item}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.chip,
                    selectedCategory === item && styles.chipActive,
                  ]}
                  onPress={() => setSelectedCategory(item)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedCategory === item && styles.chipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* Filtro de Lojas */}
          {activeTab === 'catalog' && (
            <View style={styles.storesFilterContainer}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={STORES_LIST}
                keyExtractor={(item) => item}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.storeChip,
                      selectedStore === item && styles.storeChipActive,
                    ]}
                    onPress={() => setSelectedStore(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.storeChipText,
                        selectedStore === item && styles.storeChipTextActive,
                      ]}
                    >
                      {item === 'Todas' ? 'Todas as Lojas' : item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </>
      )}

      {/* ABA 1: COMPARATIVO ENTRE SUPERMERCADOS */}
      {activeTab === 'matches' && (
        <>
          {loadingMatches ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Atualizando radar de preços...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMatches}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#10B981"
                />
              }
              contentContainerStyle={[
                styles.listContent,
                items.length > 0 && { paddingBottom: 110 },
              ]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isExpanded = expandedId === item.id;
                const inBasket = items.some((basketItem) => basketItem.id === item.id);

                const bestByStoreMap = new Map<string, MatchItem>();
                (item.product_match_items || []).forEach((deal) => {
                  const existing = bestByStoreMap.get(deal.store_name);
                  if (!existing || Number(deal.price) < Number(existing.price)) {
                    bestByStoreMap.set(deal.store_name, deal);
                  }
                });

                const sortedItems = Array.from(bestByStoreMap.values()).sort(
                  (a, b) => Number(a.price) - Number(b.price)
                );

                const storeColor = getStoreBadgeColor(item.cheapest_store);

                return (
                  <View style={styles.productCard}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => toggleExpand(item.id)}
                      style={styles.cardHeaderArea}
                    >
                      <View style={styles.imageContainer}>
                        <ProductImageWithFallback
                          uri={item.image_url}
                          category={item.category}
                          name={item.display_name}
                        />
                      </View>

                      <View style={styles.cardBody}>
                        <View style={styles.tagHeaderRow}>
                          <View style={[styles.storeBadge, { backgroundColor: `${storeColor}20`, borderColor: `${storeColor}60` }]}>
                            <Feather name="map-pin" size={9} color={storeColor} style={{ marginRight: 3 }} />
                            <Text style={[styles.storeBadgeText, { color: storeColor }]}>
                              {item.cheapest_store}
                            </Text>
                          </View>

                          {item.spread > 0 && (
                            <View style={styles.spreadBadge}>
                              <Text style={styles.spreadBadgeText}>
                                -R$ {Number(item.spread).toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.productName} numberOfLines={2}>
                          {item.display_name}
                        </Text>

                        <View style={styles.priceActionRow}>
                          <View>
                            <Text style={styles.priceSmallLabel}>Melhor opção</Text>
                            <Text style={styles.cheapestPrice}>
                              R$ {Number(item.min_price).toFixed(2).replace('.', ',')}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[styles.basketBtn, inBasket && styles.basketBtnActive]}
                            onPress={(event) => {
                              event.stopPropagation();
                              if (inBasket) {
                                removeItem(item.id);
                              } else {
                                addItem({
                                  id: item.id,
                                  descricao: item.display_name,
                                  valor: item.min_price,
                                  estabelecimento: {
                                    nome: item.cheapest_store,
                                    endereco: '',
                                  },
                                });
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather
                              name={inBasket ? 'check' : 'plus'}
                              size={11}
                              color={inBasket ? '#10B981' : '#94A3B8'}
                              style={{ marginRight: 3 }}
                            />
                            <Text
                              style={[
                                styles.basketBtnText,
                                inBasket && styles.basketBtnTextActive,
                              ]}
                            >
                              {inBasket ? 'Na cesta' : 'Cesta'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.expandHint}>
                          {isExpanded ? 'Ocultar comparativo' : `Comparar em ${item.stores_count || sortedItems.length} mercados`}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.expandedSection}>
                        <Text style={styles.expandedTitle}>PREÇO NOS SUPERMERCADOS:</Text>
                        {sortedItems.map((storeDeal, idx) => {
                          const isWinner = idx === 0;
                          return (
                            <View
                              key={storeDeal.id || idx}
                              style={[
                                styles.storeRow,
                                isWinner && styles.cheapestStoreRow,
                              ]}
                            >
                              <View style={styles.storeRowLeft}>
                                <Feather
                                  name={isWinner ? 'award' : 'shopping-cart'}
                                  size={13}
                                  color={isWinner ? '#34D399' : '#64748B'}
                                  style={{ marginRight: 6 }}
                                />
                                <Text
                                  style={[
                                    styles.storeRowName,
                                    isWinner && styles.cheapestStoreText,
                                  ]}
                                >
                                  {storeDeal.store_name}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.storeRowPrice,
                                  isWinner && styles.cheapestStoreText,
                                ]}
                              >
                                R$ {Number(storeDeal.price).toFixed(2).replace('.', ',')}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* ABA 2: MENOR PREÇO GERAL / ACHADOS */}
      {activeTab === 'catalog' && (
        <>
          {loadingCatalog ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Procurando no catálogo...</Text>
            </View>
          ) : (
            <FlatList
              data={catalogDeals}
              keyExtractor={(item) => item.id}
              onEndReached={() => fetchCatalog(true)}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#10B981"
                />
              }
              contentContainerStyle={[
                styles.listContent,
                items.length > 0 && { paddingBottom: 110 },
              ]}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const inBasket = items.some((basketItem) => basketItem.id === item.id);
                const storeColor = getStoreBadgeColor(item.store_name);

                return (
                  <View style={styles.productCard}>
                    <View style={styles.cardHeaderArea}>
                      <View style={styles.imageContainer}>
                        <ProductImageWithFallback
                          uri={item.image_url}
                          category={item.category}
                          name={item.product_name}
                        />
                      </View>

                      <View style={styles.cardBody}>
                        <View style={styles.tagHeaderRow}>
                          <View style={[styles.storeBadge, { backgroundColor: `${storeColor}20`, borderColor: `${storeColor}60` }]}>
                            <Feather name="map-pin" size={9} color={storeColor} style={{ marginRight: 3 }} />
                            <Text style={[styles.storeBadgeText, { color: storeColor }]}>
                              {item.store_name}
                            </Text>
                          </View>
                          {item.category && (
                            <Text style={styles.categoryBadge}>{item.category}</Text>
                          )}
                        </View>

                        <Text style={styles.productName} numberOfLines={2}>
                          {item.product_name}
                        </Text>

                        <View style={styles.priceActionRow}>
                          <View>
                            <Text style={styles.priceSmallLabel}>Valor anunciado</Text>
                            <Text style={styles.cheapestPrice}>
                              R$ {Number(item.deal_price).toFixed(2).replace('.', ',')}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.basketBtn,
                              inBasket && styles.basketBtnActive,
                            ]}
                            onPress={() => {
                              if (inBasket) {
                                removeItem(item.id);
                              } else {
                                addItem({
                                  id: item.id,
                                  descricao: item.product_name,
                                  valor: item.deal_price,
                                  estabelecimento: {
                                    nome: item.store_name,
                                    endereco: '',
                                  },
                                });
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather
                              name={inBasket ? 'check' : 'plus'}
                              size={11}
                              color={inBasket ? '#10B981' : '#94A3B8'}
                              style={{ marginRight: 3 }}
                            />
                            <Text
                              style={[
                                styles.basketBtnText,
                                inBasket && styles.basketBtnTextActive,
                              ]}
                            >
                              {inBasket ? 'Na cesta' : 'Cesta'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Nenhuma oferta encontrada para esta pesquisa.</Text>
              }
              ListFooterComponent={
                loadingMoreCatalog ? (
                  <ActivityIndicator
                    style={styles.catalogLoadingMore}
                    color="#10B981"
                  />
                ) : undefined
              }
            />
          )}
        </>
      )}

      {/* ABA 3: ENCARTES & FOLHETOS */}
      {activeTab === 'flyers' && (
        <View style={{ flex: 1 }}>
          {loadingFlyers ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>A carregar encartes da semana...</Text>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.flyerStoreName}>{item.store_name}</Text>
                      <View
                        style={[
                          styles.flyerTypeBadge,
                          { backgroundColor: `${item.badge_color || '#10B981'}20` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.flyerTypeBadgeText,
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
                      Toque para abrir lâminas completas
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#64748B" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Barra Flutuante da Cesta Inteligente */}
      {items.length > 0 && activeTab !== 'flyers' && (
        <TouchableOpacity
          style={styles.floatingBar}
          activeOpacity={0.9}
          onPress={() => setBasketVisible(true)}
        >
          <View style={styles.floatingBarContent}>
            <View style={styles.floatingBarLeft}>
              <Feather name="shopping-bag" size={16} color="#0B0F19" />
              <Text style={styles.floatingBarText}>
                Cesta Inteligente • {items.length} {items.length === 1 ? 'item' : 'itens'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.floatingBarAction}>Comparar lojas</Text>
              <Feather name="arrow-right" size={13} color="#0B0F19" />
            </View>
          </View>
        </TouchableOpacity>
      )}

      <BasketModal visible={basketVisible} onClose={() => setBasketVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 44,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 10,
  },
  backText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 2,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 1,
  },
  headerCartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  headerCartBadgeText: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 12,
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
    paddingVertical: 7,
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
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
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
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
  },
  filtersContainer: {
    marginBottom: 8,
  },
  storesFilterContainer: {
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#131927',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  chipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  storeChip: {
    backgroundColor: '#131927',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  storeChipActive: {
    backgroundColor: '#1E293B',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  storeChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  storeChipTextActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  productCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeaderArea: {
    flexDirection: 'row',
    padding: 12,
  },
  imageContainer: {
    width: 86,
    height: 86,
    borderRadius: 10,
    backgroundColor: '#0B0F19',
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  tagHeaderRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 4,
  },
  storeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  storeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  spreadBadge: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  spreadBadgeText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '700',
  },
  categoryBadge: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '500',
  },
  productName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 6,
  },
  priceActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceSmallLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  cheapestPrice: {
    color: '#34D399',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  basketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  basketBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  basketBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  basketBtnTextActive: {
    color: '#10B981',
  },
  expandHint: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 6,
  },
  expandedSection: {
    backgroundColor: '#0B0F19',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  expandedTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  cheapestStoreRow: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  storeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeRowName: {
    color: '#94A3B8',
    fontSize: 12,
  },
  storeRowPrice: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  cheapestStoreText: {
    color: '#34D399',
    fontWeight: '700',
  },
  floatingBar: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 24 : 32,
    left: 16,
    right: 16,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatingBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingBarText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  floatingBarAction: {
    color: '#0B0F19',
    fontWeight: '700',
    fontSize: 12,
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  flyerStoreName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  flyerTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flyerTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  flyerActionHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    marginTop: 8,
    fontSize: 12,
  },
  catalogLoadingMore: {
    marginVertical: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 40,
    fontSize: 13,
  },
});