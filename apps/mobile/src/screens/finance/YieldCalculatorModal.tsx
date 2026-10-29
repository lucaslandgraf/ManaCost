import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

interface InstitutionPreset {
  id: string;
  name: string;
  cdiPct: number;
  hasIof: boolean;
  hasFgc: boolean;
  typeBadge: string;
}

const INSTITUTIONS: InstitutionPreset[] = [
  { id: 'nubank', name: 'Nubank (Caixinha)', cdiPct: 100, hasIof: true, hasFgc: true, typeBadge: 'RDB 100%' },
  { id: 'mercadopago', name: 'Mercado Pago', cdiPct: 105, hasIof: false, hasFgc: false, typeBadge: 'Conta 105%' },
  { id: 'sofisa', name: 'Sofisa Direto', cdiPct: 110, hasIof: true, hasFgc: true, typeBadge: 'CDB 110%' },
  { id: 'picpay', name: 'PicPay (Cofrinho)', cdiPct: 102, hasIof: true, hasFgc: true, typeBadge: 'CDB 102%' },
  { id: 'inter', name: 'Banco Inter', cdiPct: 100, hasIof: true, hasFgc: true, typeBadge: 'CDB 100%' },
  { id: 'c6', name: 'C6 Bank', cdiPct: 100, hasIof: true, hasFgc: true, typeBadge: 'CDB 100%' },
  { id: 'pagbank', name: 'PagBank', cdiPct: 105, hasIof: true, hasFgc: true, typeBadge: 'CDB 105%' },
];

const PRESET_DAYS = [
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '30 dias', days: 30 },
  { label: '6 meses', days: 180 },
  { label: '1 ano', days: 360 },
  { label: '2 anos', days: 720 },
];

const IOF_RATES = [
  0.96, 0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70, 0.66,
  0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36, 0.33,
  0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03,
];

interface YieldCalculatorModalProps {
  visible: boolean;
  onClose: () => void;
  initialAmount?: number;
}

