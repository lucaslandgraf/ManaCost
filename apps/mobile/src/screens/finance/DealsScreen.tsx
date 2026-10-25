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
} from 'react-native';
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

// Lista apenas lojas que possuem raspagem de ofertas ativas no banco de dados
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

// URLs dos encartes para a aba Encartes (aqui podem ficar todos, incluindo Tonhão e Max)
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

    if (text.includes('agua') || text.includes('água') || text.includes('mineral')) return '💧';
    if (text.includes('bisteca') || text.includes('carne') || text.includes('suin') || text.includes('bovin') || text.includes('frango')) return '🥩';
    if (text.includes('arroz') || text.includes('feijao') || text.includes('farinha') || text.includes('trigo')) return '🌾';
    if (text.includes('cerveja') || text.includes('chopp')) return '🍺';
    if (text.includes('refrigerante') || text.includes('suco') || text.includes('nectar')) return '🥤';
    if (text.includes('leite') || text.includes('queijo') || text.includes('iogurte') || text.includes('mussarela')) return '🧀';
    if (text.includes('limpeza') || text.includes('detergente') || text.includes('sabao') || text.includes('amaciante') || text.includes('desinfetante')) return '🧹';
    if (text.includes('dente') || text.includes('escova') || text.includes('sabonete') || text.includes('shampoo')) return '🪥';
    if (text.includes('maca') || text.includes('maçã') || text.includes('laranja') || text.includes('banana') || text.includes('tomate')) return '🍎';
    if (text.includes('pao') || text.includes('biscoito') || text.includes('bolacha')) return '🍞';

    return '🛒';
  };

  if (!uri || hasError) {
    return (
      <View style={styles.cardImagePlaceholder}>
        <Text style={styles.cardPlaceholderEmoji}>{getFallbackIcon()}</Text>
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

  // Estados dos Produtos Comparados (Aba 1)
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Estados do Catálogo Geral / Menor Preço (Aba 2)
  const [catalogDeals, setCatalogDeals] = useState<FlyerDeal[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingMoreCatalog, setLoadingMoreCatalog] = useState(false);
  const [hasMoreCatalog, setHasMoreCatalog] = useState(true);
  const catalogRequestId = useRef(0);
  const loadingMoreCatalogRef = useRef(false);

  // Filtros Globais
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedStore, setSelectedStore] = useState<string>('Todas');
  const [refreshing, setRefreshing] = useState(false);

  // Estados dos Encartes (Aba 3)
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loadingFlyers, setLoadingFlyers] = useState(false);
  const [previewFlyer, setPreviewFlyer] = useState<{ name: string; url: string } | null>(null);
  const [loadingWeb, setLoadingWeb] = useState(true);

  // Cesta Inteligente
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
        // Tolerância de correspondência para nomes de lojas do banco
        let storeKeyword = selectedStore;
        if (selectedStore.includes('Almeida')) {
          storeKeyword = 'Almeida';
        } else if (selectedStore.includes('Muffato')) {
          storeKeyword = 'Muffato';
        } else if (selectedStore.includes('Condor')) {
          storeKeyword = 'Condor';
        } else if (selectedStore.includes('Atacadão')) {
          storeKeyword = 'Atacad';
        } else if (selectedStore.includes('Amigão')) {
          storeKeyword = 'Amigão';
        } else if (selectedStore.includes('Carrefour')) {
          storeKeyword = 'Carrefour';
        } else if (selectedStore.includes('Santarém')) {
          storeKeyword = 'Santarém';
        } else if (selectedStore.includes('Viscardi')) {
          storeKeyword = 'Viscardi';
        }

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

  if (previewFlyer) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              📰 {previewFlyer.name}
            </Text>
            <Text style={styles.previewSubtitle}>Folheto oficial da semana</Text>
          </View>
          <TouchableOpacity onPress={() => setPreviewFlyer(null)} style={styles.closePreviewBtn}>
            <Text style={styles.closePreviewText}>✕ Fechar</Text>
          </TouchableOpacity>
        </View>

        {loadingWeb && (
          <View style={styles.webLoadingOverlay}>
            <ActivityIndicator size="large" color="#38BDF8" />
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
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>ManaCost Londrina</Text>
          <Text style={styles.subtitle}>Encartes e Comparador de Supermercados</Text>
          {lastUpdated ? (
            <Text style={styles.lastUpdatedText}>🕒 Atualizado {lastUpdated}</Text>
          ) : null}
        </View>
        {items.length > 0 && activeTab !== 'flyers' && (
          <TouchableOpacity
            style={styles.headerCartBadge}
            onPress={() => setBasketVisible(true)}
          >
            <Text style={styles.headerCartBadgeText}>🛒 {items.length}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Seletor de Três Abas */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'matches' && styles.tabButtonActive]}
          onPress={() => setActiveTab('matches')}
        >
          <Text style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}>
            🔍 Comparativo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'catalog' && styles.tabButtonActive]}
          onPress={() => setActiveTab('catalog')}
        >
          <Text style={[styles.tabText, activeTab === 'catalog' && styles.tabTextActive]}>
            🏷️ Menor Preço
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'flyers' && styles.tabButtonActive]}
          onPress={() => setActiveTab('flyers')}
        >
          <Text style={[styles.tabText, activeTab === 'flyers' && styles.tabTextActive]}>
            📰 Encartes
          </Text>
        </TouchableOpacity>
      </View>

      {/* Barra de Pesquisa e Filtros */}
      {activeTab !== 'flyers' && (
        <>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={
                activeTab === 'catalog'
                  ? 'Buscar em todas as 6.000 ofertas (ex: coyote, refriko)...'
                  : 'Buscar arroz, café, leite, carne...'
              }
              placeholderTextColor="#64748B"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Filtro de Categorias */}
          <View style={styles.filtersContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={categories}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.chip,
                    selectedCategory === item && styles.chipActive,
                  ]}
                  onPress={() => setSelectedCategory(item)}
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

          {/* Filtro por Supermercado */}
          {activeTab === 'catalog' && (
            <View style={styles.storesFilterContainer}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={STORES_LIST}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.storeChip,
                      selectedStore === item && styles.storeChipActive,
                    ]}
                    onPress={() => setSelectedStore(item)}
                  >
                    <Text
                      style={[
                        styles.storeChipText,
                        selectedStore === item && styles.storeChipTextActive,
                      ]}
                    >
                      {item === 'Todas' ? '🏬 Todas as Lojas' : item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </>
      )}

      {/* ABA 1: PRODUTOS COMPARADOS */}
      {activeTab === 'matches' && (
        <>
          {loadingMatches ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#10B981" />
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
                items.length > 0 && { paddingBottom: 85 },
              ]}
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

                return (
                  <View style={styles.card}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => toggleExpand(item.id)}
                      style={styles.cardHeaderArea}
                    >
                      <ProductImageWithFallback
                        uri={item.image_url}
                        category={item.category}
                        name={item.display_name}
                      />

                      <View style={styles.cardBody}>
                        <View style={styles.badgeRow}>
                          <View style={[styles.storesBadge, { backgroundColor: '#059669' }]}>
                            <Text style={styles.storesBadgeText}>{item.cheapest_store}</Text>
                          </View>
                          {item.category && (
                            <Text style={styles.categoryBadge}>{item.category}</Text>
                          )}
                        </View>

                        <Text style={styles.productName} numberOfLines={isExpanded ? undefined : 2}>
                          {item.display_name}
                        </Text>

                        <View style={styles.priceHighlightRow}>
                          <View>
                            <Text style={styles.cheapestLabel}>Melhor preço</Text>
                            <Text style={styles.cheapestPrice}>
                              R$ {Number(item.min_price).toFixed(2).replace('.', ',')}
                            </Text>
                          </View>

                          <View style={styles.spreadBox}>
                            <Text style={styles.spreadLabel}>Economia</Text>
                            <Text style={styles.spreadValue}>
                              R$ {Number(item.spread).toFixed(2).replace('.', ',')}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardFooterActions}>
                          <Text style={styles.expandHint}>
                            {isExpanded ? 'Ocultar lojas' : 'Ver lojas'}
                          </Text>

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
                          >
                            <Text
                              style={[
                                styles.basketBtnText,
                                inBasket && styles.basketBtnTextActive,
                              ]}
                            >
                              {inBasket ? '✓ Na Cesta' : '+ Cesta'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.expandedSection}>
                        <Text style={styles.expandedTitle}>Preço por Supermercado:</Text>
                        {sortedItems.map((storeDeal, idx) => (
                          <View
                            key={storeDeal.id || idx}
                            style={[
                              styles.storeRow,
                              idx === 0 && styles.cheapestStoreRow,
                            ]}
                          >
                            <View style={styles.storeRowLeft}>
                              <Text
                                style={[
                                  styles.storeRowName,
                                  idx === 0 && styles.cheapestStoreText,
                                ]}
                              >
                                {storeDeal.store_name}
                                {idx === 0 && ' (Mais Barato)'}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.storeRowPrice,
                                idx === 0 && styles.cheapestStoreText,
                              ]}
                            >
                              R$ {Number(storeDeal.price).toFixed(2).replace('.', ',')}
                            </Text>
                          </View>
                        ))}
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
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Buscando as melhores ofertas...</Text>
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
                  tintColor="#38BDF8"
                />
              }
              contentContainerStyle={[
                styles.listContent,
                items.length > 0 && { paddingBottom: 85 },
              ]}
              renderItem={({ item }) => {
                const inBasket = items.some((basketItem) => basketItem.id === item.id);

                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeaderArea}>
                      <ProductImageWithFallback
                        uri={item.image_url}
                        category={item.category}
                        name={item.product_name}
                      />

                      <View style={styles.cardBody}>
                        <View style={styles.badgeRow}>
                          <View
                            style={[
                              styles.storesBadge,
                              { backgroundColor: '#059669' },
                            ]}
                          >
                            <Text style={styles.storesBadgeText}>
                              {item.store_name}
                            </Text>
                          </View>
                          {item.category && (
                            <Text style={styles.categoryBadge}>{item.category}</Text>
                          )}
                        </View>

                        <Text style={styles.productName} numberOfLines={4}>
                          {item.product_name}
                        </Text>

                        <View style={styles.priceHighlightRow}>
                          <View>
                            <Text style={styles.cheapestLabel}>Preço no Encarte</Text>
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
                          >
                            <Text
                              style={[
                                styles.basketBtnText,
                                inBasket && styles.basketBtnTextActive,
                              ]}
                            >
                              {inBasket ? '✓ Na Cesta' : '+ Cesta'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Nenhuma oferta encontrada para essa busca.</Text>
              }
              ListFooterComponent={
                loadingMoreCatalog ? (
                  <ActivityIndicator
                    style={styles.catalogLoadingMore}
                    color="#38BDF8"
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
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>A carregar encartes...</Text>
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
                      Visualizar lâminas dentro da aplicação
                    </Text>
                  </View>
                  <Text style={styles.flyerArrow}>👁️</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Barra Flutuante da Cesta */}
      {items.length > 0 && activeTab !== 'flyers' && (
        <TouchableOpacity
          style={styles.floatingBar}
          activeOpacity={0.9}
          onPress={() => setBasketVisible(true)}
        >
          <View style={styles.floatingBarContent}>
            <Text style={styles.floatingBarText}>
              🛒 {items.length} {items.length === 1 ? 'item na Cesta' : 'itens na Cesta'}
            </Text>
            <Text style={styles.floatingBarAction}>Comparar Lojas →</Text>
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
    backgroundColor: '#0F172A',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
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
  subtitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  lastUpdatedText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  headerCartBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  headerCartBadgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#38BDF8',
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  storesFilterContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
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
  storeChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  storeChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  storeChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  storeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderArea: {
    flexDirection: 'row',
  },
  cardImage: {
    width: 100,
    height: 120,
    backgroundColor: '#0F172A',
  },
  cardImagePlaceholder: {
    width: 100,
    height: 120,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  cardPlaceholderEmoji: {
    fontSize: 38,
  },
  cardBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  storesBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  storesBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  productName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  priceHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6,
  },
  cheapestLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  cheapestPrice: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
  },
  spreadBox: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  spreadLabel: {
    color: '#F59E0B',
    fontSize: 10,
  },
  spreadValue: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardFooterActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  expandHint: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '500',
  },
  basketBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  basketBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  basketBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: 'bold',
  },
  basketBtnTextActive: {
    color: '#FFFFFF',
  },
  expandedSection: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  expandedTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  cheapestStoreRow: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  storeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeRowName: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  storeRowPrice: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  cheapestStoreText: {
    color: '#10B981',
    fontWeight: 'bold',
  },
  floatingBar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    elevation: 8,
  },
  floatingBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatingBarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  floatingBarAction: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    textDecorationLine: 'underline',
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
  flyerActionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
  },
  flyerArrow: {
    fontSize: 16,
    marginLeft: 10,
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
    position: 'absolute',
    top: 50,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#0F172A',
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
    color: '#94A3B8',
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
    fontSize: 14,
  },
});