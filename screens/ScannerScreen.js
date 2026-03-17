import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { loadBarcodeResults } from '../storage';

import { ProductService } from '../services/storageService';

const { width, height } = Dimensions.get('window');
const IMAGE_SIZE = 120;

const initialItemData = {
  name: '',
  image: null,
  notes: '',
  verdict: null,
  date: null,
  loading: false,
};

const ProductImage = React.memo(({ imageUrl, size = IMAGE_SIZE }) => {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.productImage, { width: size, aspectRatio: 3 / 4 }]}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.placeholderImage, { width: size, aspectRatio: 3 / 4 }]}>
      <Ionicons name="cube-outline" size={size * 0.4} color="#E0E0E0" />
    </View>
  );
});

const ActionButtons = React.memo(({ onSwipeComplete }) => (
  <View style={styles.actionButtonsContainer}>
    <TouchableOpacity
      style={styles.actionButton}
      onPress={() => onSwipeComplete('dislike')}
    >
      <MaterialCommunityIcons name="thumb-down-outline" size={28} color="#E0E0E0" />
    </TouchableOpacity>
    <TouchableOpacity
      style={styles.actionButton}
      onPress={() => onSwipeComplete('like')}
    >
      <MaterialCommunityIcons name="thumb-up-outline" size={28} color="#E0E0E0" />
    </TouchableOpacity>
  </View>
));

