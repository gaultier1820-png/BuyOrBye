import React from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import ScannerScreen from './screens/ScannerScreen';
import MyShelfScreen from './screens/MyShelfScreen';

const Tab = createBottomTabNavigator();

const TransparentTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer theme={TransparentTheme}>
          <StatusBar style="light" />
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarStyle: {
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'transparent',
                borderTopWidth: 0,
                elevation: 0,
              },
              tabBarBackground: () => null,
              tabBarActiveTintColor: '#4ade80',
              tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
              tabBarShowLabel: false,
              tabBarIcon: ({ focused, color, size }) => {
                let iconName;
                if (route.name === 'Scanner') {
                  iconName = focused ? 'scan-circle' : 'scan-outline';
                  size = focused ? size + 4 : size;
                } else if (route.name === 'MyShelf') {
                  iconName = focused ? 'library' : 'library-outline';
                }
                return <Ionicons name={iconName} size={size} color={color} />;
              },
            })}
          >
            <Tab.Screen name="Scanner" component={ScannerScreen} />
            <Tab.Screen name="MyShelf" component={MyShelfScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}