export const YieldCalculatorModal: React.FC<YieldCalculatorModalProps> = ({
  visible,
  onClose,
  initialAmount = 1000,
}) => {
  const [selectedInstId, setSelectedInstId] = useState<string>('nubank');
  const [amountStr, setAmountStr] = useState(String(initialAmount || 1000));
  const [cdiPctStr, setCdiPctStr] = useState('100');
  const [baseDiRateStr, setBaseDiRateStr] = useState('10.50');
  const [daysStr, setDaysStr] = useState('30');
  const [loadingRate, setLoadingRate] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const fetchCurrentDiRate = async () => {
      try {
        setLoadingRate(true);
        const response = await fetch(
          'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json'
        );
        const data = await response.json();
        if (Array.isArray(data) && data[0]?.valor) {
          const currentRate = parseFloat(String(data[0].valor).replace(',', '.'));
          if (!isNaN(currentRate) && currentRate > 0) {
            setBaseDiRateStr(currentRate.toFixed(2));
          }
        }
      } catch (err) {
        console.warn('Não foi possível obter a taxa DI do BCB, mantendo padrão:', err);
      } finally {
        setLoadingRate(false);
      }
    };

    fetchCurrentDiRate();
  }, [visible]);

  const selectedInst = INSTITUTIONS.find((i) => i.id === selectedInstId) || INSTITUTIONS[0];

  const handleSelectInstitution = (inst: InstitutionPreset) => {
    setSelectedInstId(inst.id);
    setCdiPctStr(String(inst.cdiPct));
  };

  const principal = Math.max(0, parseFloat(amountStr.replace(',', '.')) || 0);
  const cdiPct = Math.max(0, parseFloat(cdiPctStr.replace(',', '.')) || 0);
  const baseDiRate = Math.max(0, parseFloat(baseDiRateStr.replace(',', '.')) || 0);
  const days = Math.max(1, parseInt(daysStr, 10) || 1);

  const iofTaxRate = useMemo(() => {
    if (!selectedInst.hasIof) return 0;
    if (days >= 30) return 0;
    return IOF_RATES[days - 1] ?? 0;
  }, [days, selectedInst]);

  const irTaxRate = useMemo(() => {
    if (days <= 180) return 0.225;
    if (days <= 360) return 0.20;
    if (days <= 720) return 0.175;
    return 0.15;
  }, [days]);

  const businessDays = days <= 1 ? 1 : Math.max(1, Math.round(days * (252 / 365)));
  const effectiveAnnualGrossRate = (baseDiRate / 100) * (cdiPct / 100);

  const grossFactor = Math.pow(1 + effectiveAnnualGrossRate, businessDays / 252) - 1;
  const grossProfit = principal * grossFactor;

  const iofAmount = grossProfit * iofTaxRate;
  const profitAfterIof = grossProfit - iofAmount;

  const irAmount = profitAfterIof * irTaxRate;
  const netProfit = profitAfterIof - irAmount;
  const finalTotalAmount = principal + netProfit;
  const netPercentage = principal > 0 ? (netProfit / principal) * 100 : 0;

  const yearsFraction = days / 365;
  const savingsAnnualRate = 0.0617;
  const savingsFactor = Math.pow(1 + savingsAnnualRate, yearsFraction) - 1;
  const savingsProfit = principal * savingsFactor;

  const diffProfit = netProfit - savingsProfit;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.dragHandleBox}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Simulador de Rendimentos</Text>
              <Text style={styles.subtitle}>Renda Fixa & Bancos Digitais vs. Poupança</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Seletor de Bancos */}
            <Text style={styles.fieldLabel}>INSTITUIÇÃO FINANCEIRA</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.instChipsContainer}
            >
              {INSTITUTIONS.map((inst) => {
                const isActive = inst.id === selectedInstId;
                return (
                  <TouchableOpacity
                    key={inst.id}
                    style={[styles.instChip, isActive && styles.instChipActive]}
                    onPress={() => handleSelectInstitution(inst)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.instChipTitle, isActive && styles.instChipTitleActive]}>
                      {inst.name}
                    </Text>
                    <View style={styles.instBadgeRow}>
                      <Text style={[styles.instChipBadge, isActive && styles.instChipBadgeActive]}>
                        {inst.typeBadge}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Feather
                          name={inst.hasFgc ? 'shield' : 'lock'}
                          size={9}
                          color={inst.hasFgc ? '#34D399' : '#FBBF24'}
                        />
                        <Text style={{ fontSize: 9, color: inst.hasFgc ? '#34D399' : '#FBBF24', fontWeight: '700' }}>
                          {inst.hasFgc ? 'FGC' : 'Títulos'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Inputs de Parâmetros */}
            <View style={styles.row}>
              <View style={{ flex: 1.2, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>APORTE (R$)</Text>
                <TextInput
                  style={[styles.input, styles.inputBold]}
                  keyboardType="numeric"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  placeholder="1000.00"
                  placeholderTextColor="#64748B"
                />
              </View>

              <View style={{ flex: 0.9, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>% DO CDI</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={cdiPctStr}
                  onChangeText={setCdiPctStr}
                  placeholder="100"
                  placeholderTextColor="#64748B"
                />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  <Text style={styles.fieldLabelInline}>TAXA DI (%)</Text>
                  {loadingRate ? (
                    <ActivityIndicator size={9} color="#38BDF8" />
                  ) : (
                    <View style={styles.bcbPill}>
                      <Text style={styles.bcbPillText}>BCB</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={baseDiRateStr}
                  onChangeText={setBaseDiRateStr}
                  placeholder="10.50"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            {/* Período da Aplicação */}
            <View style={styles.periodSection}>
              <Text style={styles.fieldLabel}>PRAZO DA APLICAÇÃO</Text>

              <View style={styles.customDaysContainer}>
                <TextInput
                  style={styles.customDaysInput}
                  keyboardType="numeric"
                  value={daysStr}
                  onChangeText={setDaysStr}
                  placeholder="30"
                  placeholderTextColor="#64748B"
                />
                <Text style={styles.customDaysUnit}>dias corridos (~{businessDays} úteis)</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {PRESET_DAYS.map((preset) => {
                  const isActive = days === preset.days;
                  return (
                    <TouchableOpacity
                      key={preset.days}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setDaysStr(String(preset.days))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Card Principal de Resultado Líquido */}
            <View style={styles.resultCard}>
              <View style={styles.resultCardHeader}>
                <Text style={styles.resultTitle}>
                  {selectedInst.name} • {days} dias
                </Text>
                
                <View style={[styles.fgcBadge, selectedInst.hasFgc ? styles.fgcBadgeOn : styles.fgcBadgeOff]}>
                  <Feather
                    name={selectedInst.hasFgc ? 'shield' : 'lock'}
                    size={9}
                    color={selectedInst.hasFgc ? '#34D399' : '#FBBF24'}
                    style={{ marginRight: 3 }}
                  />
                  <Text style={[styles.fgcBadgeText, selectedInst.hasFgc ? styles.fgcBadgeTextOn : styles.fgcBadgeTextOff]}>
                    {selectedInst.hasFgc ? 'Garantia FGC' : 'Títulos Federais'}
                  </Text>
                </View>
              </View>

              <Text style={styles.finalTotal}>
                R$ {finalTotalAmount.toFixed(2).replace('.', ',')}
              </Text>
              <Text style={styles.profitBadge}>
                Lucro Líquido: + R$ {netProfit.toFixed(2).replace('.', ',')} ({netPercentage.toFixed(2)}%)
              </Text>

              <View style={styles.divider} />

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Rendimento Bruto</Text>
                <Text style={styles.breakdownVal}>+ R$ {grossProfit.toFixed(2).replace('.', ',')}</Text>
              </View>

              <View style={styles.breakdownRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.breakdownLabel}>IOF</Text>
                  <View style={[styles.taxBadge, iofTaxRate === 0 && styles.taxBadgeZero]}>
                    <Text style={[styles.taxBadgeText, iofTaxRate === 0 && styles.taxBadgeTextZero]}>
                      {(iofTaxRate * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
                <Text style={[styles.breakdownVal, { color: iofAmount > 0 ? '#F87171' : '#64748B' }]}>
                  {iofAmount > 0 ? `- R$ ${iofAmount.toFixed(2).replace('.', ',')}` : 'R$ 0,00'}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.breakdownLabel}>Imposto de Renda (IR)</Text>
                  <View style={styles.taxBadge}>
                    <Text style={styles.taxBadgeText}>{(irTaxRate * 100).toFixed(1)}%</Text>
                  </View>
                </View>
                <Text style={[styles.breakdownVal, { color: '#F87171' }]}>
                  - R$ {irAmount.toFixed(2).replace('.', ',')}
                </Text>
              </View>

              {days < 30 && selectedInst.hasIof && (
                <View style={styles.warningIofBox}>
                  <Feather name="alert-circle" size={12} color="#F87171" style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={styles.warningIofText}>
                    Resgatar antes de 30 dias deduz IOF regressivo. Faltam {30 - days} dias para o imposto zerar.
                  </Text>
                </View>
              )}

              {!selectedInst.hasFgc && (
                <View style={styles.infoBox}>
                  <Feather name="info" size={12} color="#38BDF8" style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={styles.infoBoxText}>
                    Conta de pagamento: o saldo não conta com o FGC, mas fica aplicado em títulos públicos federais com custódia no Banco Central.
                  </Text>
                </View>
              )}
            </View>

            {/* Comparativo com a Poupança */}
            <View style={styles.savingsCard}>
              <View style={styles.savingsHeader}>
                <Text style={styles.savingsTitle}>Comparativo com a Poupança</Text>
                <Text style={styles.savingsSubtitle}>Mesmo prazo ({days} dias)</Text>
              </View>

              <View style={styles.savingsRow}>
                <Text style={styles.savingsLabel}>Poupança Comum (Isenta):</Text>
                <Text style={styles.savingsVal}>+ R$ {savingsProfit.toFixed(2).replace('.', ',')}</Text>
              </View>

              <View style={styles.savingsRow}>
                <Text style={styles.savingsLabel}>No {selectedInst.name} (Líquido):</Text>
                <Text style={[styles.savingsVal, { color: '#34D399' }]}>
                  + R$ {netProfit.toFixed(2).replace('.', ',')}
                </Text>
              </View>

              <View style={styles.diffBox}>
                <Feather name="trending-up" size={13} color="#FBBF24" style={{ marginRight: 6, marginTop: 2 }} />
                <Text style={styles.diffText}>
                  {diffProfit >= 0
                    ? `No ${selectedInst.name} rende R$ ${diffProfit.toFixed(2).replace('.', ',')} a mais do que na poupança tradicional.`
                    : `Devido ao IOF regressivo inicial nos primeiros ${days} dias, a poupança rendeu R$ ${Math.abs(diffProfit).toFixed(2).replace('.', ',')} a mais.`}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeButtonText}>Fechar Simulação</Text>
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
  modalContent: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
    maxHeight: '92%',
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
  subtitle: {
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
  fieldLabelInline: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  bcbPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bcbPillText: {
    color: '#10B981',
    fontSize: 8,
    fontWeight: '800',
  },
  instChipsContainer: {
    gap: 8,
    paddingBottom: 12,
  },
  instChip: {
    backgroundColor: '#131927',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  instChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  instChipTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  instChipTitleActive: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  instBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 3,
  },
  instChipBadge: {
    color: '#64748B',
    fontSize: 10,
  },
  instChipBadgeActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#131927',
    color: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  inputBold: {
    fontWeight: '700',
  },
  periodSection: {
    marginBottom: 12,
  },
  customDaysContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  customDaysInput: {
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
    width: 80,
    textAlign: 'center',
  },
  customDaysUnit: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  chipsScroll: {
    gap: 6,
    paddingVertical: 2,
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
  resultCard: {
    backgroundColor: '#131927',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 12,
  },
  resultCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  fgcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fgcBadgeOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  fgcBadgeOff: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  fgcBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  fgcBadgeTextOn: {
    color: '#34D399',
  },
  fgcBadgeTextOff: {
    color: '#FBBF24',
  },
  finalTotal: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 6,
  },
  profitBadge: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  breakdownVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  taxBadge: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  taxBadgeText: {
    color: '#F87171',
    fontSize: 9,
    fontWeight: '700',
  },
  taxBadgeZero: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  taxBadgeTextZero: {
    color: '#34D399',
  },
  warningIofBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },
  warningIofText: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 11,
    lineHeight: 15,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  infoBoxText: {
    flex: 1,
    color: '#7DD3FC',
    fontSize: 11,
    lineHeight: 15,
  },
  savingsCard: {
    backgroundColor: '#131927',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 14,
  },
  savingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  savingsTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  savingsSubtitle: {
    color: '#64748B',
    fontSize: 11,
  },
  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  savingsLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  savingsVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  diffBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  diffText: {
    flex: 1,
    color: '#FBBF24',
    fontSize: 11,
    lineHeight: 15,
  },
  closeButton: {
    backgroundColor: '#131927',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeButtonText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
});