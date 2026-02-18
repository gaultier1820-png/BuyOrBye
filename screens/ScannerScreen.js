import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Alert,
  Dimensions,
  Animated,
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
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [savedResults, setSavedResults] = useState({});
  const [productInfo, setProductInfo] = useState({ name: '', image: null });
  const [productLoading, setProductLoading] = useState(false);
  const [modalNotes, setModalNotes] = useState('');
  const modalOpacity = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      loadSavedResults();
    }, [])
  );

  const loadSavedResults = async () => {
    const data = await loadBarcodeResults();
    setSavedResults(data);
  };

  const getResultValue = (entry) => {
    if (!entry) return null;
    return typeof entry === 'string' ? entry : entry.result;
  };

  const handleBarCodeScanned = async ({ data, bounds }) => {
    const frameLeft = (width - 280) / 2;
    const frameTop = (height - 180) / 2;
    const frameRight = frameLeft + 280;
    const frameBottom = frameTop + 180;
    const centerX = bounds.origin.x + bounds.size.width / 2;
    const centerY = bounds.origin.y + bounds.size.height / 2;
    // Expanded logic area (buffer) to improve sensitivity
    const buffer = 40;
    if (centerX < frameLeft - buffer || centerX > frameRight + buffer || centerY < frameTop - buffer || centerY > frameBottom + buffer) {
      return;
    }
    if (scanned) return;

    // Check if already saved (using most recent data)
    const saved = savedResults[data];
    const resultValue = getResultValue(saved);

    if (resultValue) {
      setScanned(true);
      setCurrentBarcode(data);
      setBarcodeResult(resultValue);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => {
        setScanned(false);
        setBarcodeResult(null);
        setCurrentBarcode(null);
      }, 2000);
      return;
    }

    // Not saved: fetch and show modal
    setScanned(true);
    setCurrentBarcode(data);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    setProductLoading(true);
    setProductInfo({ name: '', image: null });
    setModalNotes('');
    setShowModal(true);
    modalOpacity.setValue(1);

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${data}.json`);
      const json = await response.json();
      const product = json.product;
      const name = product?.product_name || product?.product_name_en || `Product ${data}`;
      const image = product?.image_front_url || product?.image_url || null;
      setProductInfo({ name, image });
    } catch (error) {
      setProductInfo({ name: `Product ${data}`, image: null });
    } finally {
      setProductLoading(false);
    }
  };

  const saveResult = async (result) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const newResults = await saveBarcodeResult(currentBarcode, result, savedResults, {
        productName: productInfo.name || undefined,
        imageUrl: productInfo.image || undefined,
        notes: modalNotes.trim(),
      });
      setSavedResults(newResults);
      Alert.alert('Сохранено', `Выбор "${result === 'like' ? 'Like' : 'Dislike'}" сохранен`, [{ text: 'OK' }]);
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShowModal(false);
        setScanned(false);
        setCurrentBarcode(null);
        setModalNotes('');
        setProductInfo({ name: '', image: null });
        modalOpacity.setValue(1);
      });
    } catch (error) {
      console.error('Error saving result:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить результат');
    }
  };

  const closeModal = () => {
    Animated.timing(modalOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowModal(false);
      setScanned(false);
      setCurrentBarcode(null);
      setModalNotes('');
      setProductInfo({ name: '', image: null });
      modalOpacity.setValue(1);
    });
  };

  const modalDisplayName = productLoading
    ? 'Загрузка…'
    : productInfo.name || currentBarcode;

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
    <View style={styles.container}>
      <CameraView
        style={[styles.camera, StyleSheet.absoluteFillObject]}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
        }}
      />
      <View style={styles.cameraOverlay}>
        <View style={styles.topMask} />
        <View style={styles.middleContainer}>
          <View style={styles.leftMask} />
          <View style={styles.focusedContainer}>
            <Text style={styles.holeText}>Наведите камеру на штрихкод</Text>
          </View>
          <View style={styles.rightMask} />
        </View>
        <View style={styles.bottomMask} />
      </View>
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
      {!barcodeResult && (
        <View style={styles.instructionOverlay}>
          <BlurView intensity={50} tint="dark" style={styles.glassPill}>
            <Text style={styles.instructionText}>Наведите камеру на штрихкод</Text>
          </BlurView>
        </View>
      )}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={closeModal}>
        <Animated.View style={[styles.modalOverlay, { opacity: modalOpacity }]}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.modalContentWrap, { opacity: modalOpacity }]}>
            <BlurView intensity={70} tint="dark" style={styles.modalContent}>
              <Text style={styles.modalTitle}>Штрихкод обнаружен</Text>
              <View style={styles.modalImageRow}>
                <ProductImage imageUrl={productInfo.image} size={IMAGE_SIZE} />
                {productLoading && (
                  <View style={styles.loaderWrap}>
                    <ActivityIndicator size="small" color="#4CAF50" />
                  </View>
                )}
              </View>
              <Text style={styles.modalProductName} numberOfLines={3}>
                {modalDisplayName}
              </Text>
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
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.likeButton]}
                  onPress={() => saveResult('like')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonText}>Like</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.dislikeButton]}
                  onPress={() => saveResult('dislike')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonText}>Dislike</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Animated.View>
        </Animated.View>
      </Modal>
      <StatusBar style="light" />
    </View>
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
  instructionOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  glassPill: {
    overflow: 'hidden',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  instructionText: {
    color: '#fff',
    fontSize: 18,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContentWrap: {
    width: width * 0.9,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
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
  modalProductName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 8,
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
  buttonContainer: { width: '100%', gap: 16 },
  button: {
    paddingVertical: 24,
    paddingHorizontal: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  likeButton: { backgroundColor: 'rgba(76, 175, 80, 0.85)' },
  dislikeButton: { backgroundColor: 'rgba(244, 67, 54, 0.85)' },
  buttonText: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topMask: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleContainer: {
    flexDirection: 'row',
    height: 180,
    width: '100%',
  },
  leftMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  focusedContainer: {
    width: 280,
    height: 180,
    borderWidth: 2,
    borderColor: '#00FF00',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  rightMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bottomMask: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  holeText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
