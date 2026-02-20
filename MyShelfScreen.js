import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, Image, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { loadBarcodeResults, removeBarcodeResult } from '../storage';

export default function MyShelfScreen() {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [])
  );

  const loadItems = async () => {
    const results = await loadBarcodeResults();
    // Convert object to array and sort by date (newest first)
    const itemsArray = Object.keys(results).map(key => ({
      barcode: key,
      ...results[key]
    })).sort((a, b) => b.scannedAt - a.scannedAt);
    setItems(itemsArray);
  };

  const handleDelete = async (barcode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Assuming removeBarcodeResult exists in storage.js. 
    // If not, you may need to implement it or use AsyncStorage directly.
    const newResults = await removeBarcodeResult(barcode);
    const itemsArray = Object.keys(newResults).map(key => ({
      barcode: key,
      ...newResults[key]
    })).sort((a, b) => b.scannedAt - a.scannedAt);
    setItems(itemsArray);
  };

  const confirmDelete = (barcode) => {
    Alert.alert(
      "Delete Item",
      "Are you sure you want to remove this item?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDelete(barcode) }
      ]
    );
  };

  const renderRightActions = (progress, dragX, barcode) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => confirmDelete(barcode)}
      >
        <Ionicons name="trash-outline" size={24} color="#fff" />
      </TouchableOpacity>
    );
  };

  const filteredItems = items.filter(item => {
    const query = searchQuery.toLowerCase();
    const nameMatch = item.productName?.toLowerCase().includes(query);
    const notesMatch = item.notes?.toLowerCase().includes(query);
    return nameMatch || notesMatch;
  });

  const renderItem = ({ item }) => (
    <Swipeable
      renderRightActions={(p, d) => renderRightActions(p, d, item.barcode)}
    >
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} />
          ) : (
            <Ionicons name="cube-outline" size={30} color="rgba(255,255,255,0.3)" />
          )}
        </View>
        <View style={styles.infoContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.productName} numberOfLines={1}>{item.productName || 'Unknown'}</Text>
            <Ionicons 
              name={item.result === 'like' ? 'thumbs-up' : 'thumbs-down'} 
              size={16} 
              color={item.result === 'like' ? '#4CAF50' : '#F44336'} 
            />
          </View>
          <Text style={styles.barcode}>{item.barcode}</Text>
          {item.notes ? <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text> : null}
        </View>
      </View>
    </Swipeable>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.title}>My Shelf</Text>
        
        <View style={styles.searchContainer}>
          <BlurView intensity={20} tint="dark" style={styles.searchBlur}>
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search items..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </BlurView>
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={item => item.barcode}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="library-outline" size={64} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No items found' : 'Your shelf is empty'}
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  safeArea: { flex: 1 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginBottom: 15 },
  searchContainer: { paddingHorizontal: 20, marginBottom: 20 },
  searchBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: 100,
  },
  imageContainer: {
    width: 75,
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  infoContainer: { flex: 1, padding: 12, justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  productName: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  barcode: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 6 },
  notes: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  deleteAction: {
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: 100,
    marginBottom: 12,
    borderRadius: 16,
    marginLeft: 10,
  },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyText: { color: 'rgba(255,255,255,0.4)', marginTop: 16, fontSize: 16 },
});