export default function ScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const [scanned, setScanned] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const currentBarcodeRef = useRef(null);
  const cameraRef = useRef(null);
  const [showFullCamera, setShowFullCamera] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [savedResults, setSavedResults] = useState({});
  const [isFlashing, setIsFlashing] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null);
  const insets = useSafeAreaInsets();

  const [itemData, setItemData] = useState(initialItemData);

  // Ref to hold latest state for callbacks, preventing re-creation of expensive components
  const stateRef = useRef({});
  stateRef.current = {
    isScanningActive,
    scanned,
    savedResults,
    currentBarcode: currentBarcodeRef.current,
    itemData,
  };

  // Reanimated Shared Values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const hapticTriggered = useSharedValue(false);
  const entranceTranslateY = useSharedValue(500);
  const focusOpacity = useSharedValue(0);
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);

  // --- HOOKS SECTION STABILIZATION ---
  
  const handleScanCallback = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScanned(false);
    setIsScanningActive(true);
    setBarcodeResult(null);
    setCurrentBarcode(null);
  }, []);

  const navigateToShelfCallback = useCallback(() => navigation.navigate('MyShelf'), [navigation]);

  const tapGesture = Gesture.Tap().onEnd((event) => {
    const { x, y } = event;
    runOnJS(setFocusPoint)({ x: x / width, y: y / height });
    focusX.value = x - 30;
    focusY.value = y - 30;
    focusOpacity.value = 1;
    focusOpacity.value = withDelay(500, withTiming(0, { duration: 300 }));
  });

  const rFocusStyle = useAnimatedStyle(() => ({
    opacity: focusOpacity.value,
    transform: [{ translateX: focusX.value }, { translateY: focusY.value }],
  }));

  // 3. FIX HOOK RULES: Move useMemos right after their hook dependencies. Never conditional.
  const navBarComponent = useMemo(() => {
    // 2. NAV BAR STABILITY: Do not return null, strictly use 'display: none' to avoid component re-mounts
    const isHidden = showModal || showFullCamera || barcodeResult;
    return (
      <View style={[styles.navBarContainer, { display: isHidden ? 'none' : 'flex' }]}>
        <BlurView intensity={70} tint="dark" style={styles.navBarBlur}>
          <TouchableOpacity style={styles.navIconBtn} disabled>
            <Ionicons name="scan-outline" size={28} color="#4ade80" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mainScanBtn, isScanningActive && styles.mainScanBtnActive]} onPress={handleScanCallback}>
            <Ionicons name="scan" size={32} color={isScanningActive ? "#4ade80" : "#E0E0E0"} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navIconBtn} onPress={navigateToShelfCallback}>
            <Ionicons name="library-outline" size={28} color="#E0E0E0" />
          </TouchableOpacity>
        </BlurView>
      </View>
    );
  }, [showModal, showFullCamera, barcodeResult, isScanningActive, handleScanCallback, navigateToShelfCallback]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onBarcodeScanned = useCallback(async ({ type, data }) => {
    const { isScanningActive, scanned, savedResults } = stateRef.current;
    if (!isScanningActive || scanned) return;
    setIsScanningActive(false);
    setScanned(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const saved = savedResults[data];
    setCurrentBarcode(data);
    currentBarcodeRef.current = data;

    if (saved) {
      setItemData({
        name: saved.productName || `Product ${data}`,
        image: saved.imageUrl || null,
        notes: saved.notes || '',
        verdict: saved.result,
        date: saved.dateString || (saved.scannedAt ? new Date(saved.scannedAt).toLocaleDateString() : null),
        loading: false,
      });
      setIsLoading(false);
      setShowModal(true);
      translateX.value = 0;
      return;
    }

    setItemData({
      name: 'Загрузка...',
      image: null,
      notes: '',
      verdict: null,
      date: null,
      loading: true,
    });
    setIsLoading(true);
    setShowModal(true);
    translateX.value = 0;

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
      const json = await response.json();
      
      if (currentBarcodeRef.current !== data) return;

      if (json && json.product) {
        const product = json.product;
        const name = product.product_name || product.brands || data;
        const image = product.image_front_url || null;
        setItemData(prev => ({ ...prev, name: name, image: image }));
      } else {
        setItemData(prev => ({ ...prev, name: `Product ${data}` }));
      }
    } catch (error) {
      if (currentBarcodeRef.current !== data) return;
      setItemData(prev => ({ ...prev, name: `Product ${data}` }));
    } finally {
      if (currentBarcodeRef.current === data) {
        setItemData(prev => ({ ...prev, loading: false }));
        setIsLoading(false);
      }
    }
  }, []);

  const cameraComponent = useMemo(() => (
    <>
      {/* 4. CAMERA & LAYOUT: isFocused inside useMemo and absoluteFill used securely */}
      {isFocused && (
        <CameraView
          key="main-camera"
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={onBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "qr"] }}
          focusPoint={focusPoint}
          pictureSize="1920x1080"
        />
      )}
      <GestureDetector gesture={tapGesture}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      <Animated.View style={[styles.focusFrame, rFocusStyle]} pointerEvents="none" />
    </>
  ), [isFocused, onBarcodeScanned, focusPoint, rFocusStyle, tapGesture]);

  useFocusEffect(
    useCallback(() => {
      loadSavedResults();
      setIsScanningActive(false); // Require manual scan trigger
      setScanned(false);
    }, [])
  );

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: { display: 'none' }
    });
  }, [navigation]);

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

  const takePhoto = async () => {
    if (cameraRef.current) {
      try {
        // For Pixel 6 Pro optimization:
        // - quality: 0.8 for good compression.
        // - skipProcessing: true for faster capture, as we handle the file ourselves.
        // - Resolution is set via the `pictureSize` prop on the CameraView component.
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
        });
        if (photo.uri) {
          setItemData(prev => ({ ...prev, image: photo.uri }));
          setShowFullCamera(false);
        }
      } catch (error) {
        Alert.alert('Ошибка', 'Не удалось сделать фото');
      }
    }
  };

  const pickImage = async () => {
    try {
      Alert.alert('Фото товара', 'Выберите источник', [
        {
          text: 'Камера',
          onPress: () => requestAnimationFrame(() => setShowFullCamera(true)),
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
                allowsEditing: false,
                quality: 0.5,
              });
              if (!result.canceled && result.assets && result.assets.length > 0) {
                setItemData(prev => ({ ...prev, image: result.assets[0].uri }));
              }
            } catch (error) {
              Alert.alert('Ошибка', 'Не удалось выбрать фото');
            }
          },
        },
        { text: 'Отмена', style: 'cancel' },
      ]);
    } catch (e) {
    }
  };

  const saveResult = useCallback((result) => {
    const bc = currentBarcodeRef.current;
    const ps = stateRef.current.itemData;

    // 5. OPTIMISTIC UI: Perform 1 single state update unblocking rendering operations
    setShowModal(false);
    setScanned(false);
    setIsScanningActive(false);
    setCurrentBarcode(null);
    currentBarcodeRef.current = null;
    setItemData(initialItemData);

    if (bc) {
      const productData = {
        name: ps.name.trim() || undefined,
        image: ps.image || undefined,
        notes: ps.notes.trim(),
      };

      // Optimistically keep the local cache synced for immediate re-scans
      setSavedResults(prev => ({
        ...prev,
        [bc]: { result, productName: productData.name, imageUrl: productData.image, notes: productData.notes, scannedAt: Date.now() }
      }));

      // Push all cross-screen updates and File System I/O to the service in the background
      ProductService.saveProductBackground(bc, result, productData, stateRef.current.savedResults);
    }
  }, []);

  const finishSwipe = useCallback((verdict) => {
    saveResult(verdict);
  }, [saveResult]);

  const triggerSwipeAnimation = useCallback((verdict) => {
    if (verdict === 'like') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const targetX = verdict === 'like' ? width * 1.5 : -width * 1.5;
    translateX.value = withSpring(targetX, { damping: 20, stiffness: 90 }, (finished) => {
      if (finished) {
        runOnJS(finishSwipe)(verdict);
      }
    });
  }, [translateX, finishSwipe]);

  const handleSwipeComplete = useCallback((verdict) => {
    const itemBarcode = currentBarcodeRef.current;
    const itemExists = stateRef.current.savedResults[itemBarcode];

    if (itemExists && itemExists.result !== verdict) {
      Alert.alert(
        'Изменить решение?',
        `Вы ранее отметили этот товар как "${itemExists.result}". Изменить на "${verdict}"?`,
        [
          {
            text: 'Отмена',
            style: 'cancel',
            onPress: () => {
              translateX.value = withSpring(0);
              translateY.value = withSpring(0);
            },
          },
          {
            text: 'Подтвердить',
            onPress: () => {
              triggerSwipeAnimation(verdict);
            },
          },
        ]
      );
    } else {
      triggerSwipeAnimation(verdict);
    }
  }, [translateX, translateY, triggerSwipeAnimation]);

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
        runOnJS(handleSwipeComplete)(direction);
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

  const closeModal = useCallback(() => {
    Haptics.selectionAsync();
    setShowFullCamera(false);
    setShowModal(false);
    setScanned(false);
    setIsScanningActive(false); // Require manual scan trigger when modal is closed
    setCurrentBarcode(null);
    currentBarcodeRef.current = null;
    setItemData(initialItemData);
    translateX.value = 0;
    translateY.value = 0;
  }, [translateX, translateY]);

  if (!permission) {
    return (
      <View style={[styles.container, styles.placeholderContainer, { backgroundColor: '#EBEBEB' }]}>
        <Text style={styles.placeholderText}>Проверка разрешений…</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.placeholderContainer, { backgroundColor: '#EBEBEB' }]}>
        <Text style={styles.permissionText}>Для сканирования штрихкодов нужен доступ к камере</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Разрешить камеру</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {cameraComponent}

      {navBarComponent}

      {/* Flash Overlay */}
      {isFlashing && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: 0.5, zIndex: 2000 }]}
          pointerEvents="none"
        />
      )}

      {barcodeResult && currentBarcode && (
        <View style={[styles.resultOverlay, { zIndex: 10 }]}>
          <BlurView intensity={70} tint="dark" style={styles.glassPanel}>
            <View style={styles.resultCardInner}>
              <Text style={styles.resultBarcodeText}>{currentBarcode}</Text>
              <View style={styles.resultBadge}>
                <Text style={styles.resultText}>
                  {barcodeResult === 'like' ? 'Like' : 'Dislike'}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      )}

      {showModal && !showFullCamera && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={20}
          style={styles.modalOverlay}
        >
          <View style={styles.modalBackdrop}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          </View>

          <GestureDetector gesture={pan}>
            <Animated.View 
              style={[
                styles.modalContentWrap, 
                rCardStyle,
              ]}
              collapsable={false}
            >
              <BlurView intensity={70} tint="dark" style={styles.modalContent}>
                <ScrollView
                  style={{ width: '100%' }}
                  contentContainerStyle={{ alignItems: 'center' }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
              <View style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                marginTop: 10,
                alignSelf: 'center'
              }} />
              <Text style={styles.modalTitle}>Штрихкод обнаружен</Text>
              <View style={styles.modalImageRow}>
                <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowFullCamera(true))} activeOpacity={0.8}>
                  <ProductImage imageUrl={itemData.image} size={IMAGE_SIZE} />
                  <View style={styles.editBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
                {itemData.loading && (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="small" color="#E0E0E0" />
                  </View>
                )}
              </View>
              <TextInput
                style={styles.nameInput}
                value={itemData.name}
                onChangeText={(text) => setItemData(prev => ({ ...prev, name: text }))}
                placeholder="Название товара"
                placeholderTextColor="rgba(255, 255, 255, 0.5)"
                multiline
              />
              {itemData.verdict && (
                <View style={styles.verdictContainer}>
                  <View style={styles.circularIcon}>
                    <Ionicons 
                      name={itemData.verdict === 'like' ? 'thumbs-up' : 'thumbs-down'} 
                      size={20} 
                      color="#E0E0E0" 
                    />
                  </View>
                  {itemData.date && (
                    <Text style={styles.dateText}>Added on: {itemData.date}</Text>
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
                placeholderTextColor="rgba(255, 255, 255, 0.5)"
                value={itemData.notes}
                onChangeText={(text) => setItemData(prev => ({ ...prev, notes: text }))}
                multiline
                maxLength={300}
              />
              <ActionButtons onSwipeComplete={handleSwipeComplete} />
                </ScrollView>
              </BlurView>
          </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      )}

      {showFullCamera && (
        <View style={styles.fullCameraOverlay}>
          
          <View style={styles.captureContainer}>
            <TouchableOpacity style={styles.roundCaptureBtn} onPress={takePhoto} activeOpacity={0.8}>
              <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
              <Ionicons name="camera" size={32} color="#E0E0E0" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#E0E0E0', fontSize: 18 },
  permissionText: {
    color: '#E0E0E0',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  permissionButtonText: {
    color: '#E0E0E0',
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
  glassPanel: {
    overflow: 'hidden',
    borderRadius: 24,
    padding: 28,
    minWidth: width * 0.8,
    borderWidth: 0.5,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  resultCardInner: { alignItems: 'center' },
  resultBarcodeText: {
    color: '#E0E0E0',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  resultBadge: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    borderWidth: 0.5,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  resultText: {
    color: '#E0E0E0',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modalContentWrap: {
    width: width * 0.9,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'visible',
    position: 'relative',
  },
  modalContent: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 0.5,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  modalTitle: {
    color: '#E0E0E0',
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
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 120,
    aspectRatio: 3 / 4,
  },
  placeholderImage: {
    borderRadius: 24,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    width: 120,
    aspectRatio: 3 / 4,
  },
  nameInput: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 12,
    padding: 12,
    color: '#E0E0E0',
    fontSize: 18,
    fontWeight: '600',
    width: '100%',
    marginBottom: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  editBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 12,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  modalBarcodeSmall: {
    color: '#E0E0E0',
    fontSize: 14,
    marginBottom: 16,
  },
  notesLabel: {
    color: '#E0E0E0',
    fontSize: 14,
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  notesInput: {
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderRadius: 14,
    padding: 12,
    color: '#E0E0E0',
    fontSize: 16,
    minHeight: 56,
    maxHeight: 100,
    width: '100%',
    marginBottom: 20,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  cameraActive: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
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
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  dateText: {
    color: '#E0E0E0',
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
    borderColor: 'rgba(80, 80, 85, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
  },
  focusFrame: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 8,
    top: 0,
    left: 0,
  },
  modalCameraContainer: {
    width: 120,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  shutterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(0,0,0,0.2)',
    marginBottom: 10,
    zIndex: 10,
  },
  fullCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
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
  captureContainer: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
  },
  roundCaptureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(80, 80, 85, 0.3)',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cancelCameraBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
  cancelCameraText: {
    color: '#fff',
    fontWeight: '600',
  },
  navBarContainer: {
    position: 'absolute',
    bottom: 30,
    width: '92%',
    height: 80,
    alignSelf: 'center',
    borderRadius: 40,
    overflow: 'hidden',
    zIndex: 50,
  },
  navBarBlur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(40, 40, 45, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(80, 80, 85, 0.3)',
  },
  navIconBtn: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainScanBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(40, 40, 45, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  mainScanBtnActive: {
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
  },
});
