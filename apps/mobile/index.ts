import 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';

// Inicializa a camada nativa de telas para o react-navigation
enableScreens(true);

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);