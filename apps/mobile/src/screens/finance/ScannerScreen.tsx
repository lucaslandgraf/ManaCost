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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ScannerScreen: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
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
        body: { raw_data: qrData, user_id: user?.id },
      });

      if (error) {
        let responseBody: { already_registered?: boolean; error?: string; message?: string } | null =
          null;

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
            responseBody.message || 'Esta nota fiscal já foi registrada no sistema.'
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
          data.message || 'Esta nota fiscal já foi registrada no sistema.'
        );
      } else if (!data?.success) {
        Alert.alert('Erro ao processar nota', data?.error || 'O servidor não confirmou a importação.');
      } else {
        Alert.alert(
          'Sucesso',
          `Compra em ${data?.store_name ?? 'Mercado'} no valor de R$ ${data?.total_amount ?? '0.00'} importada!`
        );
        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível conectar ao servidor.';
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
      Alert.alert('Chave inválida', 'A chave de acesso deve conter 44 números.');
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
        {permission === null ? (
          <View style={styles.permissionContainer}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.permissionText}>Verificando acesso à câmera...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>
              Precisamos de acesso à câmera para ler a nota fiscal.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.btnText}>Permitir Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelTextBtn} onPress={onClose}>
              <Text style={styles.cancelLink}>Fechar</Text>
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
              <View style={styles.header}>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <Text style={styles.closeBtnText}>✕ Fechar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.targetFrame}>
                <View style={styles.scanTarget} />
                <Text style={styles.hintText}>Aponte para o QR Code da Nota Paraná</Text>
              </View>

              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.manualBtn}
                  onPress={() => setManualKeyModal(true)}
                  disabled={loading}
                >
                  <Text style={styles.manualBtnText}>Digitar chave de 44 dígitos</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>Processando nota fiscal...</Text>
          </View>
        )}

        {/* Modal de Contingência Manual */}
        <Modal visible={manualKeyModal} transparent animationType="fade" statusBarTranslucent={true}>
          <View style={styles.modalBackdrop}>
            <View style={styles.manualCard}>
              <Text style={styles.modalTitle}>Digitar Chave de Acesso</Text>
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
                >
                  <Text style={styles.btnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={handleManualSubmit}
                >
                  <Text style={styles.btnText}>Consultar</Text>
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
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'flex-end',
  },
  closeBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeBtnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  targetFrame: {
    alignItems: 'center',
  },
  scanTarget: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hintText: {
    color: '#F8FAFC',
    marginTop: 16,
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  footer: {
    alignItems: 'center',
  },
  manualBtn: {
    backgroundColor: 'rgba(30,41,59,0.95)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
  },
  manualBtnText: {
    color: '#38BDF8',
    fontWeight: 'bold',
    fontSize: 14,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  permissionBtn: {
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 8,
  },
  btnText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  cancelTextBtn: {
    marginTop: 16,
  },
  cancelLink: {
    color: '#94A3B8',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#F8FAFC',
    marginTop: 12,
    fontWeight: 'bold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  manualCard: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
});