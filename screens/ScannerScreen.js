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
import * as FileSystem from 'expo-file-system/legacy';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { loadBarcodeResults, saveBarcodeResult } from '../storage';

const { width, height } = Dimensions.get('window');
const IMAGE_SIZE = 120;

function ProductImage({ imageUrl, size = IMAGE_SIZE }) {
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
}

export default function ScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const [scanned, setScanned] = useState(false);
  const [isReadyToScan, setIsReadyToScan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const currentBarcodeRef = useRef(null);
  const cameraRef = useRef(null);
  const fullCameraRef = useRef(null);
  const [showFullCamera, setShowFullCamera] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [savedResults, setSavedResults] = useState({});
  const [editableName, setEditableName] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [productLoading, setProductLoading] = useState(false);
  const [modalNotes, setModalNotes] = useState('');
  const [existingVerdict, setExistingVerdict] = useState(null);
  const [lastScannedDate, setLastScannedDate] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null);
  const insets = useSafeAreaInsets();

  // Reanimated Shared Values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const hapticTriggered = useSharedValue(false);
  const entranceTranslateY = useSharedValue(500);
  const focusOpacity = useSharedValue(0);
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);

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
    navigation.setOptions({ tabBarStyle: { display: "none" } });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

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

  const onBarcodeScanned = async ({ type, data }) => {
    if (!isReadyToScan) return;
    setIsReadyToScan(false);
    setScanned(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Check if already saved (using most recent data)
    const saved = savedResults[data];

    setCurrentBarcode(data);
    currentBarcodeRef.current = data;

    if (saved) {
      // Local Hit
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

  const takePhoto = async () => {
    if (fullCameraRef.current) {
      try {
        const photo = await fullCameraRef.current.takePictureAsync({
          quality: 0.8,
        });
        if (photo.uri) {
          const permanentUri = FileSystem.documentDirectory + Date.now() + '.jpg';
          await FileSystem.copyAsync({ from: photo.uri, to: permanentUri });
          setSelectedImage(permanentUri);
          setShowFullCamera(false);
        }
      } catch (error) {
        console.log('Error taking photo:', error);
        Alert.alert('Ошибка', 'Не удалось сделать фото');
      }
    }
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
              console.log('Requesting gallery permissions...');
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Ошибка', 'Нужен доступ к галерее');
                return;
              }
              console.log('Launching gallery...');
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: false,
                quality: 0.5,
              });
              console.log('Gallery result:', result);
              if (!result.canceled && result.assets && result.assets.length > 0) {
                const fileName = Date.now() + '.jpg';
                const permanentUri = FileSystem.documentDirectory + fileName;
                await FileSystem.copyAsync({ from: result.assets[0].uri, to: permanentUri });
                setSelectedImage(permanentUri);
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
    setShowFullCamera(false);
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
      {/* 1. Full Screen Camera */}
      {isFocused && (
        <CameraView
          key={isFocused ? 'active' : 'inactive'}
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a'],
          }}
          focusPoint={focusPoint}
        />
      )}

      <GestureDetector gesture={tapGesture}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      
      <Animated.View style={[styles.focusFrame, rFocusStyle]} pointerEvents="none" />

      {/* Flash Overlay */}
      {isFlashing && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'white', opacity: 0.5, zIndex: 2000 }]}
          pointerEvents="none"
        />
      )}

      {barcodeResult && currentBarcode && (
        <View style={[styles.resultOverlay, { zIndex: 10 }]}>
          <BlurView intensity={65} tint="light" style={styles.glassPanel}>
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

      {/* 2. UI Overlay (One Single Layer) */}
      {!showModal && !showFullCamera && (
        <View style={styles.floatingIsland}>
          <BlurView intensity={65} tint="light" style={StyleSheet.absoluteFill} />
          
          <TouchableOpacity style={styles.navButton} disabled>
            <Ionicons name="scan-circle" size={32} color="rgba(47, 79, 79, 0.5)" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.navButton}
            activeOpacity={0.7}
            onPress={() => {
              setScanned(false);
              setBarcodeResult(null);
              setCurrentBarcode(null);
              setIsReadyToScan(true);
            }}
          >
            <Ionicons name="camera-outline" size={32} color="#2F4F4F" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('MyShelf', { screen: 'ShelfList' })}>
            <Ionicons name="library-outline" size={32} color="#2F4F4F" />
          </TouchableOpacity>
        </View>
      )}

      {showModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBackdrop}>
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          </View>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.modalContentWrap, rCardStyle]}>
            <BlurView intensity={65} tint="light" style={styles.modalContent}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ width: '100%' }}
              >
                <ScrollView
                  contentContainerStyle={{ alignItems: 'center' }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
              <View style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: 'rgba(47, 79, 79, 0.2)',
                marginTop: 10,
                alignSelf: 'center'
              }} />
              <Text style={styles.modalTitle}>Штрихкод обнаружен</Text>
              <View style={styles.modalImageRow}>
                <TouchableOpacity onPress={() => setShowFullCamera(true)} activeOpacity={0.8}>
                  <ProductImage imageUrl={selectedImage} size={IMAGE_SIZE} />
                  <View style={styles.editBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </TouchableOpacity>
                {productLoading && (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="small" color="#2F4F4F" />
                  </View>
                )}
              </View>
              <TextInput
                style={styles.nameInput}
                value={editableName}
                onChangeText={setEditableName}
                placeholder="Название товара"
                placeholderTextColor="rgba(47, 79, 79, 0.5)"
                multiline
              />
              {existingVerdict && (
                <View style={styles.verdictContainer}>
                  <View style={styles.circularIcon}>
                    <Ionicons 
                      name={existingVerdict === 'like' ? 'thumbs-up' : 'thumbs-down'} 
                      size={20} 
                      color="#2F4F4F" 
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
                placeholderTextColor="rgba(47, 79, 79, 0.5)"
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
                  <MaterialCommunityIcons name="thumb-down-outline" size={28} color="#2F4F4F" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleSwipeComplete('like')}
                >
                  <MaterialCommunityIcons name="thumb-up-outline" size={28} color="#2F4F4F" />
                </TouchableOpacity>
              </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </BlurView>
          </Animated.View>
          </GestureDetector>
        </View>
      )}

      {showFullCamera && (
        <View style={styles.fullCameraOverlay}>
          {isFocused && (
            <CameraView
              key={isFocused ? 'rephoto-active' : 'rephoto-inactive'}
              ref={fullCameraRef}
              style={StyleSheet.absoluteFillObject}
              facing="back"
            />
          )}
          
          <View style={styles.captureContainer}>
            <TouchableOpacity style={styles.roundCaptureBtn} onPress={takePhoto}>
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
    backgroundColor: '#EBEBEB',
  },
  placeholderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#2F4F4F', fontSize: 18 },
  permissionText: {
    color: '#2F4F4F',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'silver',
  },
  permissionButtonText: {
    color: '#2F4F4F',
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
    borderColor: 'silver',
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
  },
  resultCardInner: { alignItems: 'center' },
  resultBarcodeText: {
    color: '#2F4F4F',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  resultBadge: {
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    borderWidth: 0.5,
    borderColor: 'silver',
  },
  resultText: {
    color: '#2F4F4F',
    fontSize: 24,
    fontWeight: 'bold',
  },
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
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    borderWidth: 0.5,
    borderColor: 'silver',
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
  },
  modalTitle: {
    color: '#2F4F4F',
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
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'silver',
    width: 120,
    aspectRatio: 3 / 4,
  },
  nameInput: {
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    borderRadius: 12,
    padding: 12,
    color: '#2F4F4F',
    fontSize: 18,
    fontWeight: '600',
    width: '100%',
    marginBottom: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'silver',
  },
  editBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: 'rgba(47, 79, 79, 0.2)',
    borderRadius: 12,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  modalBarcodeSmall: {
    color: '#2F4F4F',
    fontSize: 14,
    marginBottom: 16,
  },
  notesLabel: {
    color: '#2F4F4F',
    fontSize: 14,
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  notesInput: {
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    borderRadius: 14,
    padding: 12,
    color: '#2F4F4F',
    fontSize: 16,
    minHeight: 56,
    maxHeight: 100,
    width: '100%',
    marginBottom: 20,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'silver',
  },
  cameraActive: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  floatingIsland: {
    position: 'absolute',
    bottom: 30,
    width: '90%',
    height: 75,
    alignSelf: 'center',
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    borderRadius: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    overflow: 'hidden',
    zIndex: 100,
    borderWidth: 0.5,
    borderColor: 'silver',
  },
  navButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
    borderColor: '#2F4F4F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  dateText: {
    color: '#2F4F4F',
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
    borderColor: 'silver',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
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
    borderRadius: 40,
    backgroundColor: 'rgba(220, 220, 225, 0.4)',
    borderWidth: 4,
    borderColor: 'silver',
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
});
