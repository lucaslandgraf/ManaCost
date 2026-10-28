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
import { exportFullDataBackup } from '../../services/backupService';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose, onSaved }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estados dos limites orçamentários
  const [useFixed, setUseFixed] = useState(false);
  const [needsPct, setNeedsPct] = useState('50');
  const [wantsPct, setWantsPct] = useState('30');
  const [savingsPct, setSavingsPct] = useState('20');

  const [fixedNeeds, setFixedNeeds] = useState('0');
  const [fixedWants, setFixedWants] = useState('0');
  const [fixedSavings, setFixedSavings] = useState('0');

  // Estados de Segurança e Backup
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [generatingBackup, setGeneratingBackup] = useState(false);

  useEffect(() => {
    if (visible && user) {
      loadProfileSettings();
      setNewPassword('');
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

  const handleUpdatePassword = async () => {
    if (newPassword.trim().length < 6) {
      Alert.alert('Atenção', 'A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (error) throw error;

      Alert.alert('Sucesso 🎉', 'Sua senha foi alterada com sucesso!');
      setNewPassword('');
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar senha.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleBackup = async () => {
    if (!user?.id) return;
    setGeneratingBackup(true);
    try {
      await exportFullDataBackup(user.id);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao gerar cópia de segurança.');
    } finally {
      setGeneratingBackup(false);
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
            <Text style={styles.title}>Configurações & Preferências</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#38BDF8" style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* SEÇÃO 1: METAS ORÇAMENTÁRIAS */}
              <Text style={styles.sectionHeaderTitle}>🎯 Metas & Tetos de Gastos</Text>

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

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar Metas Orçamentárias'}</Text>
              </TouchableOpacity>

              {/* SEÇÃO 2: SEGURANÇA DA CONTA */}
              <View style={styles.divider} />
              <Text style={styles.sectionHeaderTitle}>🔒 Segurança da Conta</Text>
              <Text style={styles.sectionSubtitle}>Altere a senha provisória para sua senha definitiva</Text>

              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Nova senha (mín. 6 dígitos)"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity
                  style={[styles.btnActionSecondary, updatingPassword && { opacity: 0.7 }]}
                  onPress={handleUpdatePassword}
                  disabled={updatingPassword}
                >
                  <Text style={styles.btnActionSecondaryText}>
                    {updatingPassword ? '...' : 'Atualizar'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SEÇÃO 3: CÓPIA DE SEGURANÇA */}
              <View style={styles.divider} />
              <Text style={styles.sectionHeaderTitle}>📦 Exportação & Cópia de Segurança</Text>
              <Text style={styles.sectionSubtitle}>
                Baixe uma planilha consolidada com todos os lançamentos, contas a pagar e eventos
              </Text>

              <TouchableOpacity
                style={[styles.backupBtn, generatingBackup && { opacity: 0.7 }]}
                onPress={handleBackup}
                disabled={generatingBackup}
              >
                <Text style={styles.backupBtnText}>
                  {generatingBackup ? 'Gerando Planilha...' : '📊 Gerar Backup Completo (.xlsx)'}
                </Text>
              </TouchableOpacity>
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
    maxHeight: '90%',
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
  sectionHeaderTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 18,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
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
    marginBottom: 12,
  },
  sectionSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 10,
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
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  btnActionSecondary: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnActionSecondaryText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 13,
  },
  backupBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  backupBtnText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 13,
  },
});