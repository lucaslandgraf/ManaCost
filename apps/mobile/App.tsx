import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { BasketProvider } from './src/context/BasketContext';
import { AuthScreen } from './src/screens/auth/AuthScreen';
import { DashboardScreen } from './src/screens/finance/DashboardScreen';
import { EventsScreen } from './src/screens/finance/EventsScreen';
import { EventDetailsScreen } from './src/screens/finance/EventDetailsScreen';
import { EventChecklistScreen } from './src/screens/finance/EventChecklistScreen';

const Stack = createNativeStackNavigator();

// Define o fundo escuro nativo para as transições do React Navigation
const DarkNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0F172A',
    card: '#0F172A',
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
          contentStyle: { backgroundColor: '#0F172A' },
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
  return (
    <AuthProvider>
      <BasketProvider>
        <NavigationRoutes />
      </BasketProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});