import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as NavigationBar from 'expo-navigation-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { BasketProvider } from './src/context/BasketContext';
import { AuthScreen } from './src/screens/auth/AuthScreen';
import { DashboardScreen } from './src/screens/finance/DashboardScreen';
import { EventsScreen } from './src/screens/finance/EventsScreen';
import { EventDetailsScreen } from './src/screens/finance/EventDetailsScreen';
import { EventChecklistScreen } from './src/screens/finance/EventChecklistScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator();

type NavigationBarColorAPI = typeof NavigationBar & {
  setPositionAsync?: (position: 'absolute' | 'relative') => Promise<void>;
  setBackgroundColorAsync?: (color: string) => Promise<void>;
  setButtonStyleAsync?: (style: 'light' | 'dark') => Promise<void>;
  setStyleAsync?: (style: 'light' | 'dark') => Promise<void>;
};

// Define o fundo escuro nativo para as transições do React Navigation
const DarkNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0B0F19',
    card: '#0B0F19',
  },
};

const NavigationRoutes = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkNavTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0F19' },
          animation: 'slide_from_right',
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Events" component={EventsScreen} />
            <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
            <Stack.Screen name="EventChecklist" component={EventChecklistScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      const navigationBar = NavigationBar as NavigationBarColorAPI;
      NavigationBar.setStyle('light');

      void Promise.all([
        navigationBar.setPositionAsync?.('absolute'),
        navigationBar.setBackgroundColorAsync?.('#00000000'),
        navigationBar.setButtonStyleAsync?.('light'),
        navigationBar.setStyleAsync?.('light'),
      ]).catch((error: unknown) => {
        console.warn('Não foi possível configurar a barra de navegação:', error);
      });
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BasketProvider>
          <NavigationRoutes />
        </BasketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
  },
});