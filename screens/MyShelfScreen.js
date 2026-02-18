import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import {
  loadBarcodeResults,
  removeBarcodeResult,
  clearAllBarcodeResults,
  updateBarcodeNotes,
  saveBarcodeResult,
} from '../storage';

const CARD_IMAGE_SIZE = 72;

function ProductImage({ imageUrl, size = CARD_IMAGE_SIZE }) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.cardImage, { width: size, height: size }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.placeholderImage, { width: size, height: size }]}>
      <Ionicons name="cube-outline" size={size * 0.5} color="rgba(255,255,255,0.4)" />
    </View>
  );
}

function AnimatedCard({ index, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, [index, anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

function formatDate(ts) {
  if (!ts) return 'Дата неизвестна';
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDisplayName(entry) {
  if (!entry) return null;
  const name = entry.productName && String(entry.productName).trim();
  const brand = entry.brand && String(entry.brand).trim();
  if (name) return brand ? `${name} · ${brand}` : name;
  return null;
}

export default function MyShelfScreen() {
  const [items, setItems] = useState([]);
  const [rawResults, setRawResults] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editModal, setEditModal] = useState({
    visible: false,
    barcode: null,
    productName: '',
    brand: '',
    notes: '',
    imageUrl: null,
    result: 'like',
  });

  const refresh = useCallback(async () => {
    const data = await loadBarcodeResults();
    setRawResults(data);
    const list = Object.entries(data)
      .map(([barcode, entry]) => {
        const e = typeof entry === 'string' ? { result: entry, scannedAt: 0 } : entry;
        return {
          barcode,
          result: e.result,
          scannedAt: e.scannedAt || 0,
          productName: e.productName,
          brand: e.brand,
          notes: e.notes != null ? String(e.notes) : '',
          imageUrl: e.imageUrl != null ? String(e.imageUrl) : null,
          category: e.category || null,
        };
      })
      .sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
    setItems(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filteredItems = items.filter((item) => {
    const matchesFilter = filter === 'all' || item.result === filter;
    if (!matchesFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (item.productName || '').toLowerCase();
    const brand = (item.brand || '').toLowerCase();
    const notes = (item.notes || '').toLowerCase();
    return name.includes(q) || brand.includes(q) || notes.includes(q);
  });

  const handleDelete = async (barcode) => {
    const next = await removeBarcodeResult(barcode, rawResults);
    setRawResults(next);
    setItems((prev) => prev.filter((i) => i.barcode !== barcode));
  };

  const handleClearAll = () => {
    Alert.alert(
      'Очистить всё?',
      'Удалить всю историю сканирований?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: async () => {
            await clearAllBarcodeResults();
            setRawResults({});
            setItems([]);
          },
        },
      ]
    );
  };

  const openEditItem = (item) => {
    setEditModal({
      visible: true,
      barcode: item.barcode,
      productName: item.productName || '',
      brand: item.brand || '',
      notes: item.notes || '',
      imageUrl: item.imageUrl || null,
      result: item.result || 'like',
    });
  };

  const pickImage = async () => {
    try {
      Alert.alert('Фото товара', 'Выберите источник', [
        {
          text: 'Камера',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Ошибка', 'Нужен доступ к камере');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setEditModal((m) => ({ ...m, imageUrl: result.assets[0].uri }));
              }
            } catch (error) {
              console.log('Camera error:', error);
              Alert.alert('Ошибка', 'Не удалось сделать фото');
            }
          },
        },
        {
          text: 'Галерея',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Ошибка', 'Нужен доступ к галерее');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setEditModal((m) => ({ ...m, imageUrl: result.assets[0].uri }));
              }
            } catch (error) {
              console.log('Gallery error:', error);
              Alert.alert('Ошибка', 'Не удалось выбрать фото');
            }
          },
        },
        { text: 'Отмена', style: 'cancel' },
      ]);
    } catch (e) {
      console.log('PickImage error:', e);
    }
  };

  const handleUpdate = async () => {
    const { barcode, productName, brand, notes, imageUrl, result } = editModal;
    if (barcode == null) return;

    const next = await saveBarcodeResult(barcode, result, rawResults, {
      productName,
      brand,
      notes,
      imageUrl,
    });

    setRawResults(next);
    const list = Object.entries(next)
      .map(([bc, entry]) => {
        const e = typeof entry === 'string' ? { result: entry, scannedAt: 0 } : entry;
        return {
          barcode: bc,
          result: e.result,
          scannedAt: e.scannedAt || 0,
          productName: e.productName,
          brand: e.brand,
          notes: e.notes != null ? String(e.notes) : '',
          imageUrl: e.imageUrl != null ? String(e.imageUrl) : null,
        };
      })
      .sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
    setItems(list);
    setEditModal({ visible: false, barcode: null, productName: '', brand: '', notes: '', imageUrl: null, result: 'like' });
  };

  const renderItem = ({ item, index }) => {
    const displayName = getDisplayName(item) || item.barcode;
    
    const renderRightActions = (progress, dragX) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });
      return (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => handleDelete(item.barcode)}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={26} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      );
    };

    return (
      <AnimatedCard index={index}>
        <Swipeable renderRightActions={renderRightActions} containerStyle={styles.swipeContainer}>
          <TouchableOpacity
            style={styles.cardContainer}
            onPress={() => openEditItem(item)}
            activeOpacity={0.9}
          >
            <View style={[styles.verdictIndicator, item.result === 'like' ? styles.indicatorLike : styles.indicatorDislike]} />
            
            <View style={styles.cardInner}>
              <ProductImage imageUrl={item.imageUrl} size={CARD_IMAGE_SIZE} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={styles.productName} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.date}>{formatDate(item.scannedAt).split(',')[0]}</Text>
                </View>
                
                {item.category && (
                  <View style={styles.categoryTag}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                )}

                <Text style={styles.notes} numberOfLines={2}>
                  {item.notes ? item.notes : <Text style={styles.notesPlaceholder}>Нет заметок...</Text>}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Swipeable>
      </AnimatedCard>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Моя Полка</Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearAll} activeOpacity={0.8}>
          <Text style={styles.clearButtonText}>Очистить всё</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchFilterContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnAllActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterBtnText, filter === 'all' && styles.filterBtnTextActive]}>Все</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'like' && styles.filterBtnLikeActive]}
            onPress={() => setFilter('like')}
          >
            <Text style={[styles.filterBtnText, filter === 'like' && styles.filterBtnTextActive]}>Likes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'dislike' && styles.filterBtnDislikeActive]}
            onPress={() => setFilter('dislike')}
          >
            <Text style={[styles.filterBtnText, filter === 'dislike' && styles.filterBtnTextActive]}>Dislikes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={64} color="rgba(255,255,255,0.2)" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyText}>Ваша полка пуста</Text>
          <Text style={styles.emptySubtext}>Начните сканировать товары!</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Ничего не найдено</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.barcode}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <Modal
        visible={editModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModal((m) => ({ ...m, visible: false }))}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editModalOverlay}
        >
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.editModalBackdrop} />
          <View style={styles.editModalBoxWrap}>
            <BlurView intensity={75} tint="dark" style={styles.editModalBox}>
              <Text style={styles.editModalTitle}>Редактировать</Text>
              <View style={styles.editImageRow}>
                <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
                  <ProductImage imageUrl={editModal.imageUrl} size={100} />
                  <View style={styles.editBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.editNameInput}
                placeholder="Название товара"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={editModal.productName}
                onChangeText={(text) => setEditModal((m) => ({ ...m, productName: text }))}
              />
              <View style={styles.verdictRow}>
                <TouchableOpacity
                  style={[styles.verdictButton, editModal.result === 'like' && styles.verdictButtonLikeActive]}
                  onPress={() => setEditModal((m) => ({ ...m, result: 'like' }))}
                >
                  <Text style={[styles.verdictButtonText, editModal.result === 'like' && styles.verdictButtonTextActive]}>Like</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.verdictButton, editModal.result === 'dislike' && styles.verdictButtonDislikeActive]}
                  onPress={() => setEditModal((m) => ({ ...m, result: 'dislike' }))}
                >
                  <Text style={[styles.verdictButtonText, editModal.result === 'dislike' && styles.verdictButtonTextActive]}>Dislike</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.editNotesInput}
                placeholder="Заметки"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={editModal.notes}
                onChangeText={(notes) => setEditModal((m) => ({ ...m, notes }))}
                multiline
                maxLength={300}
              />
              <View style={styles.editModalButtons}>
                <TouchableOpacity
                  style={[styles.editModalBtn, styles.editModalBtnCancel]}
                  onPress={() => setEditModal({ visible: false, barcode: null, productName: '', brand: '', notes: '', imageUrl: null, result: 'like' })}
                >
                  <Text style={styles.editModalBtnText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editModalBtn, styles.editModalBtnSave]}
                  onPress={handleUpdate}
                >
                  <Text style={styles.editModalBtnText}>Сохранить</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchFilterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 8,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 10,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterBtnAllActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  filterBtnLikeActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderColor: 'rgba(76, 175, 80, 0.5)',
  },
  filterBtnDislikeActive: {
    backgroundColor: 'rgba(244, 67, 54, 0.3)',
    borderColor: 'rgba(244, 67, 54, 0.5)',
  },
  filterBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  swipeContainer: {
    marginBottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  verdictIndicator: {
    width: 6,
    height: '100%',
  },
  indicatorLike: { backgroundColor: '#4CAF50' },
  indicatorDislike: { backgroundColor: '#F44336' },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  cardImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginRight: 12,
  },
  placeholderImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardContent: { flex: 1, justifyContent: 'center' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  productName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  date: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  categoryText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  notes: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  notesPlaceholder: {
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
  deleteAction: {
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  separator: {
    height: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  editModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  editModalBoxWrap: {
    width: '88%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  editModalBox: {
    borderRadius: 20,
    padding: 22,
    overflow: 'hidden',
  },
  editModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  editImageRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  editBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#2196F3',
    borderRadius: 12,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a1a1a',
  },
  editNameInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  verdictRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  verdictButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  verdictButtonLikeActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.5)',
    borderColor: '#4CAF50',
  },
  verdictButtonDislikeActive: {
    backgroundColor: 'rgba(244, 67, 54, 0.5)',
    borderColor: '#f44336',
  },
  verdictButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  verdictButtonTextActive: {
    color: '#fff',
  },
  editNotesInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  editModalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  editModalBtnCancel: { backgroundColor: 'rgba(255,255,255,0.1)' },
  editModalBtnSave: { backgroundColor: 'rgba(76, 175, 80, 0.9)' },
  editModalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
