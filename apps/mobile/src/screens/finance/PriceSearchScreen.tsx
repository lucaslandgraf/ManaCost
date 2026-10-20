import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';

interface ProdutoPreco {
  id: string;
  descricao: string;
  valor: number;
  valorOriginal: number | null;
  dataHora: string | null;
  tempoRelativo: string;
  distanciaKm: string | null;
  estabelecimento: {
    nome: string;
    endereco: string;
    bairro: string;
    municipio: string;
    latitude?: number;
    longitude?: number;
  };
}

interface PriceSearchScreenProps {
  onBack: () => void;
}

const PRESET_QUERIES = ['Gasolina Comum', 'Etanol', 'Leite Integral', 'Arroz 5kg', 'Café 500g', 'Ovos'];
const RADIUS_OPTIONS = [5, 10, 15, 20];
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(latitude: number, longitude: number, precision: number = 9): string {
  const BITS = [16, 8, 4, 2, 1];
  let isEven = true;
  let latMin = -90.0, latMax = 90.0;
  let lonMin = -180.0, lonMax = 180.0;
  let arg = 0;
  let bit = 0;
  let hash = '';

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude > mid) {
        arg |= BITS[bit];
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude > mid) {
        arg |= BITS[bit];
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[arg];
      bit = 0;
      arg = 0;
    }
  }
  return hash;
}

function decodeGeohash(geohash: string): { latitude: number; longitude: number } {
  let isEven = true;
  let latMin = -90.0, latMax = 90.0;
  let lonMin = -180.0, lonMax = 180.0;

  for (let i = 0; i < geohash.length; i++) {
    const c = geohash[i];
    const cd = BASE32.indexOf(c);
    if (cd === -1) break;

    for (let j = 0; j < 5; j++) {
      const mask = [16, 8, 4, 2, 1][j];
      if (isEven) {
        const mid = (lonMin + lonMax) / 2;
        if ((cd & mask) !== 0) {
          lonMin = mid;
        } else {
          lonMax = mid;
        }
      } else {
        const mid = (latMin + latMax) / 2;
        if ((cd & mask) !== 0) {
          latMin = mid;
        } else {
          latMax = mid;
        }
      }
      isEven = !isEven;
    }
  }

  return {
    latitude: Number(((latMin + latMax) / 2).toFixed(6)),
    longitude: Number(((lonMin + lonMax) / 2).toFixed(6)),
  };
}

