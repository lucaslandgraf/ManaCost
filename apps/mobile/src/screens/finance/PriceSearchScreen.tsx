import React, { useState } from 'react';
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

// URL do Proxy do Menor Preço (substitua pela sua URL pública HTTPS do Cloudflare ou Render)
const API_BASE_URL = 'https://ours-writings-therapy-knights.trycloudflare.com';

export const PriceSearchScreen: React.FC<PriceSearchScreenProps> = ({ onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [radius, setRadius] = useState<number>(10);
  const [results, setResults] = useState<ProdutoPreco[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Coordenadas padrão de Londrina (Centro)
  const userLat = -23.3045;
  const userLng = -51.1696;

  const handleSearch = async (termToSearch?: string) => {
    const term = (termToSearch || searchTerm).trim();
    if (!term) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(`${API_BASE_URL}/menor-preco`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termo: term,
          latitude: userLat,
          longitude: userLng,
          raio: radius,
        }),
      });

      if (!res.ok) {
        throw new Error(`Erro na consulta (${res.status})`);
      }

      const data = await res.json();
      setResults(data?.produtos || []);
    } catch (err: any) {
      console.warn('Erro ao consultar menores preços:', err);
      alert('Não foi possível obter os preços. Verifique sua conexão e tente novamente.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const openInMaps = (item: ProdutoPreco) => {
    const query = item.estabelecimento.latitude && item.estabelecimento.longitude
      ? `${item.estabelecimento.latitude},${item.estabelecimento.longitude}`
      : encodeURIComponent(`${item.estabelecimento.nome}, ${item.estabelecimento.endereco}, Londrina`);
    
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
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
              onPress={() => setRadius(r)}
            >
              <Text style={[styles.radiusText, radius === r && styles.radiusTextActive]}>
                {r} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Lista de Resultados */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Consultando notas fiscais recentes na SEFAZ-PR...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.cardDesc} numberOfLines={2}>{item.descricao}</Text>
                  
                  {/* Nome do Mercado / Posto */}
                  <Text style={styles.cardEstablishment} numberOfLines={1}>
                    🏪 {item.estabelecimento.nome}
                  </Text>

                  {/* Endereço Completo com Bairro */}
                  {(item.estabelecimento.endereco || item.estabelecimento.bairro) ? (
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
                <TouchableOpacity
                  style={styles.routeBtn}
                  onPress={() => openInMaps(item)}
                >
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
    marginBottom: 12,
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