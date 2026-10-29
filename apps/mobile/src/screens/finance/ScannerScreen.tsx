import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  eventId?: string;
}

export const ScannerScreen: React.FC<Props> = ({ visible, onClose, onSuccess, eventId }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manualKeyModal, setManualKeyModal] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const permissionGranted = permission?.granted;

  useEffect(() => {
    if (visible && permissionGranted === false) {
      requestPermission();
    }
  }, [visible, permissionGranted, requestPermission]);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  if (!visible) return null;

  const processReceipt = async (qrData: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-nfce', {
        body: { 
          raw_data: qrData, 
          user_id: user?.id,
          event_id: eventId || null
        },
      });

      if (error) {
        let responseBody: { already_registered?: boolean; error?: string; message?: string } | null = null;

        if (error instanceof FunctionsHttpError) {
          try {
            responseBody = await error.context.json();
          } catch {
            responseBody = null;
          }
        }

        if (responseBody?.already_registered) {
          Alert.alert(
            'Nota já registrada!',
            responseBody.message || 'Esta nota fiscal já consta no sistema.'
          );
        } else {
          Alert.alert(
            'Erro ao processar nota',
            responseBody?.error || error.message
          );
        }
      } else if (data?.already_registered) {
        Alert.alert(
          'Nota já registrada!',
          data.message || 'Esta nota fiscal já consta no sistema.'
        );
      } else if (!data?.success) {
        Alert.alert('Erro ao processar nota', data?.error || 'O servidor não confirmou a importação.');
      } else {
        const storeName = data?.store_name ?? 'Mercado';
        const totalAmount = Number(data?.total_amount ?? 0);

        if (eventId && user) {
          await supabase.from('event_expenses').insert([
            {
              event_id: eventId,
              user_id: user.id,
              description: `NFC-e: ${storeName}`,
              amount: totalAmount,
              category: 'Alimentação',
              expense_date: new Date().toISOString().split('T')[0],
            },
          ]);
        }

        Alert.alert(
          'Sucesso',
          `Compra em ${storeName} no valor de R$ ${totalAmount.toFixed(2)} importada!`,
          [
            {
              text: 'OK',
              onPress: async () => {
                await onSuccess();
                onClose();
              },
            },
          ]
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na comunicação com o servidor.';
      Alert.alert('Falha na comunicação', message);
    } finally {
      setLoading(false);
      setScanned(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    processReceipt(data);
  };

  const handleManualSubmit = () => {
    const cleanKey = accessKey.replace(/\D/g, '');
    if (cleanKey.length !== 44) {
      Alert.alert('Chave inválida', 'A chave de acesso deve conter exatamente 44 dígitos.');
      return;
    }
    setManualKeyModal(false);
    processReceipt(cleanKey);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {permission === null ? (
          <View style={styles.permissionContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.permissionText}>A verificar permissões de câmara...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionEmoji}>📷</Text>
            <Text style={styles.permissionTitle}>Permissão de Câmara Necessária</Text>
            <Text style={styles.permissionText}>
              O leitor do ManaCost necessita da câmara para ler o QR Code da Nota Fiscal da SEFAZ.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
              <Text style={styles.permissionBtnText}>Permitir Câmara</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelTextBtn} onPress={onClose}>
              <Text style={styles.cancelLink}>Voltar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            <View style={styles.overlay}>
              {/* Top Bar com Botão Fechar */}
              <View style={styles.header}>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={styles.closeBtnText}>✕ Fechar</Text>
                </TouchableOpacity>
              </View>

              {/* Mira Central de Foco */}
              <View style={styles.targetFrame}>
                <View style={styles.scanTarget}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>

                <View style={styles.hintPill}>
                  <Text style={styles.hintText}>Aponte para o QR Code da NFC-e</Text>
                </View>

                <View style={styles.warningCard}>
                  <Text style={styles.warningTitle}>🇧🇷 NFC-e Nacional (SEFAZ)</Text>
                  <Text style={styles.warningSub}>
                    Compatível com cupões fiscais do Paraná e restante território nacional.
                  </Text>
                </View>
              </View>

              {/* Rodapé: Entrada Manual da Chave */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.manualBtn}
                  onPress={() => setManualKeyModal(true)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.manualBtnIcon}>⌨️</Text>
                  <Text style={styles.manualBtnText}>Digitar chave de 44 dígitos</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>A processar nota fiscal na SEFAZ...</Text>
          </View>
        )}

        {/* Modal de Contingência Manual */}
        <Modal visible={manualKeyModal} transparent animationType="fade" statusBarTranslucent={true}>
          <View style={styles.modalBackdrop}>
            <View style={styles.manualCard}>
              <Text style={styles.modalTitle}>Chave de Acesso (44 dígitos)</Text>
              <Text style={styles.modalSubtitle}>Localizada logo abaixo do código de barras da nota</Text>
              <TextInput
                placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                maxLength={54}
                value={accessKey}
                onChangeText={setAccessKey}
                style={styles.modalInput}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setManualKeyModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleManualSubmit}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalConfirmText}>Consultar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 50,
    paddingBottom: Platform.OS === 'android' ? 36 : 48,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  header: {
    alignItems: 'flex-end',
  },
  closeBtn: {
    backgroundColor: 'rgba(11, 15, 25, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  targetFrame: {
    alignItems: 'center',
  },
  scanTarget: {
    width: 250,
    height: 250,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#10B981',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 10,
  },
  hintPill: {
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  hintText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  warningCard: {
    marginTop: 14,
    backgroundColor: 'rgba(11, 15, 25, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: 290,
    alignItems: 'center',
  },
  warningTitle: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 11,
    marginBottom: 2,
  },
  warningSub: {
    color: '#94A3B8',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
  },
  footer: {
    alignItems: 'center',
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(19, 25, 39, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  manualBtnIcon: {
    fontSize: 14,
  },
  manualBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 12,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  permissionTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  permissionText: {
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 22,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  permissionBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13,
  },
  cancelTextBtn: {
    marginTop: 16,
  },
  cancelLink: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 15, 25, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingText: {
    color: '#F8FAFC',
    marginTop: 12,
    fontWeight: '700',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  manualCard: {
    backgroundColor: '#131927',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#0B0F19',
    color: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 16,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  modalCancelText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 12,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
  },
  modalConfirmText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 12,
  },
});