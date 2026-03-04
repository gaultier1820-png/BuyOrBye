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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { 
  loadBarcodeResults,
  removeBarcodeResult,
  clearAllBarcodeResults,
  updateBarcodeNotes,
  saveBarcodeResult,
} from '../storage';

const { width } = Dimensions.get('window');

function ProductImage({ imageUrl, style, iconSize = 32 }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [imageUrl]);

  if (imageUrl && !imageError) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={style}
        resizeMode="cover"
        onError={() => setImageError(true)}
      />
    );
  }
  return (
    <View style={[style, styles.placeholderCenter]}>
      <Ionicons name="cube-outline" size={iconSize} color="#E0E0E0" />
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

export default function MyShelfScreen({ navigation }) {
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
  const [showFullCamera, setShowFullCamera] = useState(false);
  const cameraRef = useRef(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const insets = useSafeAreaInsets();

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

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: "none" } });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

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
    setEditModal((m) => ({ ...m, visible: false }));
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
          onPress: () => setShowFullCamera(true),
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

  const takePhoto = async () => {
    if (cameraRef.current) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 100);

        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
        });
        if (photo.uri) {
          const fileName = Date.now() + '.jpg';
          const permanentUri = FileSystem.documentDirectory + fileName;
          await FileSystem.copyAsync({ from: photo.uri, to: permanentUri });
          setEditModal((m) => ({ ...m, imageUrl: permanentUri }));
          setShowFullCamera(false);
        }
      } catch (error) {
        console.log('Error taking photo:', error);
        Alert.alert('Ошибка', 'Не удалось сделать фото');
      }
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

    const renderLeftActions = (progress, dragX) => {
      const scale = dragX.interpolate({
        inputRange: [0, 100],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      });
      return (
        <View style={styles.swipeLeftAction}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="trash-outline" size={28} color="#E0E0E0" />
          </Animated.View>
        </View>
      );
    };

    return (
      <AnimatedCard index={index}>
        <Swipeable
          renderLeftActions={renderLeftActions}
          onSwipeableOpen={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert(
              'Удалить?',
              'Удалить этот товар из истории?',
              [
                { text: 'Отмена', style: 'cancel', onPress: () => refresh() },
                { text: 'Удалить', style: 'destructive', onPress: () => handleDelete(item.barcode) }
              ]
            );
          }}
        >
          <TouchableOpacity
            style={styles.listCard}
            onPress={() => openEditItem(item)}
            activeOpacity={0.9}
          >
            <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.listCardInner}>
              <ProductImage 
                imageUrl={item.imageUrl} 
                style={styles.listImage} 
                iconSize={32}
              />
              
              <View style={styles.listContent}>
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle} numberOfLines={2}>{displayName}</Text>
                  <View style={styles.listBadge}>
                    <Ionicons 
                      name={item.result === 'like' ? 'thumbs-up' : 'thumbs-down'} 
                      size={14} 
                      color="#E0E0E0" 
                    />
                  </View>
                </View>
                
                <Text style={styles.listDate}>
                  {formatDate(item.scannedAt).split(',')[0]}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Swipeable>
      </AnimatedCard>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Моя Полка</Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearAll} activeOpacity={0.8}>
          <Text style={styles.clearButtonText}>Очистить всё</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchFilterContainer}>
        <View style={styles.searchBarWrapper}>
          <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по названию или заметкам..."
            placeholderTextColor="rgba(160, 160, 165, 0.7)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
            onPress={() => setFilter('all')}
          >
            <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.filterBtnContent}><Text style={[styles.filterBtnText, filter === 'all' && styles.filterBtnTextActive]}>Все</Text></View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'like' && styles.filterBtnActive]}
            onPress={() => setFilter('like')}
          >
            <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.filterBtnContent}><Text style={[styles.filterBtnText, filter === 'like' && styles.filterBtnTextActive]}>Лайки</Text></View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'dislike' && styles.filterBtnActive]}
            onPress={() => setFilter('dislike')}
          >
            <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.filterBtnContent}><Text style={[styles.filterBtnText, filter === 'dislike' && styles.filterBtnTextActive]}>Дизлайки</Text></View>
          </TouchableOpacity>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={64} color="#E0E0E0" style={{ marginBottom: 16 }} />
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
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 15 }}
        />
      )}

      {/* Floating Navigation Island */}
      <View style={styles.floatingIsland}>
        <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Scanner')}>
          <Ionicons name="scan-outline" size={32} color="#E0E0E0" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Scanner')}
        >
          <Ionicons name="camera-outline" size={32} color="#E0E0E0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} disabled>
          <Ionicons name="library" size={32} color="#E0E0E0" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={editModal.visible && !showFullCamera}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModal((m) => ({ ...m, visible: false }))}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editModalOverlay}
        >
          <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.editModalBackdrop} />
          <View style={styles.editModalBoxWrap}>
            <BlurView intensity={75} tint="dark" style={styles.editModalBox}>
              <Text style={styles.editModalTitle}>Редактировать</Text>
              <View style={styles.editImageRow}>
                <TouchableOpacity onPress={() => setShowFullCamera(true)} activeOpacity={0.8}>
                  <ProductImage 
                    imageUrl={editModal.imageUrl} 
                    style={styles.editModalImage} 
                    iconSize={40}
                  />
                  <View style={styles.editBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.editNameInput}
                placeholder="Название товара"
                placeholderTextColor="rgba(160, 160, 165, 0.7)"
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
                placeholderTextColor="rgba(160, 160, 165, 0.7)"
                value={editModal.notes}
                onChangeText={(notes) => setEditModal((m) => ({ ...m, notes }))}
                multiline
                maxLength={300}
              />
              <View style={styles.editModalButtons}>
                <TouchableOpacity
                  style={[styles.editModalBtn, styles.editModalBtnDelete]}
                  onPress={() => handleDelete(editModal.barcode)}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff4444" />
                </TouchableOpacity>
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

      {showFullCamera && (
        <View style={styles.fullCameraOverlay}>
          <View style={styles.fullCameraContainer}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
            />
            {isFlashing && (
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: 0.5, zIndex: 2000 }]}
                pointerEvents="none"
              />
            )}
          </View>
          <TouchableOpacity style={styles.captureBtn} onPress={takePhoto} />
          <TouchableOpacity style={styles.cancelCameraBtn} onPress={() => setShowFullCamera(false)}>
            <Text style={styles.cancelCameraText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
    // borderBottomWidth: 1,
    // borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    color: '#E0E0E0',
    fontSize: 22,
    fontWeight: 'bold',
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 30,
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  clearButtonText: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
  },
  searchFilterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 8,
  },
  searchBarWrapper: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 12,
    height: 46,
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    color: '#E0E0E0',
    fontSize: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterBtn: {
    flex: 1,
    height: 36,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  filterBtnContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: '#E0E0E0',
    backgroundColor: 'rgba(40, 40, 45, 0.9)',
  },
  filterBtnText: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
  },
  filterBtnTextActive: {
    color: '#E0E0E0',
  },
  // List Styles
  listCard: {
    height: 133,
    borderRadius: 30,
    marginHorizontal: 15,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    // Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  listCardInner: {
    flexDirection: 'row',
    flex: 1,
  },
  listImage: {
    width: 100,
    height: '100%',
    borderRadius: 30,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  listContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  listTitle: {
    color: '#E0E0E0',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  listBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listDate: {
    color: 'rgba(160, 160, 165, 0.7)',
    fontSize: 12,
  },
  placeholderCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  swipeLeftAction: {
    backgroundColor: '#D32F2F',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 30,
    flex: 1,
    marginHorizontal: 15,
    marginBottom: 12,
    borderRadius: 12,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#E0E0E0',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    color: 'rgba(160, 160, 165, 0.7)',
    fontSize: 14,
  },
  editModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  editModalBoxWrap: {
    width: '88%',
    maxWidth: 400,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  editModalBox: {
    borderRadius: 30,
    padding: 22,
    overflow: 'hidden',
  },
  editModalTitle: {
    color: '#E0E0E0',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  editImageRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  editModalImage: {
    width: 100,
    height: 100,
    borderRadius: 30,
  },
  editBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#2196F3',
    borderRadius: 30,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  editNameInput: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 30,
    padding: 14,
    color: '#E0E0E0',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  verdictRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  verdictButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  verdictButtonLikeActive: {
    backgroundColor: 'rgba(40, 40, 45, 0.9)',
    borderColor: '#E0E0E0',
  },
  verdictButtonDislikeActive: {
    backgroundColor: 'rgba(40, 40, 45, 0.9)',
    borderColor: '#E0E0E0',
  },
  verdictButtonText: {
    color: 'rgba(160, 160, 165, 0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  verdictButtonTextActive: {
    color: '#E0E0E0',
  },
  editNotesInput: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 30,
    padding: 14,
    color: '#E0E0E0',
    fontSize: 16,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 18,
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  editModalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    justifyContent: 'center',
  },
  editModalBtnCancel: { backgroundColor: 'rgba(40, 40, 45, 0.7)' },
  editModalBtnSave: { backgroundColor: 'rgba(40, 40, 45, 0.7)' },
  editModalBtnText: {
    color: '#E0E0E0',
    fontSize: 16,
    fontWeight: '600',
  },
  editModalBtnDelete: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  fullCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 3000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullCameraContainer: {
    width: width,
    height: width * (4 / 3),
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  captureBtn: {
    position: 'absolute',
    bottom: 40,
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderWidth: 4,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  cancelCameraBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 10,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 30,
  },
  cancelCameraText: {
    color: '#E0E0E0',
    fontWeight: '600',
  },
  floatingIsland: {
    position: 'absolute',
    bottom: 30,
    width: '90%',
    height: 75,
    alignSelf: 'center',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    overflow: 'hidden',
    borderWidth: 0.8,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    zIndex: 100,
  },
  navButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