export const PriceSearchScreen: React.FC<PriceSearchScreenProps> = ({ onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [radius, setRadius] = useState<number>(10);
  const [results, setResults] = useState<ProdutoPreco[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [sortBy, setSortBy] = useState<'distancia' | 'preco'>('distancia');

  // Coordenadas dinâmicas do GPS com fallback para Londrina
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: -23.3045,
    lng: -51.1696,
  });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserCoords({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        }
      } catch (err) {
        console.warn('Não foi possível obter o GPS exato, usando padrão:', err);
      }
    })();
  }, []);

  const handleSearch = async (termToSearch?: string) => {
    const term = (termToSearch || searchTerm).trim();
    if (!term) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const localGeohash = encodeGeohash(userCoords.lat, userCoords.lng, 9);
      const termoBase = term.split(' ')[0];

      const browserHeaders = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': `https://menorpreco.notaparana.pr.gov.br/app?termo=${encodeURIComponent(term)}&local=${localGeohash}`,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      };

      // 1. Obter Categoria
      let catId = '';
      try {
        const catRes = await fetch(
          `https://menorpreco.notaparana.pr.gov.br/api/v1/categorias?local=${localGeohash}&termo=${encodeURIComponent(termoBase)}&raio=${radius}`,
          { headers: browserHeaders }
        );
        if (catRes.ok) {
          const catData = await catRes.json();
          const listaCats = catData?.categorias || (Array.isArray(catData) ? catData : []);
          if (listaCats.length > 0) {
            catId = String(listaCats[0].id || listaCats[0].codigo || '');
          }
        }
      } catch (_) {}

      // 2. Obter Produtos
      const prodParams = new URLSearchParams({
        local: localGeohash,
        termo: term,
        offset: '0',
        raio: String(radius),
        data: '-1',
        ordem: '0',
      });

      if (catId) {
        prodParams.append('categoria', catId);
      }

      const prodRes = await fetch(
        `https://menorpreco.notaparana.pr.gov.br/api/v1/produtos?${prodParams.toString()}`,
        { method: 'GET', headers: browserHeaders }
      );

      if (!prodRes.ok) {
        throw new Error(`Erro na resposta da SEFAZ (${prodRes.status})`);
      }

      const data = await prodRes.json();
      const rawList = data?.produtos || [];

      const mapped: ProdutoPreco[] = rawList
        .map((item: any) => {
          const est = item.estabelecimento || {};
          const nomeEstabelecimento = (est.nm_fan || est.nm_emp || 'Mercado').trim();

          const logr = [est.tp_logr, est.nm_logr].filter(Boolean).join(' ').trim();
          const enderecoCompleto = logr ? `${logr}, ${est.nr_logr || 's/n'}` : '';

          const coords = decodeGeohash(item.local || localGeohash);

          return {
            id: String(item.id || item.codigo || Math.random()),
            descricao: (item.desc || term).trim(),
            valor: parseFloat(String(item.valor || 0).replace(',', '.')),
            valorOriginal: item.valor_tabela ? parseFloat(String(item.valor_tabela).replace(',', '.')) : null,
            dataHora: item.datahora || null,
            tempoRelativo: item.tempo || 'recente',
            distanciaKm: item.distkm ? Number(item.distkm).toFixed(2) : null,
            estabelecimento: {
              nome: nomeEstabelecimento,
              endereco: enderecoCompleto,
              bairro: est.bairro || '',
              municipio: est.mun || 'Londrina',
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
          };
        })
        // Filtra endereços de zona rural ou coordenadas sem número que distorcem o raio urbano
        .filter((prod: ProdutoPreco) => {
          const endereco = (prod.estabelecimento.endereco || '').toUpperCase();
          const bairro = (prod.estabelecimento.bairro || '').toUpperCase();
          
          const isRural =
            endereco.includes('ZONA RURAL') ||
            endereco.includes('COL NOVA') ||
            endereco.includes('ASSENTAMENTO') ||
            bairro.includes('ZONA RURAL') ||
            bairro.includes('RURAL');

          return !isRural;
        });

      setResults(mapped);
    } catch (err: any) {
      console.warn('Erro ao consultar Menor Preço diretamente no dispositivo:', err);
      alert('Não foi possível obter os preços. Verifique a ligação e tente novamente.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (sortBy === 'distancia') {
        const distA = parseFloat(a.distanciaKm || '9999');
        const distB = parseFloat(b.distanciaKm || '9999');
        return distA - distB;
      } else {
        return a.valor - b.valor;
      }
    });
  }, [results, sortBy]);

  const openInMaps = (item: ProdutoPreco) => {
    const cleanName = item.estabelecimento.nome
      .replace(/\b(LTDA|EPP|ME|EIRELI|S\/A)\b/gi, '')
      .replace(/[-_]/g, ' ')
      .trim();

    let searchQuery = '';

    if (item.estabelecimento.endereco) {
      searchQuery = `${cleanName}, ${item.estabelecimento.endereco}, ${item.estabelecimento.bairro || ''}, ${item.estabelecimento.municipio || 'Londrina'}`;
    } else {
      searchQuery = item.estabelecimento.latitude && item.estabelecimento.longitude
        ? `${item.estabelecimento.latitude},${item.estabelecimento.longitude}`
        : `${cleanName}, Londrina - PR`;
    }

    const encodedQuery = encodeURIComponent(searchQuery.replace(/\s{2,}/g, ' ').trim());

    const url = Platform.select({
      ios: `maps:0,0?q=${encodedQuery}`,
      android: `geo:0,0?q=${encodedQuery}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
    });

    if (url) Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Menor Preço Paraná</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Barra de Busca */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Ex: Gasolina Comum, Leite, Arroz..."
          placeholderTextColor="#64748B"
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={() => handleSearch()}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch()}>
          <Text style={styles.searchBtnText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Atalhos Rápidos */}
      <View style={styles.presetsWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={PRESET_QUERIES}
          keyExtractor={(item) => item}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                setSearchTerm(item);
                handleSearch(item);
              }}
            >
              <Text style={styles.presetChipText}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Filtro de Raio */}
      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Raio de busca:</Text>
        <View style={styles.radiusChips}>
          {RADIUS_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
              onPress={() => {
                setRadius(r);
                if (searchTerm.trim()) handleSearch();
              }}
            >
              <Text style={[styles.radiusText, radius === r && styles.radiusTextActive]}>
                {r} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Seletor de Ordenação */}
      {results.length > 0 && (
        <View style={styles.sortBar}>
          <Text style={styles.sortLabel}>Ordenar por:</Text>
          <View style={styles.sortButtonsRow}>
            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'distancia' && styles.sortBtnActive]}
              onPress={() => setSortBy('distancia')}
            >
              <Text style={[styles.sortBtnText, sortBy === 'distancia' && styles.sortBtnTextActive]}>
                🚗 Mais Próximos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortBtn, sortBy === 'preco' && styles.sortBtnActive]}
              onPress={() => setSortBy('preco')}
            >
              <Text style={[styles.sortBtnText, sortBy === 'preco' && styles.sortBtnTextActive]}>
                💰 Menor Preço
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Lista de Resultados */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Consultando notas fiscais recentes na SEFAZ-PR...</Text>
        </View>
      ) : (
        <FlatList
          data={sortedResults}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {item.descricao}
                  </Text>

                  <Text style={styles.cardEstablishment} numberOfLines={1}>
                    🏪 {item.estabelecimento.nome}
                  </Text>

                  {item.estabelecimento.endereco || item.estabelecimento.bairro ? (
                    <Text style={styles.cardAddress} numberOfLines={1}>
                      📍 {[item.estabelecimento.endereco, item.estabelecimento.bairro].filter(Boolean).join(' - ')}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.priceContainer}>
                  <Text style={styles.cardPrice}>
                    R$ {item.valor.toFixed(2).replace('.', ',')}
                  </Text>
                  {item.distanciaKm && (
                    <Text style={styles.cardDistance}>🚗 {item.distanciaKm} km</Text>
                  )}
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardFooter}>
                <Text style={styles.timeTag}>🕒 Emitido {item.tempoRelativo}</Text>
                <TouchableOpacity style={styles.routeBtn} onPress={() => openInMaps(item)}>
                  <Text style={styles.routeBtnText}>Abrir no Mapa ↗</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            hasSearched ? (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>Nenhum preço registrado no raio de {radius} km.</Text>
                <Text style={styles.emptySubText}>Tente aumentar o raio ou simplificar o termo de busca.</Text>
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>Digite um produto ou toque num atalho acima.</Text>
                <Text style={styles.emptySubText}>Pesquisa em tempo real via notas fiscais (NFC-e) do Paraná.</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { paddingVertical: 4 },
  backBtnText: { color: '#38BDF8', fontSize: 16, fontWeight: 'bold' },
  title: { color: '#F8FAFC', fontSize: 17, fontWeight: 'bold' },
  searchBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
  },
  searchBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { fontSize: 16 },
  presetsWrapper: { marginBottom: 12 },
  presetChip: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  presetChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '500' },
  radiusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  radiusLabel: { color: '#94A3B8', fontSize: 12 },
  radiusChips: { flexDirection: 'row', gap: 6 },
  radiusChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  radiusChipActive: { backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38BDF8' },
  radiusText: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  radiusTextActive: { color: '#38BDF8', fontWeight: 'bold' },
  sortBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sortLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  sortButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sortBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sortBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  sortBtnText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: '#34D399',
    fontWeight: 'bold',
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardDesc: { color: '#F8FAFC', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  cardEstablishment: { color: '#94A3B8', fontSize: 12 },
  cardAddress: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  priceContainer: { alignItems: 'flex-end' },
  cardPrice: { color: '#10B981', fontSize: 18, fontWeight: 'bold' },
  cardDistance: { color: '#38BDF8', fontSize: 11, fontWeight: '600', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeTag: { color: '#64748B', fontSize: 11 },
  routeBtn: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  routeBtnText: { color: '#38BDF8', fontSize: 11, fontWeight: '600' },
  centerContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 13, textAlign: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptySubText: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 6 },
});