// 1. ЭТО ДОЛЖНО БЫТЬ САМОЙ ПЕРВОЙ СТРОКОЙ! БЕЗ НЕЕ ВСЁ УПАДЕТ.
import 'react-native-gesture-handler'; 

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

// 2. Добавляем специальную обертку для жестов
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import ScannerScreen from './screens/ScannerScreen';
import MyShelfScreen from './screens/MyShelfScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    // 3. Оборачиваем всё приложение в этот компонент
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: {
                backgroundColor: '#1a1a1a',
                borderTopColor: '#333',
              },
              tabBarActiveTintColor: '#4CAF50',
              tabBarInactiveTintColor: '#888',
            }}
          >
            <Tab.Screen
              name="Scanner"
              component={ScannerScreen}
              options={{
                title: 'Сканер',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="camera" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="MyShelf"
              component={MyShelfScreen}
              options={{
                title: 'Моя Полка',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="list" size={size} color={color} />
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}