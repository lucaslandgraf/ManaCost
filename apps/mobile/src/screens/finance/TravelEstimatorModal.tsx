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
import { Feather } from '@expo/vector-icons';
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
  const [selectedProfile, setSelectedProfile] = useState<TravelProfile>('moderate');

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  const [resolvedOrigin, setResolvedOrigin] = useState<ResolvedCity | null>(null);
  const [resolvedDest, setResolvedDest] = useState<ResolvedCity | null>(null);

  const [rawRouteKm, setRawRouteKm] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState('');
  const [hasUrbanMargin, setHasUrbanMargin] = useState(true);
  const [days, setDays] = useState('3');
  const [people, setPeople] = useState('2');

  const [fuelPrice, setFuelPrice] = useState('6.19');
  const [consumptionKmPerL, setConsumptionKmPerL] = useState('11');
  const [autoTollEnabled, setAutoTollEnabled] = useState(false);
  const [tollCost, setTollCost] = useState('0');

  const [hotelNightPrice, setHotelNightPrice] = useState('220');
  const [roomsCount, setRoomsCount] = useState('1');
  const [foodPerPersonPerDay, setFoodPerPersonPerDay] = useState('90');
  const [extraExpenses, setExtraExpenses] = useState('150');

  const [loadingRoute, setLoadingRoute] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);

  const handleSelectProfile = (profile: TravelProfile) => {
    setSelectedProfile(profile);
    if (profile === 'budget') {
      setHotelNightPrice('120');
      setFoodPerPersonPerDay('60');
      setExtraExpenses('80');
    } else if (profile === 'moderate') {
      setHotelNightPrice('220');
      setFoodPerPersonPerDay('90');
      setExtraExpenses('150');
    } else if (profile === 'comfort') {
      setHotelNightPrice('380');
      setFoodPerPersonPerDay('160');
      setExtraExpenses('300');
    }
  };

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
      throw new Error(`Não encontramos "${inputCity}". Indique a sigla do estado (ex: ${inputCity}, PR).`);
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

        const finalKm = hasUrbanMargin ? Math.round(roundTripRaw * 1.12) : roundTripRaw;
        setDistanceKm(String(finalKm));

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

  const toggleUrbanMargin = () => {
    const nextState = !hasUrbanMargin;
    setHasUrbanMargin(nextState);
    if (rawRouteKm !== null) {
      const updatedKm = nextState ? Math.round(rawRouteKm * 1.12) : rawRouteKm;
      setDistanceKm(String(updatedKm));
    }
  };

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
      if (!user) throw new Error('Utilizador não autenticado.');

      const routeDesc = finalOrigName ? `${finalOrigName} -> ${finalDestName}` : finalDestName;
      const profileLabel =
        selectedProfile === 'budget'
          ? 'Mochilão / Económico'
          : selectedProfile === 'comfort'
          ? 'Conforto / Casal'
          : 'Padrão / Moderado';

      const simulationSummary =
        `Simulação: ${routeDesc}\n` +
        `• Perfil: ${profileLabel}\n` +
        `• Duração: ${numDays} dias (${nights} noites) | ${numPeople} pessoa(s)\n` +
        `• Transporte: R$ ${transportTotal.toFixed(2)} (${numDistance} km rodados` +
        (hasUrbanMargin && rawRouteKm ? ` [inclui +12% de margem urbana sobre ${rawRouteKm} km de estrada]` : '') +
        (autoTollEnabled ? ` [inclui R$ ${tollCost} de pedágios estimados]` : '') +
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

      Alert.alert('Sucesso', 'Viagem criada com a meta orçamentada!');
      if (onEventCreated) onEventCreated();
      onClose();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao guardar viagem.');
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
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Estimador de Viagem</Text>
              <Text style={styles.sub}>Planeamento com margem rodoviária e urbana</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Perfis Rápidos */}
            <Text style={styles.fieldLabel}>PERFIL DE VIAGEM</Text>
            <View style={styles.profilesRow}>
              <TouchableOpacity
                style={[
                  styles.profileBtn,
                  selectedProfile === 'budget' && styles.profileBtnActiveBudget,
                ]}
                onPress={() => handleSelectProfile('budget')}
                activeOpacity={0.7}
              >
                <Feather 
                  name="compass" 
                  size={16} 
                  color={selectedProfile === 'budget' ? '#38BDF8' : '#64748B'} 
                  style={{ marginBottom: 4 }} 
                />
                <Text
                  style={[
                    styles.profileBtnText,
                    selectedProfile === 'budget' && styles.profileBtnTextActive,
                  ]}
                >
                  Económico
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
                <Feather 
                  name="home" 
                  size={16} 
                  color={selectedProfile === 'moderate' ? '#F59E0B' : '#64748B'} 
                  style={{ marginBottom: 4 }} 
                />
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
                <Feather 
                  name="award" 
                  size={16} 
                  color={selectedProfile === 'comfort' ? '#10B981' : '#64748B'} 
                  style={{ marginBottom: 4 }} 
                />
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
            <Text style={styles.fieldLabel}>CIDADES & ESTADOS</Text>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Origem (ex: Londrina, PR)"
                  placeholderTextColor="#64748B"
                  value={origin}
                  onChangeText={(text) => {
                    setOrigin(text);
                    setResolvedOrigin(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Destino (ex: Curitiba, PR)"
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
              activeOpacity={0.8}
            >
              {loadingRoute ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="navigation" size={13} color="#10B981" />
                  <Text style={styles.calcDistanceBtnText}>Traçar Rota & Distância Automática</Text>
                </View>
              )}
            </TouchableOpacity>

            {(resolvedOrigin || resolvedDest) && (
              <View style={styles.geoConfirmedBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="map-pin" size={12} color="#34D399" />
                  <Text style={styles.geoConfirmedTitle}>Rota traçada:</Text>
                </View>
                <Text style={styles.geoConfirmedText}>
                  {resolvedOrigin ? resolvedOrigin.fullTitle : origin}
                  {' -> '}
                  {resolvedDest ? resolvedDest.fullTitle : destination}
                </Text>
              </View>
            )}

            {/* Parâmetros Básicos */}
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>KM TOTAL</Text>
                <TextInput
                  style={[styles.input, styles.inputBold]}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>DIAS</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={days}
                  onChangeText={setDays}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>PESSOAS</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={people}
                  onChangeText={setPeople}
                />
              </View>
            </View>

            {/* Checkbox Margem Urbana */}
            <TouchableOpacity
              style={styles.checkboxFeatureRow}
              onPress={toggleUrbanMargin}
              activeOpacity={0.7}
            >
              <View style={[styles.checkboxBox, hasUrbanMargin && styles.checkboxBoxChecked]}>
                {hasUrbanMargin && <Feather name="check" size={11} color="#0B0F19" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkboxFeatureTitle}>
                  Margem Urbana (+12% de Km)
                </Text>
                <Text style={styles.checkboxFeatureSub}>
                  Deslocamento local para passeios, hotel e restaurantes.
                  {rawRouteKm ? ` (Estrada: ${rawRouteKm} km -> Efetivo: ${distanceKm} km)` : ''}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Combustível & Portagens */}
            <Text style={styles.fieldLabel}>COMBUSTÍVEL & PORTAGENS</Text>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabelSmall}>Gasolina (R$/L)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={fuelPrice}
                  onChangeText={setFuelPrice}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabelSmall}>Consumo (Km/L)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={consumptionKmPerL}
                  onChangeText={setConsumptionKmPerL}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabelSmall}>Portagens (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={tollCost}
                  onChangeText={setTollCost}
                />
              </View>
            </View>

            {/* Checkbox Estimativa de Portagem */}
            <TouchableOpacity
              style={styles.checkboxFeatureRow}
              onPress={toggleAutoToll}
              activeOpacity={0.7}
            >
              <View style={[styles.checkboxBox, autoTollEnabled && styles.checkboxBoxChecked]}>
                {autoTollEnabled && <Feather name="check" size={11} color="#0B0F19" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkboxFeatureTitle}>
                  Estimar portagens automaticamente (~R$ 0,14/km)
                </Text>
                <Text style={styles.checkboxFeatureSub}>
                  Média tarifária cobrada nas rodovias concedidas do Brasil.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Alojamento e Alimentação */}
            <Text style={styles.fieldLabel}>HOSPEDAGEM & ALIMENTAÇÃO</Text>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabelSmall}>Diária (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={hotelNightPrice}
                  onChangeText={setHotelNightPrice}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabelSmall}>Qtd. Quartos</Text>
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
                <Text style={styles.fieldLabelSmall}>Refeição/Dia/Pessoa</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={foodPerPersonPerDay}
                  onChangeText={setFoodPerPersonPerDay}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabelSmall}>Extras & Lazer (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={extraExpenses}
                  onChangeText={setExtraExpenses}
                />
              </View>
            </View>

            {/* Painel do Total Estimado */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>DISCRIMINAÇÃO DOS CUSTOS</Text>

              <View style={styles.summaryLine}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="truck" size={12} color="#94A3B8" />
                  <Text style={styles.summaryLineLabel}>
                    Transporte ({numDistance} km):
                  </Text>
                </View>
                <Text style={styles.summaryLineVal}>R$ {transportTotal.toFixed(2)}</Text>
              </View>

              <View style={styles.summaryLine}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="home" size={12} color="#94A3B8" />
                  <Text style={styles.summaryLineLabel}>
                    Hospedagem ({nights} noites):
                  </Text>
                </View>
                <Text style={styles.summaryLineVal}>R$ {hotelTotal.toFixed(2)}</Text>
              </View>

              <View style={styles.summaryLine}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="coffee" size={12} color="#94A3B8" />
                  <Text style={styles.summaryLineLabel}>
                    Alimentação ({numDays} dias p/ {numPeople} pessoas):
                  </Text>
                </View>
                <Text style={styles.summaryLineVal}>R$ {foodTotal.toFixed(2)}</Text>
              </View>

              {numExtra > 0 && (
                <View style={styles.summaryLine}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="tag" size={12} color="#94A3B8" />
                    <Text style={styles.summaryLineLabel}>Extras / Passeios:</Text>
                  </View>
                  <Text style={styles.summaryLineVal}>R$ {numExtra.toFixed(2)}</Text>
                </View>
              )}

              <View style={styles.summaryDivider} />

              <View style={styles.summaryTotalRow}>
                <View>
                  <Text style={styles.totalLabel}>ORÇAMENTO SUGERIDO</Text>
                  <Text style={styles.totalValue}>R$ {grandTotal.toFixed(2)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.perPersonLabel}>Por Pessoa</Text>
                  <Text style={styles.perPersonVal}>R$ {costPerPerson.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* Ações */}
            <TouchableOpacity
              style={styles.saveAsEventBtn}
              onPress={handleCreateAsEvent}
              disabled={savingEvent}
              activeOpacity={0.8}
            >
              {savingEvent ? (
                <ActivityIndicator color="#0B0F19" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="send" size={14} color="#0B0F19" />
                  <Text style={styles.saveAsEventBtnText}>
                    Criar Viagem com essa Meta
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose} activeOpacity={0.7}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
    maxHeight: '94%',
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  sub: {
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
  fieldLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldLabelSmall: {
    color: '#64748B',
    fontSize: 10,
    marginBottom: 4,
  },
  profilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  profileBtn: {
    flex: 1,
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
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
  profileBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  profileBtnTextActive: {
    color: '#F8FAFC',
  },
  profileSubText: {
    color: '#64748B',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#131927',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    fontSize: 13,
  },
  inputBold: {
    fontWeight: '700',
  },
  calcDistanceBtn: {
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  calcDistanceBtnText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  geoConfirmedBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  geoConfirmedTitle: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    backgroundColor: '#0B0F19',
  },
  checkboxBoxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxFeatureTitle: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  checkboxFeatureSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  summaryCard: {
    backgroundColor: '#131927',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  summaryTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLineLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  summaryLineVal: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 10,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  totalValue: {
    color: '#34D399',
    fontSize: 22,
    fontWeight: '800',
  },
  perPersonLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  perPersonVal: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  saveAsEventBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  saveAsEventBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  closeModalBtn: {
    backgroundColor: '#131927',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeModalBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 12,
  },
});