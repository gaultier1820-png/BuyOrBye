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
  BackHandler,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector, GestureHandlerRootView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { loadBarcodeResults, saveBarcodeResult } from '../storage';

const { width, height } = Dimensions.get('window');
const IMAGE_SIZE = 120;

function ProductImage({ imageUrl, size = IMAGE_SIZE }) {
  const height = size * (4 / 3); // 3:4 aspect ratio
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.productImage, { width: size, height }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.placeholderImage, { width: size, height }]}>
      <Ionicons name="cube-outline" size={size * 0.4} color="rgba(255,255,255,0.5)" />
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
  const [lastScannedDate, setLastScannedDate] = useState(null);

  // Reanimated Shared Values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const hapticTriggered = useSharedValue(false);
  const entranceTranslateY = useSharedValue(500);

  useFocusEffect(
    useCallback(() => {
      loadSavedResults();
    }, [])
  );

  useEffect(() => {
    if (showModal) {
      translateY.value = 0;
      entranceTranslateY.value = withSpring(0, { damping: 12, stiffness: 100 });
    } else {
      entranceTranslateY.value = 500;
      translateY.value = 0;
    }
  }, [showModal]);

  useEffect(() => {
    if (!showModal) return;

    const backAction = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      closeModal();
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [showModal]);

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
      setLastScannedDate(saved.dateString || (saved.scannedAt ? new Date(saved.scannedAt).toLocaleDateString() : null));
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
    setLastScannedDate(null);
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
                allowsEditing: false, // Skip cropping
                // aspect: [3, 4], // Targeting 3:4 ratio
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
                allowsEditing: false, // Skip cropping
                // aspect: [3, 4], // Targeting 3:4 ratio
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
    if (existingVerdict && existingVerdict !== verdict) {
      Alert.alert(
        'Change Verdict?',
        `You previously ${existingVerdict === 'like' ? 'liked' : 'disliked'} this product. Are you sure you want to move it to ${verdict === 'like' ? 'Liked' : 'Disliked'}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              translateX.value = withSpring(0);
            },
          },
          { text: 'Confirm', onPress: () => finishSwipe(verdict) },
        ]
      );
    } else {
      finishSwipe(verdict);
    }
  };

  const finishSwipe = (verdict) => {
    if (verdict === 'like') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    saveResult(verdict);
  };

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      if (Math.abs(event.translationX) > 100 && !hapticTriggered.value) {
        hapticTriggered.value = true;
        runOnJS(Haptics.selectionAsync)();
      } else if (Math.abs(event.translationX) < 100 && hapticTriggered.value) {
        hapticTriggered.value = false;
      }
    })
    .onEnd((event) => {
      hapticTriggered.value = false;
      if (Math.abs(translateX.value) > 100) {
        const direction = translateX.value > 0 ? 'like' : 'dislike';
        const targetX = direction === 'like' ? width + 200 : -width - 200;
        translateX.value = withSpring(targetX, { velocity: 50 }, () => {
          runOnJS(handleSwipeComplete)(direction);
        });
        translateY.value = withSpring(0);
      } else if (event.translationY > 150) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        translateY.value = withSpring(height, { velocity: event.velocityY }, () => {
          runOnJS(closeModal)();
        });
        translateX.value = withSpring(0);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const rCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-width, width], [-15, 15]);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: entranceTranslateY.value + translateY.value },
        { rotate: `${rotate}deg` }
      ],
    };
  });

  const rLeftGradientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -150], [0, 1], 'clamp'),
  }));

  const rRightGradientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 150], [0, 1], 'clamp'),
  }));

  const saveResult = async (result) => {
    try {
      const newResults = await saveBarcodeResult(currentBarcode, result, savedResults, {
        productName: editableName.trim() || undefined,
        imageUrl: selectedImage || undefined,
        notes: modalNotes.trim(),
        dateString: new Date().toLocaleDateString(),
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
      setLastScannedDate(null);
      translateX.value = 0;
      translateY.value = 0;
    } catch (error) {
      console.error('Error saving result:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить результат');
    }
  };

  const closeModal = () => {
    Haptics.selectionAsync();
    setShowModal(false);
    setScanned(false);
    setCurrentBarcode(null);
    currentBarcodeRef.current = null;
    setModalNotes('');
    setEditableName('');
    setSelectedImage(null);
    setExistingVerdict(null);
    setLastScannedDate(null);
    translateX.value = 0;
    translateY.value = 0;
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
          {/* Iridescent Side Gradients */}
          <Animated.View style={[styles.gradientSide, styles.gradientLeft, rLeftGradientStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255, 50, 50, 0.5)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
          <Animated.View style={[styles.gradientSide, styles.gradientRight, rRightGradientStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(50, 255, 50, 0.5)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>

          <View style={styles.modalBackdrop}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          </View>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.modalContentWrap, rCardStyle]}>
            <BlurView intensity={70} tint="dark" style={styles.modalContent}>
              <View style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: 'rgba(255,255,255,0.2)',
                marginTop: 10,
                alignSelf: 'center'
              }} />
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
                <View style={styles.verdictContainer}>
                  <View style={styles.circularIcon}>
                    <Ionicons 
                      name={existingVerdict === 'like' ? 'thumbs-up' : 'thumbs-down'} 
                      size={20} 
                      color="#fff" 
                    />
                  </View>
                  {lastScannedDate && (
                    <Text style={styles.dateText}>Added on: {lastScannedDate}</Text>
                  )}
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
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleSwipeComplete('dislike')}
                >
                  <MaterialCommunityIcons name="thumb-down-outline" size={30} color="grey" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleSwipeComplete('like')}
                >
                  <MaterialCommunityIcons name="thumb-up-outline" size={30} color="grey" />
                </TouchableOpacity>
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
  gradientSide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: width * 0.2,
    zIndex: 5,
  },
  gradientLeft: { left: 0 },
  gradientRight: { right: 0 },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'visible',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  modalContent: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  modalImageRow: {
    position: 'relative',
    marginBottom: 20,
    alignItems: 'center',
  },
  loaderWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  productImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 120,
    height: 160,
  },
  placeholderImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: 120,
    height: 160,
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
  verdictContainer: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  circularIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  dateText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    width: '100%',
    paddingHorizontal: 40,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'grey',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
