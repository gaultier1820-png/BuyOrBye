import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import ScannerScreen from './screens/ScannerScreen';
import MyShelfScreen from './screens/MyShelfScreen';

const Tab = createMaterialTopTabNavigator();

const TransparentTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
  },
};

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  
  const focusedOptions = descriptors[state.routes[state.index].key].options;

  if (focusedOptions.tabBarStyle?.display === 'none') {
    return null;
  }
  
  return (
    <View style={[styles.tabBarContainer, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
      <BlurView intensity={70} tint="dark" style={styles.floatingIsland}>
        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => navigation.navigate('Scanner')}
        >
          <Ionicons 
            name={state.index === 0 ? "scan-circle" : "scan-outline"} 
            size={32} 
            color={state.index === 0 ? "#4ade80" : "#E0E0E0"} 
          />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => navigation.navigate('MyShelf')}
        >
          <Ionicons 
            name={state.index === 1 ? "library" : "library-outline"} 
            size={32} 
            color={state.index === 1 ? "#4ade80" : "#E0E0E0"} 
          />
        </TouchableOpacity>
      </BlurView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#121212' }}>
        <NavigationContainer theme={TransparentTheme}>
          <StatusBar style="light" />
          <Tab.Navigator
            tabBar={props => <CustomTabBar {...props} />}
            initialRouteName="Scanner"
            tabBarPosition="bottom"
            screenOptions={{
              swipeEnabled: true,
              tabBarStyle: { backgroundColor: 'transparent' },
            }}
            sceneContainerStyle={{ backgroundColor: '#121212' }}
          >
            <Tab.Screen name="Scanner" component={ScannerScreen} />
            <Tab.Screen name="MyShelf" component={MyShelfScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  floatingIsland: {
    flexDirection: 'row',
    width: '60%',
    height: 75,
    borderRadius: 40,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    alignItems: 'center',
    justifyContent: 'space-around',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  navButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});