import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose, onSaved }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estados dos limites
  const [useFixed, setUseFixed] = useState(false);
  const [needsPct, setNeedsPct] = useState('50');
  const [wantsPct, setWantsPct] = useState('30');
  const [savingsPct, setSavingsPct] = useState('20');

  const [fixedNeeds, setFixedNeeds] = useState('0');
  const [fixedWants, setFixedWants] = useState('0');
  const [fixedSavings, setFixedSavings] = useState('0');

  useEffect(() => {
    if (visible && user) {
      loadProfileSettings();
    }
  }, [visible, user]);

  const loadProfileSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('rule_needs_pct, rule_wants_pct, rule_savings_pct, use_fixed_targets, fixed_needs_val, fixed_wants_val, fixed_savings_val')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setUseFixed(Boolean(data.use_fixed_targets));
        setNeedsPct(String(data.rule_needs_pct ?? 50));
        setWantsPct(String(data.rule_wants_pct ?? 30));
        setSavingsPct(String(data.rule_savings_pct ?? 20));

        setFixedNeeds(String(data.fixed_needs_val ?? 0));
        setFixedWants(String(data.fixed_wants_val ?? 0));
        setFixedSavings(String(data.fixed_savings_val ?? 0));
      }
    } catch (err: any) {
      console.warn('Erro ao carregar configurações de teto:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!useFixed) {
      const n = Number(needsPct) || 0;
      const w = Number(wantsPct) || 0;
      const s = Number(savingsPct) || 0;
      const total = n + w + s;

      if (total !== 100) {
        Alert.alert('Atenção', `A soma das porcentagens deve ser exatamente 100%. (Soma atual: ${total}%)`);
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user?.id,
          use_fixed_targets: useFixed,
          rule_needs_pct: Number(needsPct) || 0,
          rule_wants_pct: Number(wantsPct) || 0,
          rule_savings_pct: Number(savingsPct) || 0,
          fixed_needs_val: Number(fixedNeeds) || 0,
          fixed_wants_val: Number(fixedWants) || 0,
          fixed_savings_val: Number(fixedSavings) || 0,
        })
        .select();

      if (error) throw error;

      onSaved();
      onClose();
      Alert.alert('Sucesso', 'Configurações de teto atualizadas!');
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Configurar Metas de Gastos</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Modo de Cálculo: Porcentagem ou R$ Fixo */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>Definir limites em R$ fixos</Text>
                  <Text style={styles.switchSubtitle}>
                    {useFixed
                      ? 'Metas mensais com valor estipulado em Reais.'
                      : 'Metas calculadas proporcionalmente à sua renda.'}
                  </Text>
                </View>
                <Switch
                  value={useFixed}
                  onValueChange={setUseFixed}
                  trackColor={{ false: '#334155', true: '#10B981' }}
                  thumbColor="#F8FAFC"
                />
              </View>

              {!useFixed ? (
                /* Formulário Proporcional (%) */
                <View style={styles.formSection}>
                  <Text style={styles.sectionSubtitle}>
                    Distribuição da Regra Orçamentária (Total: 100%)
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#38BDF8' }]}>Necessidades (%)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={needsPct}
                      onChangeText={setNeedsPct}
                      placeholder="50"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#F59E0B' }]}>Desejos & Lazer (%)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={wantsPct}
                      onChangeText={setWantsPct}
                      placeholder="30"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#10B981' }]}>Reserva & Investimentos (%)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={savingsPct}
                      onChangeText={setSavingsPct}
                      placeholder="20"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>
              ) : (
                /* Formulário em R$ Fixo */
                <View style={styles.formSection}>
                  <Text style={styles.sectionSubtitle}>Valores Máximos Fixados no Mês</Text>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#38BDF8' }]}>Teto de Necessidades (R$)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={fixedNeeds}
                      onChangeText={setFixedNeeds}
                      placeholder="800.00"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#F59E0B' }]}>Teto de Desejos (R$)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={fixedWants}
                      onChangeText={setFixedWants}
                      placeholder="400.00"
                      placeholderTextColor="#64748B"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#10B981' }]}>Meta de Reserva (R$)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={fixedSavings}
                      onChangeText={setFixedSavings}
                      placeholder="300.00"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>
              )}

              {/* Botões */}
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar Metas'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  switchTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  switchSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  formSection: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 15,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 14,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});