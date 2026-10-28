import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../config/supabase';

export const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      Alert.alert('Atenção', 'Por favor, preenche o e-mail e a palavra-passe.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          Alert.alert('Erro ao entrar', 'E-mail ou palavra-passe incorretos.');
        } else if (error.message.includes('Email not confirmed')) {
          Alert.alert('Acesso pendente', 'Este utilizador ainda não tem o e-mail confirmado.');
        } else {
          Alert.alert('Erro ao entrar', error.message);
        }
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Ocorreu uma falha ao iniciar sessão.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      Alert.alert(
        'Redefinir Palavra-passe',
        'Introduza o seu e-mail no campo acima e toque novamente nesta opção.'
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) {
        // Interceta o bloqueio de segurança por tempo do Supabase
        if (error.message.includes('For security purposes') || error.message.includes('after')) {
          const match = error.message.match(/\d+/);
          const seconds = match ? match[0] : 'alguns';
          Alert.alert(
            'Aguarde um momento',
            `Por motivos de segurança, aguarde ${seconds} segundos antes de solicitar um novo e-mail de recuperação.`
          );
          return;
        }

        Alert.alert('Erro ao recuperar', error.message);
        return;
      }

      Alert.alert(
        'E-mail Enviado',
        'Se o e-mail estiver registado, receberá as instruções para redefinir a palavra-passe.'
      );
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao solicitar redefinição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>ManaCost</Text>
        <Text style={styles.subtitle}>Gestão e Controlo Financeiro</Text>

        <TextInput
          placeholder="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          placeholderTextColor="#64748B"
        />

        <TextInput
          placeholder="Palavra-passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholderTextColor="#64748B"
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotBtn}
          onPress={handleForgotPassword}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.forgotText}>Esqueceu da palavra-passe?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1E293B',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  button: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotBtn: {
    marginTop: 18,
    alignItems: 'center',
  },
  forgotText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '500',
  },
});