import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../config/supabase';

interface Props {
  visible: boolean;
  onClose: () => void;
  onEventCreated?: () => void;
}

interface ResolvedCity {
  name: string;
  state: string;
  fullTitle: string;
  lon: string;
  lat: string;
}

type TravelProfile = 'budget' | 'moderate' | 'comfort';

export const TravelEstimatorModal: React.FC<Props> = ({
  visible,
  onClose,
  onEventCreated,
}) => {
  // Perfil Selecionado
  const [selectedProfile, setSelectedProfile] = useState<TravelProfile>('moderate');

  // Entradas de Cidades
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  // Detalhes confirmados do GPS
  const [resolvedOrigin, setResolvedOrigin] = useState<ResolvedCity | null>(null);
  const [resolvedDest, setResolvedDest] = useState<ResolvedCity | null>(null);

  // Parâmetros de Viagem
  const [rawRouteKm, setRawRouteKm] = useState<number | null>(null); // Km sem margem
  const [distanceKm, setDistanceKm] = useState(''); // Km efetivo no cálculo
  const [hasUrbanMargin, setHasUrbanMargin] = useState(true); // +12% deslocamento local
  const [days, setDays] = useState('3');
  const [people, setPeople] = useState('2');

  // Transporte
  const [fuelPrice, setFuelPrice] = useState('6.19');
  const [consumptionKmPerL, setConsumptionKmPerL] = useState('11');
  const [autoTollEnabled, setAutoTollEnabled] = useState(false);
  const [tollCost, setTollCost] = useState('0');

  // Hospedagem & Alimentação (Inicia no perfil Moderado)
  const [hotelNightPrice, setHotelNightPrice] = useState('220');
  const [roomsCount, setRoomsCount] = useState('1');
  const [foodPerPersonPerDay, setFoodPerPersonPerDay] = useState('90');
  const [extraExpenses, setExtraExpenses] = useState('150');

  const [loadingRoute, setLoadingRoute] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);

  // Aplicar Perfis Pré-definidos
  const handleSelectProfile = (profile: TravelProfile) => {
    setSelectedProfile(profile);
    if (profile === 'budget') {
      setHotelNightPrice('120'); // Hostel / Quarto simples
      setFoodPerPersonPerDay('60'); // Refeições simples / PF / lanches
      setExtraExpenses('80');
    } else if (profile === 'moderate') {
      setHotelNightPrice('220'); // Hotel 3 estrelas / Pousada padrão
      setFoodPerPersonPerDay('90'); // 3 refeições executivas
      setExtraExpenses('150');
    } else if (profile === 'comfort') {
      setHotelNightPrice('380'); // Hotel superior / Resorts / Luxo
      setFoodPerPersonPerDay('160'); // Restaurantes à la carte
      setExtraExpenses('300');
    }
  };

  // Consulta do Nominatim com Estado
  const resolveCityGeo = async (inputCity: string): Promise<ResolvedCity> => {
    const query = inputCity.trim();
    const url =
      `https://nominatim.openstreetmap.org/search?format=json` +
      `&addressdetails=1` +
      `&q=${encodeURIComponent(query)}` +
      `&countrycodes=br` +
      `&featuretype=settlement` +
      `&limit=1`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'ManaCostApp/1.0 (contato@manacost.app)' },
    });
    const data = await res.json();

    if (!data || data.length === 0) {
      throw new Error(`Não encontramos "${inputCity}". Informe a sigla do estado (ex: ${inputCity}, PR).`);
    }

    const item = data[0];
    const cityName =
      item.address?.city ||
      item.address?.town ||
      item.address?.municipality ||
      item.address?.village ||
      item.name;
    const stateName = item.address?.state || '';

    return {
      name: cityName,
      state: stateName,
      fullTitle: stateName ? `${cityName} - ${stateName}` : cityName,
      lon: item.lon,
      lat: item.lat,
    };
  };

  const handleCalculateDistance = async () => {
    if (!origin.trim() || !destination.trim()) {
      Alert.alert('Atenção', 'Informe a cidade de origem e a de destino.');
      return;
    }

    setLoadingRoute(true);
    try {
      const orig = await resolveCityGeo(origin);
      const dest = await resolveCityGeo(destination);

      setResolvedOrigin(orig);
      setResolvedDest(dest);

      const routeRes = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${orig.lon},${orig.lat};${dest.lon},${dest.lat}?overview=false`
      );
      const routeData = await routeRes.json();

      if (routeData.code === 'Ok' && routeData.routes?.length) {
        const kmTrecho = Math.round(routeData.routes[0].distance / 1000);
        const roundTripRaw = kmTrecho * 2;
        setRawRouteKm(roundTripRaw);

        // Aplica margem urbana (+12%) se habilitada
        const finalKm = hasUrbanMargin ? Math.round(roundTripRaw * 1.12) : roundTripRaw;
        setDistanceKm(String(finalKm));

        // Se pedágio automático estiver ativo, estima R$ 0,14 por km de estrada pura
        if (autoTollEnabled) {
          const estimatedToll = Math.round(roundTripRaw * 0.14);
          setTollCost(String(estimatedToll));
        }

        Alert.alert(
          'Rota Identificada',
          `De: ${orig.fullTitle}\nPara: ${dest.fullTitle}\n\nEstrada: ${kmTrecho} km por trecho (${roundTripRaw} km ida e volta).\nMargem interna (+12% urbana): ${finalKm} km total.`
        );
      } else {
        throw new Error('Não foi possível traçar rota rodoviária entre essas cidades.');
      }
    } catch (err: any) {
      Alert.alert('Aviso de Localização', err.message || 'Falha ao buscar cidades.');
    } finally {
      setLoadingRoute(false);
    }
  };

  // Alternar a margem urbana manualmente
  const toggleUrbanMargin = () => {
    const nextState = !hasUrbanMargin;
    setHasUrbanMargin(nextState);
    if (rawRouteKm !== null) {
      const updatedKm = nextState ? Math.round(rawRouteKm * 1.12) : rawRouteKm;
      setDistanceKm(String(updatedKm));
    }
  };

  // Alternar o pedágio automático
  const toggleAutoToll = () => {
    const nextState = !autoTollEnabled;
    setAutoTollEnabled(nextState);
    if (nextState) {
      const baseKm = rawRouteKm || parseFloat(distanceKm.replace(',', '.')) || 0;
      const estimated = Math.round(baseKm * 0.14);
      setTollCost(String(estimated));
    } else {
      setTollCost('0');
    }
  };

  // Cálculos
  const numDays = Math.max(1, parseInt(days, 10) || 1);
  const numPeople = Math.max(1, parseInt(people, 10) || 1);
  const numRooms = Math.max(1, parseInt(roomsCount, 10) || 1);
  const numDistance = parseFloat(distanceKm.replace(',', '.')) || 0;
  const numFuelPrice = parseFloat(fuelPrice.replace(',', '.')) || 0;
  const numKmL = Math.max(1, parseFloat(consumptionKmPerL.replace(',', '.')) || 1);
  const numTolls = parseFloat(tollCost.replace(',', '.')) || 0;
  const numHotelDaily = parseFloat(hotelNightPrice.replace(',', '.')) || 0;
  const numFoodDaily = parseFloat(foodPerPersonPerDay.replace(',', '.')) || 0;
  const numExtra = parseFloat(extraExpenses.replace(',', '.')) || 0;

  const fuelTotal = (numDistance / numKmL) * numFuelPrice;
  const transportTotal = fuelTotal + numTolls;
  const nights = Math.max(1, numDays - 1);
  const hotelTotal = nights * numHotelDaily * numRooms;
  const foodTotal = numDays * numPeople * numFoodDaily;
  const grandTotal = transportTotal + hotelTotal + foodTotal + numExtra;
  const costPerPerson = grandTotal / numPeople;

  const handleCreateAsEvent = async () => {
    const finalDestName = resolvedDest ? resolvedDest.fullTitle : destination.trim();
    const finalOrigName = resolvedOrigin ? resolvedOrigin.fullTitle : origin.trim();

    if (!finalDestName) {
      Alert.alert('Atenção', 'Defina um destino para o evento.');
      return;
    }

    setSavingEvent(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado.');

      const routeDesc = finalOrigName ? `${finalOrigName} ➔ ${finalDestName}` : finalDestName;
      const profileLabel =
        selectedProfile === 'budget'
          ? 'Mochilão / Econômico'
          : selectedProfile === 'comfort'
          ? 'Conforto / Casal'
          : 'Padrão / Moderado';

      const simulationSummary =
        `Simulação: ${routeDesc}\n` +
        `• Perfil: ${profileLabel}\n` +
        `• Duração: ${numDays} dias (${nights} noites) | ${numPeople} pessoa(s)\n` +
        `• Transporte: R$ ${transportTotal.toFixed(2)} (${numDistance} km rodados` +
        (hasUrbanMargin && rawRouteKm ? ` [inclui +12% de margem urbana sobre ${rawRouteKm} km de estrada]` : '') +
        (autoTollEnabled ? ` [inclui R$ ${tollCost} de pedágios estimados por média rodoviária]` : '') +
        `)\n` +
        `• Hospedagem: R$ ${hotelTotal.toFixed(2)} (${numRooms} quarto(s) a R$ ${numHotelDaily.toFixed(2)}/noite)\n` +
        `• Alimentação: R$ ${foodTotal.toFixed(2)} (R$ ${numFoodDaily.toFixed(2)}/dia/pessoa)\n` +
        (numExtra > 0 ? `• Extras / Passeios: R$ ${numExtra.toFixed(2)}\n` : '') +
        `• Custo Médio por Pessoa: R$ ${costPerPerson.toFixed(2)}`;

      const eventTitle = resolvedDest
        ? `Viagem: ${resolvedDest.name} (${resolvedDest.state.slice(0, 2).toUpperCase() || 'BR'})`
        : `Viagem: ${destination.trim()}`;

      const { error } = await supabase.from('budget_events').insert([
        {
          user_id: user.id,
          title: eventTitle,
          target_budget: parseFloat(grandTotal.toFixed(2)),
          currency: 'BRL',
          description: simulationSummary,
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', 'Viagem criada com a memória de cálculo e margens registradas!');
      if (onEventCreated) onEventCreated();
      onClose();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao salvar evento.');
    } finally {
      setSavingEvent(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Simulador de Custos de Viagem</Text>
              <Text style={styles.sub}>Planejamento realista com margem de segurança</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Seletor de Perfis Rápidos */}
            <Text style={styles.sectionLabel}>Estilo de Viagem</Text>
            <View style={styles.profilesRow}>
              <TouchableOpacity
                style={[
                  styles.profileBtn,
                  selectedProfile === 'budget' && styles.profileBtnActiveBudget,
                ]}
                onPress={() => handleSelectProfile('budget')}
                activeOpacity={0.7}
              >
                <Text style={styles.profileEmoji}>🎒</Text>
                <Text
                  style={[
                    styles.profileBtnText,
                    selectedProfile === 'budget' && styles.profileBtnTextActive,
                  ]}
                >
                  Econômico
                </Text>
                <Text style={styles.profileSubText}>Hostel & Lanches</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.profileBtn,
                  selectedProfile === 'moderate' && styles.profileBtnActiveModerate,
                ]}
                onPress={() => handleSelectProfile('moderate')}
                activeOpacity={0.7}
              >
                <Text style={styles.profileEmoji}>🏨</Text>
                <Text
                  style={[
                    styles.profileBtnText,
                    selectedProfile === 'moderate' && styles.profileBtnTextActive,
                  ]}
                >
                  Moderado
                </Text>
                <Text style={styles.profileSubText}>Hotel 3★ & PF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.profileBtn,
                  selectedProfile === 'comfort' && styles.profileBtnActiveComfort,
                ]}
                onPress={() => handleSelectProfile('comfort')}
                activeOpacity={0.7}
              >
                <Text style={styles.profileEmoji}>🥂</Text>
                <Text
                  style={[
                    styles.profileBtnText,
                    selectedProfile === 'comfort' && styles.profileBtnTextActive,
                  ]}
                >
                  Conforto
                </Text>
                <Text style={styles.profileSubText}>Resort & Jantares</Text>
              </TouchableOpacity>
            </View>

            {/* Rota e Cidades */}
            <Text style={styles.sectionLabel}>Cidades & Estados</Text>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Origem</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Londrina, PR"
                  placeholderTextColor="#64748B"
                  value={origin}
                  onChangeText={(text) => {
                    setOrigin(text);
                    setResolvedOrigin(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Destino</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Gramado, RS"
                  placeholderTextColor="#64748B"
                  value={destination}
                  onChangeText={(text) => {
                    setDestination(text);
                    setResolvedDest(null);
                  }}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.calcDistanceBtn}
              onPress={handleCalculateDistance}
              disabled={loadingRoute}
            >
              {loadingRoute ? (
                <ActivityIndicator size="small" color="#38BDF8" />
              ) : (
                <Text style={styles.calcDistanceBtnText}>📍 Identificar Cidades & Traçar Km</Text>
              )}
            </TouchableOpacity>

            {/* Banner com a rota confirmada */}
            {(resolvedOrigin || resolvedDest) && (
              <View style={styles.geoConfirmedBanner}>
                <Text style={styles.geoConfirmedTitle}>📍 Rota Confirmada pelo Mapa:</Text>
                <Text style={styles.geoConfirmedText}>
                  {resolvedOrigin ? resolvedOrigin.fullTitle : origin}
                  {' ➔ '}
                  {resolvedDest ? resolvedDest.fullTitle : destination}
                </Text>
              </View>
            )}

            {/* Parâmetros de Duração e Km com Margem Urbana */}
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Km Efetivo (Ida e Volta)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Duração (Dias)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={days}
                  onChangeText={setDays}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Pessoas</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={people}
                  onChangeText={setPeople}
                />
              </View>
            </View>

            {/* Margem urbana de deslocamento local */}
            <TouchableOpacity
              style={styles.checkboxFeatureRow}
              onPress={toggleUrbanMargin}
              activeOpacity={0.7}
            >
              <View style={[styles.checkboxBox, hasUrbanMargin && styles.checkboxBoxChecked]}>
                {hasUrbanMargin && <Text style={styles.checkboxCheckmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkboxFeatureTitle}>
                  Margem de Segurança Urbana (+12% de Km)
                </Text>
                <Text style={styles.checkboxFeatureSub}>
                  Adiciona quilômetros extras para deslocamento interno (hotel, atrações e restaurantes).
                  {rawRouteKm ? ` (Estrada: ${rawRouteKm} km ➔ Efetivo: ${distanceKm} km)` : ''}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Transporte */}
            <Text style={styles.sectionLabel}>Combustível & Pedágios</Text>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Gasolina (R$/L)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={fuelPrice}
                  onChangeText={setFuelPrice}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Consumo (Km/L)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={consumptionKmPerL}
                  onChangeText={setConsumptionKmPerL}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Pedágios (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={tollCost}
                  onChangeText={setTollCost}
                />
              </View>
            </View>

            {/* Checkbox de Estimativa Heurística de Pedágio */}
            <TouchableOpacity
              style={styles.checkboxFeatureRow}
              onPress={toggleAutoToll}
              activeOpacity={0.7}
            >
              <View style={[styles.checkboxBox, autoTollEnabled && styles.checkboxBoxChecked]}>
                {autoTollEnabled && <Text style={styles.checkboxCheckmark}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkboxFeatureTitle}>
                  Estimar pedágios automaticamente (~R$ 0,14/km)
                </Text>
                <Text style={styles.checkboxFeatureSub}>
                  Calcula uma média de tarifas cobradas em rodovias concedidas brasileiras.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Hospedagem e Alimentação */}
            <Text style={styles.sectionLabel}>Hospedagem & Alimentação</Text>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Diária Quarto (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={hotelNightPrice}
                  onChangeText={setHotelNightPrice}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Qtd. Quartos</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={roomsCount}
                  onChangeText={setRoomsCount}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Refeição/Dia/Pessoa (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={foodPerPersonPerDay}
                  onChangeText={setFoodPerPersonPerDay}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Extras/Passeios (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={extraExpenses}
                  onChangeText={setExtraExpenses}
                />
              </View>
            </View>

            {/* Resumo */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Discriminação dos Custos Estimados</Text>

              <View style={styles.summaryLine}>
                <Text style={styles.summaryLineLabel}>
                  ⛽ Combustível + Pedágios ({numDistance} km):
                </Text>
                <Text style={styles.summaryLineVal}>R$ {transportTotal.toFixed(2)}</Text>
              </View>

              <View style={styles.summaryLine}>
                <Text style={styles.summaryLineLabel}>
                  🏨 Hospedagem ({nights} noites em {numRooms} qto):
                </Text>
                <Text style={styles.summaryLineVal}>R$ {hotelTotal.toFixed(2)}</Text>
              </View>

              <View style={styles.summaryLine}>
                <Text style={styles.summaryLineLabel}>
                  🍽️ Alimentação ({numDays} dias p/ {numPeople} pessoas):
                </Text>
                <Text style={styles.summaryLineVal}>R$ {foodTotal.toFixed(2)}</Text>
              </View>

              {numExtra > 0 && (
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLineLabel}>🎟️ Passeios & Extras:</Text>
                  <Text style={styles.summaryLineVal}>R$ {numExtra.toFixed(2)}</Text>
                </View>
              )}

              <View style={styles.summaryDivider} />

              <View style={styles.summaryTotalRow}>
                <View>
                  <Text style={styles.totalLabel}>CUSTO TOTAL ESTIMADO</Text>
                  <Text style={styles.totalValue}>R$ {grandTotal.toFixed(2)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.perPersonLabel}>Por Pessoa</Text>
                  <Text style={styles.perPersonVal}>R$ {costPerPerson.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* Botão de Criação */}
            <TouchableOpacity
              style={styles.saveAsEventBtn}
              onPress={handleCreateAsEvent}
              disabled={savingEvent}
              activeOpacity={0.7}
            >
              {savingEvent ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.saveAsEventBtnText}>
                  ✈️ Criar Viagem com essa Meta
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Text style={styles.closeModalBtnText}>Fechar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '94%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  sub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  closeBtn: { padding: 4 },
  closeBtnText: { color: '#94A3B8', fontSize: 18, fontWeight: 'bold' },
  sectionLabel: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 8,
  },
  profilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  profileBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  profileBtnActiveBudget: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  profileBtnActiveModerate: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  profileBtnActiveComfort: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  profileEmoji: { fontSize: 18, marginBottom: 2 },
  profileBtnText: { color: '#94A3B8', fontSize: 12, fontWeight: 'bold' },
  profileBtnTextActive: { color: '#F8FAFC' },
  profileSubText: { color: '#64748B', fontSize: 9, marginTop: 2, textAlign: 'center' },
  label: { color: '#94A3B8', fontSize: 11, marginBottom: 4 },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 13,
  },
  calcDistanceBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  calcDistanceBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  geoConfirmedBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  geoConfirmedTitle: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  geoConfirmedText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  checkboxFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  checkboxCheckmark: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxFeatureTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  checkboxFeatureSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  summaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLineLabel: { color: '#94A3B8', fontSize: 12 },
  summaryLineVal: { color: '#F8FAFC', fontSize: 12, fontWeight: '600' },
  summaryDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 10,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { color: '#94A3B8', fontSize: 11, fontWeight: 'bold' },
  totalValue: { color: '#10B981', fontSize: 20, fontWeight: 'bold' },
  perPersonLabel: { color: '#94A3B8', fontSize: 11 },
  perPersonVal: { color: '#38BDF8', fontSize: 15, fontWeight: 'bold' },
  saveAsEventBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveAsEventBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 14,
  },
  closeModalBtn: {
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 16,
  },
  closeModalBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 13,
  },
});