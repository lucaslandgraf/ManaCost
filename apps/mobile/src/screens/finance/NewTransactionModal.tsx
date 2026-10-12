import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';

interface Category {
  id: string;
  name: string;
  type: string;
}

interface Account {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewTransactionModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [isSettled, setIsSettled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && user) {
      loadFormData();
    }
  }, [visible, user]);

  const loadFormData = async () => {
    const { data: catData } = await supabase
      .from('categories')
      .select('id, name, type')
      .order('name');

    const { data: accData } = await supabase
      .from('accounts')
      .select('id, name')
      .order('name');

    if (catData) setCategories(catData);
    if (accData) {
      setAccounts(accData);
      if (accData.length > 0) setSelectedAccount(accData[0].id);
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Atenção', 'Informe uma descrição e valor válidos.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('transactions').insert({
      user_id: user?.id,
      description: description.trim(),
      amount: parsedAmount,
      type,
      category_id: selectedCategory,
      account_id: selectedAccount,
      is_settled: isSettled,
      date: new Date().toISOString().split('T')[0],
    });

    setLoading(false);
    if (error) {
      Alert.alert('Erro ao salvar', error.message);
    } else {
      setDescription('');
      setAmount('');
      onSuccess();
      onClose();
    }
  };

  const filteredCategories = categories.filter((c) => c.type === type);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Novo Lançamento</Text>

          {/* Seletor Despesa / Receita */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'expense' && styles.typeBtnActiveExpense]}
              onPress={() => {
                setType('expense');
                setSelectedCategory(null);
              }}
            >
              <Text style={styles.typeText}>Despesa</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'income' && styles.typeBtnActiveIncome]}
              onPress={() => {
                setType('income');
                setSelectedCategory(null);
              }}
            >
              <Text style={styles.typeText}>Receita</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            placeholder="Descrição (ex: Supermercado, Aluguel)"
            placeholderTextColor="#64748B"
            style={styles.input}
            value={description}
            onChangeText={setDescription}
          />

          <TextInput
            placeholder="Valor (R$)"
            placeholderTextColor="#64748B"
            keyboardType="decimal-pad"
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
          />

          {/* Seleção de Categoria */}
          <Text style={styles.label}>Categoria:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {filteredCategories.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.catChip,
                  selectedCategory === c.id && styles.catChipActive,
                ]}
                onPress={() => setSelectedCategory(c.id)}
              >
                <Text
                  style={[
                    styles.catChipText,
                    selectedCategory === c.id && styles.catChipTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Checklist Passivo (Pago / Pendente) */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setIsSettled(!isSettled)}
          >
            <View style={[styles.checkbox, isSettled && styles.checkboxChecked]} />
            <Text style={styles.checkboxLabel}>
              {isSettled ? 'Conta já paga / liquidada' : 'Pendente (adicionar ao checklist do mês)'}
            </Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={loading}
            >
              <Text style={styles.saveText}>{loading ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 16,
    textAlign: 'center',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 4,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  typeBtnActiveExpense: {
    backgroundColor: '#EF4444',
  },
  typeBtnActiveIncome: {
    backgroundColor: '#10B981',
  },
  typeText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 8,
  },
  catScroll: {
    marginBottom: 16,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  catChipText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  catChipTextActive: {
    color: '#0F172A',
    fontWeight: 'bold',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#64748B',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxLabel: {
    color: '#CBD5E1',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  cancelText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  saveText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
});