import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

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
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Simulador & Comparador de Renda Fixa</Text>
              <Text style={styles.subtitle}>Bancos Digitais vs. Poupança</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Seletor de Bancos */}
            <Text style={styles.label}>Escolha a Instituição:</Text>
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
                  >
                    <Text style={[styles.instChipTitle, isActive && styles.instChipTitleActive]}>
                      {inst.name}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 2 }}>
                      <Text style={[styles.instChipBadge, isActive && styles.instChipBadgeActive]}>
                        {inst.typeBadge}
                      </Text>
                      <Text style={{ fontSize: 9, color: inst.hasFgc ? '#34D399' : '#FBBF24' }}>
                        {inst.hasFgc ? '🛡️ FGC' : '🏛️ Segregado'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Inputs de Parâmetros */}
            <View style={styles.row}>
              <View style={{ flex: 1.2, marginRight: 8 }}>
                <Text style={styles.label}>Valor (R$)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  placeholder="1000.00"
                  placeholderTextColor="#64748B"
                />
              </View>

              <View style={{ flex: 0.9, marginRight: 8 }}>
                <Text style={styles.label}>% do CDI</Text>
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
                <Text style={styles.label}>
                  Taxa DI {loadingRate ? '⏳' : '🟢 BCB'} (%)
                </Text>
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

            {/* Seleção do Período */}
            <View style={styles.periodSection}>
              <Text style={styles.label}>Período da Aplicação:</Text>

              <View style={styles.customDaysContainer}>
                <TextInput
                  style={styles.customDaysInput}
                  keyboardType="numeric"
                  value={daysStr}
                  onChangeText={setDaysStr}
                  placeholder="30"
                  placeholderTextColor="#64748B"
                />
                <Text style={styles.customDaysUnit}>dias corridos</Text>
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
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Painel do Resultado Consolidado */}
            <View style={styles.resultCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.resultTitle}>
                  {selectedInst.name} • {days} dias
                </Text>
                
                {/* Badge de Garantia do FGC */}
                <View style={[styles.fgcBadge, selectedInst.hasFgc ? styles.fgcBadgeOn : styles.fgcBadgeOff]}>
                  <Text style={[styles.fgcBadgeText, selectedInst.hasFgc ? styles.fgcBadgeTextOn : styles.fgcBadgeTextOff]}>
                    {selectedInst.hasFgc ? '🛡️ Garantia FGC (até R$ 250k)' : '🏛️ Sem FGC (Títulos Públicos)'}
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
                <Text style={[styles.breakdownVal, { color: iofAmount > 0 ? '#EF4444' : '#94A3B8' }]}>
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
                <Text style={[styles.breakdownVal, { color: '#EF4444' }]}>
                  - R$ {irAmount.toFixed(2).replace('.', ',')}
                </Text>
              </View>

              {days < 30 && selectedInst.hasIof && (
                <View style={styles.warningIofBox}>
                  <Text style={styles.warningIofText}>
                    ⚠️ No {selectedInst.name}, resgatar antes de 30 dias desconta IOF regressivo. Faltam {30 - days} dias para o imposto zerar.
                  </Text>
                </View>
              )}

              {!selectedInst.hasFgc && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    ℹ️ Conta de pagamento: o saldo não conta com o FGC, mas fica investido obrigatoriamente pelo Mercado Pago em títulos públicos federais protegidos pelo Banco Central.
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
                <Text style={[styles.savingsVal, { color: '#10B981' }]}>
                  + R$ {netProfit.toFixed(2).replace('.', ',')}
                </Text>
              </View>

              <View style={styles.diffBox}>
                <Text style={styles.diffText}>
                  {diffProfit >= 0
                    ? `💡 No ${selectedInst.name} rende R$ ${diffProfit.toFixed(2).replace('.', ',')} A MAIS do que na poupança.`
                    : `⚠️ Devido ao IOF regressivo nos primeiros ${days} dias, a poupança rendeu R$ ${Math.abs(diffProfit).toFixed(2).replace('.', ',')} a mais.`}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 6,
    fontWeight: '500',
  },
  instChipsContainer: {
    gap: 8,
    paddingBottom: 12,
  },
  instChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  instChipActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.25)',
    borderColor: '#38BDF8',
  },
  instChipTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  instChipTitleActive: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  instChipBadge: {
    color: '#64748B',
    fontSize: 10,
  },
  instChipBadgeActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  periodSection: {
    marginBottom: 14,
  },
  customDaysContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  customDaysInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    width: 90,
    textAlign: 'center',
  },
  customDaysUnit: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  chipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  resultCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  resultTitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  fgcBadge: {
    paddingHorizontal: 7,
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
    fontSize: 10,
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
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 4,
  },
  profitBadge: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
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
    fontSize: 13,
    fontWeight: '600',
  },
  taxBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taxBadgeText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: 'bold',
  },
  taxBadgeZero: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  taxBadgeTextZero: {
    color: '#34D399',
  },
  warningIofBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  warningIofText: {
    color: '#FCA5A5',
    fontSize: 11,
    lineHeight: 15,
  },
  infoBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  infoBoxText: {
    color: '#7DD3FC',
    fontSize: 11,
    lineHeight: 15,
  },
  savingsCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  savingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  savingsTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
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
    fontSize: 12,
  },
  savingsVal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  diffBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  diffText: {
    color: '#FBBF24',
    fontSize: 11,
    lineHeight: 16,
  },
  closeButton: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  closeButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 13,
  },
});