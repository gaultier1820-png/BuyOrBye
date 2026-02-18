import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Dimensions,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { loadBarcodeResults, saveBarcodeResult } from '../storage';

const { width, height } = Dimensions.get('window');
const IMAGE_SIZE = 100;

function ProductImage({ imageUrl, size = IMAGE_SIZE }) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.productImage, { width: size, height: size }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.placeholderImage, { width: size, height: size }]}>
      <Ionicons name="cube-outline" size={size * 0.5} color="rgba(255,255,255,0.5)" />
    </View>
  );
}

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isReadyToScan, setIsReadyToScan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const currentBarcodeRef = useRef(null);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [savedResults, setSavedResults] = useState({});
  const [editableName, setEditableName] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [productLoading, setProductLoading] = useState(false);
  const [modalNotes, setModalNotes] = useState('');
  const [existingVerdict, setExistingVerdict] = useState(null);

  // Reanimated Shared Values
  const translateX = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      loadSavedResults();
    }, [])
  );

  const loadSavedResults = async () => {
    const data = await loadBarcodeResults();
    setSavedResults(data);
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (!isReadyToScan) return;
    setIsReadyToScan(false);

    // Check if already saved (using most recent data)
    const saved = savedResults[data];

    setScanned(true);
    setCurrentBarcode(data);
    currentBarcodeRef.current = data;

    if (saved) {
      // Local Hit
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setEditableName(saved.productName || `Product ${data}`);
      setSelectedImage(saved.imageUrl || null);
      setModalNotes(saved.notes || '');
      setExistingVerdict(saved.result);
      setProductLoading(false);
      setIsLoading(false);
      setShowModal(true);
      translateX.value = 0;
      return;
    }

    // Local Miss
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Instant Reaction
    setProductLoading(true);
    setIsLoading(true);
    setEditableName('Загрузка...');
    setSelectedImage(null);
    setModalNotes('');
    setExistingVerdict(null);
    setShowModal(true);
    translateX.value = 0;

    try {
      // The 'Lucky' API (v0, world)
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
      const json = await response.json();
      
      if (currentBarcodeRef.current !== data) return;

      if (json && json.product) {
        const product = json.product;
        // Data Mapping (v0 style)
        const name = product.product_name || product.brands || data;
        const image = product.image_front_url || null;
        setEditableName(name);
        setSelectedImage(image);
      } else {
        setEditableName(`Product ${data}`);
      }
    } catch (error) {
      if (currentBarcodeRef.current !== data) return;
      setEditableName(`Product ${data}`);
    } finally {
      if (currentBarcodeRef.current === data) {
        setProductLoading(false);
        setIsLoading(false);
      }
    }
  };

  const pickImage = async () => {
    try {
      Alert.alert('Фото товара', 'Выберите источник', [
        {
          text: 'Камера',
          onPress: async () => {
            try {
              console.log('Requesting camera permissions...');
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Ошибка', 'Нужен доступ к камере');
                return;
              }
              console.log('Launching camera...');
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
              });
              console.log('Camera result:', result);
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setSelectedImage(result.assets[0].uri);
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
              console.log('Requesting gallery permissions...');
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Ошибка', 'Нужен доступ к галерее');
                return;
              }
              console.log('Launching gallery...');
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
              });
              console.log('Gallery result:', result);
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setSelectedImage(result.assets[0].uri);
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

  const handleSwipeComplete = (verdict) => {
    saveResult(verdict);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd(() => {
      if (Math.abs(translateX.value) > 100) {
        const direction = translateX.value > 0 ? 'like' : 'dislike';
        const targetX = direction === 'like' ? width + 200 : -width - 200;
        translateX.value = withSpring(targetX, { velocity: 50 }, () => {
          runOnJS(handleSwipeComplete)(direction);
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const rCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-width, width], [-15, 15]);
    return {
      transform: [{ translateX: translateX.value }, { rotate: `${rotate}deg` }],
    };
  });

  const rLeftGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -150], [0, 0.6], 'clamp'),
  }));

  const rRightGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 150], [0, 0.6], 'clamp'),
  }));

  const saveResult = async (result) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const newResults = await saveBarcodeResult(currentBarcode, result, savedResults, {
        productName: editableName.trim() || undefined,
        imageUrl: selectedImage || undefined,
        notes: modalNotes.trim(),
      });
      setSavedResults(newResults);
      
      setShowModal(false);
      setScanned(false);
      setCurrentBarcode(null);
      currentBarcodeRef.current = null;
      setModalNotes('');
      setEditableName('');
      setSelectedImage(null);
      setExistingVerdict(null);
      translateX.value = 0;
    } catch (error) {
      console.error('Error saving result:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить результат');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setScanned(false);
    setCurrentBarcode(null);
    currentBarcodeRef.current = null;
    setModalNotes('');
    setEditableName('');
    setSelectedImage(null);
    setExistingVerdict(null);
    translateX.value = 0;
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.placeholderContainer]}>
        <Text style={styles.placeholderText}>Проверка разрешений…</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.placeholderContainer]}>
        <Text style={styles.permissionText}>Для сканирования штрихкодов нужен доступ к камере</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Разрешить камеру</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <CameraView
        style={[styles.camera, StyleSheet.absoluteFillObject, isReadyToScan && styles.cameraActive]}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
        }}
      />
      {barcodeResult && currentBarcode && (
        <View style={styles.resultOverlay}>
          <BlurView intensity={60} tint="dark" style={styles.glassCard}>
            <View style={styles.resultCardInner}>
              <Text style={styles.resultBarcodeText}>{currentBarcode}</Text>
              <View style={styles.resultBadge}>
                <Text style={styles.resultText}>
                  {barcodeResult === 'like' ? '✓ Like' : '✗ Dislike'}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      )}

      {!showModal && (
        <View style={styles.scanButtonContainer}>
          <TouchableOpacity
            style={[styles.scanButton, isReadyToScan && styles.scanButtonActive]}
            onPress={() => {
              setScanned(false);
              setBarcodeResult(null);
              setCurrentBarcode(null);
              setIsReadyToScan(true);
            }}
          >
            <Text style={styles.scanButtonText}>{isReadyToScan ? 'Сканирую...' : 'SCAN'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {showModal && (
        <View style={styles.modalOverlay}>
          {/* Glow Overlays */}
          <Animated.View
            style={[styles.glowOverlay, { backgroundColor: 'red', right: '50%', left: 0 }, rLeftGlowStyle]}
          />
          <Animated.View
            style={[styles.glowOverlay, { backgroundColor: '#4CAF50', left: '50%', right: 0 }, rRightGlowStyle]}
          />

          <View style={styles.modalBackdrop}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          </View>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.modalContentWrap, rCardStyle]}>
            <BlurView intensity={70} tint="dark" style={styles.modalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Штрихкод обнаружен</Text>
              <View style={styles.modalImageRow}>
                <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
                  <ProductImage imageUrl={selectedImage} size={IMAGE_SIZE} />
                  <View style={styles.editBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
                {productLoading && (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="small" color="#4CAF50" />
                  </View>
                )}
              </View>
              <TextInput
                style={styles.nameInput}
                value={editableName}
                onChangeText={setEditableName}
                placeholder="Название товара"
                placeholderTextColor="rgba(255,255,255,0.4)"
                multiline
              />
              {existingVerdict && (
                <View style={[
                  styles.verdictBadge,
                  existingVerdict === 'like' ? styles.verdictBadgeLike : styles.verdictBadgeDislike
                ]}>
                  <Ionicons 
                    name={existingVerdict === 'like' ? 'thumbs-up' : 'thumbs-down'} 
                    size={16} 
                    color="#fff" 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.verdictText}>
                    {existingVerdict === 'like' ? 'ВЫ ЛАЙКНУЛИ' : 'ВЫ ДИЗЛАЙКНУЛИ'}
                  </Text>
                </View>
              )}
              {currentBarcode ? (
                <Text style={styles.modalBarcodeSmall}>Штрихкод: {currentBarcode}</Text>
              ) : null}
              <Text style={styles.notesLabel}>Заметки</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Короткий комментарий (по желанию)"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={modalNotes}
                onChangeText={setModalNotes}
                multiline
                maxLength={300}
              />
              <View style={styles.swipeHint}>
                <Text style={styles.swipeHintText}>← Dislike  |  Like →</Text>
              </View>
            </BlurView>
          </Animated.View>
          </GestureDetector>
        </View>
      )}
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  camera: { flex: 1 },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#fff', fontSize: 18 },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassCard: {
    overflow: 'hidden',
    borderRadius: 24,
    padding: 28,
    minWidth: width * 0.8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  resultCardInner: { alignItems: 'center' },
  resultBarcodeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  resultBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  resultText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  glowOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContentWrap: {
    width: width * 0.9,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalContent: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  modalImageRow: {
    position: 'relative',
    marginBottom: 12,
  },
  loaderWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  productImage: {
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  placeholderImage: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    width: '100%',
    marginBottom: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
  modalBarcodeSmall: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 16,
  },
  notesLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  notesInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    minHeight: 56,
    maxHeight: 100,
    width: '100%',
    marginBottom: 20,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  swipeHint: {
    marginTop: 10,
    opacity: 0.7,
  },
  swipeHintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraActive: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  scanButtonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 20,
    paddingHorizontal: 60,
    borderRadius: 30,
    elevation: 5,
  },
  scanButtonActive: {
    backgroundColor: '#4CAF50',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  verdictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
    marginTop: 4,
  },
  verdictBadgeLike: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
  },
  verdictBadgeDislike: {
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
  },
  verdictText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});
