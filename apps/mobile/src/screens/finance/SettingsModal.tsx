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
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { exportFullDataBackup } from '../../services/backupService';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose, onSaved }) => {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [useFixed, setUseFixed] = useState(false);
  const [needsPct, setNeedsPct] = useState('50');
  const [wantsPct, setWantsPct] = useState('30');
  const [savingsPct, setSavingsPct] = useState('20');

  const [fixedNeeds, setFixedNeeds] = useState('0');
  const [fixedWants, setFixedWants] = useState('0');
  const [fixedSavings, setFixedSavings] = useState('0');

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
        Alert.alert('Atenção', `A soma das percentagens deve ser exatamente 100%. (Soma atual: ${total}%)`);
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
      Alert.alert('Sucesso', 'Configurações de orçamento atualizadas!');
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

      Alert.alert('Sucesso', 'Sua senha foi alterada com sucesso!');
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

  const handleConfirmLogout = () => {
    Alert.alert(
      'Encerrar Sessão',
      'Tem a certeza de que deseja sair da sua conta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair da Conta',
          style: 'destructive',
          onPress: async () => {
            onClose();
            await signOut();
          },
        },
      ]
    );
  };

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
              <Text style={styles.title}>Ajustes & Conta</Text>
              <Text style={styles.subTitle}>Parâmetros orçamentários e segurança</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#10B981" style={{ marginVertical: 32 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* SEÇÃO 1: METAS ORÇAMENTÁRIAS */}
              <View style={styles.sectionHeaderRow}>
                <Feather name="target" size={13} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.sectionHeaderTitle}>METAS & TETOS DE GASTOS</Text>
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>Definir limites em R$ fixos</Text>
                  <Text style={styles.switchSubtitle}>
                    {useFixed
                      ? 'Metas mensais com teto estipulado em Reais.'
                      : 'Metas calculadas proporcionalmente à sua renda (50/30/20).'}
                  </Text>
                </View>
                <Switch
                  value={useFixed}
                  onValueChange={setUseFixed}
                  trackColor={{ false: '#1E293B', true: '#10B981' }}
                  thumbColor="#F8FAFC"
                />
              </View>

              {!useFixed ? (
                <View style={styles.formSection}>
                  <Text style={styles.sectionSubtitle}>
                    Distribuição percentual (A soma deve totalizar 100%):
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
                  <Text style={styles.sectionSubtitle}>Valores máximos estipulados para o mês:</Text>

                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: '#38BDF8' }]}>Teto de Necessidades (R$)</Text>
                    <TextInput
                      style={[styles.input, styles.inputBold]}
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
                      style={[styles.input, styles.inputBold]}
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
                      style={[styles.input, styles.inputBold]}
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
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar Metas Orçamentárias'}</Text>
              </TouchableOpacity>

              {/* SEÇÃO 2: SEGURANÇA DA CONTA */}
              <View style={styles.divider} />
              <View style={styles.sectionHeaderRow}>
                <Feather name="shield" size={13} color="#38BDF8" style={{ marginRight: 6 }} />
                <Text style={styles.sectionHeaderTitle}>SEGURANÇA DA CONTA</Text>
              </View>
              <Text style={styles.sectionSubtitle}>Altere a senha de acesso à aplicação</Text>

              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Nova senha (mín. 6 caracteres)"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity
                  style={[styles.btnActionSecondary, updatingPassword && { opacity: 0.7 }]}
                  onPress={handleUpdatePassword}
                  disabled={updatingPassword}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnActionSecondaryText}>
                    {updatingPassword ? '...' : 'Atualizar'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* SEÇÃO 3: CÓPIA DE SEGURANÇA */}
              <View style={styles.divider} />
              <View style={styles.sectionHeaderRow}>
                <Feather name="database" size={13} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.sectionHeaderTitle}>BACKUP INTEGRAL</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Gera e descarrega um arquivo .xlsx com todos os dados da sua base de dados
              </Text>

              <TouchableOpacity
                style={[styles.backupBtn, generatingBackup && { opacity: 0.7 }]}
                onPress={handleBackup}
                disabled={generatingBackup}
                activeOpacity={0.8}
              >
                <Feather name="download" size={14} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.backupBtnText}>
                  {generatingBackup ? 'Gerando Planilha...' : 'Gerar Backup Completo (.xlsx)'}
                </Text>
              </TouchableOpacity>

              {/* SEÇÃO 4: SESSÃO & CONTA (LOGOUT SEGURO) */}
              <View style={styles.divider} />
              <View style={styles.sectionHeaderRow}>
                <Feather name="user-x" size={13} color="#F87171" style={{ marginRight: 6 }} />
                <Text style={styles.sectionHeaderTitle}>SESSÃO & CONTA</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Encerrar a sua sessão neste telemóvel ({user?.email})
              </Text>

              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleConfirmLogout}
                activeOpacity={0.8}
              >
                <Feather name="log-out" size={14} color="#F87171" style={{ marginRight: 6 }} />
                <Text style={styles.logoutBtnText}>Terminar Sessão</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
    maxHeight: '90%',
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
  subTitle: {
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 4,
  },
  sectionHeaderTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131927',
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  switchTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  switchSubtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  formSection: {
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 10,
  },
  inputGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 14,
  },
  inputBold: {
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  passwordRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  btnActionSecondary: {
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnActionSecondaryText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 12,
  },
  backupBtn: {
    flexDirection: 'row',
    backgroundColor: '#131927',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  backupBtnText: {
    color: '#10B981',
    fontWeight: '800',
    fontSize: 13,
  },
  logoutBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  logoutBtnText: {
    color: '#F87171',
    fontWeight: '800',
    fontSize: 13,
  },
});