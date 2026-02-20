import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, TextInput, BackHandler } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  runOnJS
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { saveBarcodeResult, loadBarcodeResults } from '../storage';

const { width, height } = Dimensions.get('window');

export default function ScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState(null);
  
  // Form state
  const [productName, setProductName] = useState('');
  const [notes, setNotes] = useState('');
  const [verdict, setVerdict] = useState('like');

  const translateY = useSharedValue(height);

  useEffect(() => {
    const backAction = () => {
      if (modalVisible) {
        closeModal();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [modalVisible]);

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setCurrentBarcode(data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Reset form
    setProductName('');
    setNotes('');
    setVerdict('like');
    
    openModal();
  };

  const openModal = () => {
    setModalVisible(true);
    translateY.value = withSpring(0, { damping: 15 });
  };

  const closeModal = useCallback(() => {
    translateY.value = withSpring(height, { damping: 15 }, (finished) => {
      if (finished) {
        runOnJS(setModalVisible)(false);
        runOnJS(setScanned)(false);
      }
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSave = async () => {
    if (!currentBarcode) return;
    
    const existing = await loadBarcodeResults();
    await saveBarcodeResult(currentBarcode, verdict, existing, {
      productName: productName || 'Unknown Item',
      notes,
      scannedAt: Date.now(),
    });
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeModal();
  };

  const gesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 150) {
        runOnJS(closeModal)();
      } else {
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#fff', textAlign: 'center', marginTop: 100 }}>No access to camera</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
          <Text style={{ color: '#000' }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      
      <SafeAreaView style={styles.overlay}>
        <Text style={styles.overlayTitle}>Scan a Product</Text>
        <View style={styles.scanFrame} />
      </SafeAreaView>

      {modalVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
           <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />
           <GestureDetector gesture={gesture}>
             <Animated.View style={[styles.modalContainer, animatedStyle]}>
               <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
                 <View style={styles.dragIndicator} />
                 <Text style={styles.barcodeText}>{currentBarcode}</Text>
                 
                 <View style={styles.cardContent}>
                   <View style={styles.imagePlaceholder}>
                     <Ionicons name="cube-outline" size={40} color="rgba(255,255,255,0.3)" />
                   </View>
                   
                   <View style={styles.formContainer}>
                     <TextInput
                       style={styles.input}
                       placeholder="Product Name"
                       placeholderTextColor="rgba(255,255,255,0.4)"
                       value={productName}
                       onChangeText={setProductName}
                     />
                     <View style={styles.verdictRow}>
                       <TouchableOpacity 
                         style={[styles.verdictBtn, verdict === 'like' && styles.likeActive]}
                         onPress={() => setVerdict('like')}
                       >
                         <Ionicons name="thumbs-up" size={20} color={verdict === 'like' ? '#fff' : 'rgba(255,255,255,0.5)'} />
                       </TouchableOpacity>
                       <TouchableOpacity 
                         style={[styles.verdictBtn, verdict === 'dislike' && styles.dislikeActive]}
                         onPress={() => setVerdict('dislike')}
                       >
                         <Ionicons name="thumbs-down" size={20} color={verdict === 'dislike' ? '#fff' : 'rgba(255,255,255,0.5)'} />
                       </TouchableOpacity>
                     </View>
                     <TextInput
                       style={[styles.input, styles.notesInput]}
                       placeholder="Notes..."
                       placeholderTextColor="rgba(255,255,255,0.4)"
                       multiline
                       value={notes}
                       onChangeText={setNotes}
                     />
                   </View>
                 </View>

                 <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                   <Text style={styles.saveBtnText}>Save to Shelf</Text>
                 </TouchableOpacity>
               </BlurView>
             </Animated.View>
           </GestureDetector>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permBtn: { backgroundColor: '#fff', padding: 10, alignSelf: 'center', marginTop: 20, borderRadius: 5 },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 50 },
  overlayTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '600', marginTop: 20 },
  scanFrame: { width: 250, height: 250, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  modalContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.75, borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden' },
  blurContainer: { flex: 1, padding: 20 },
  dragIndicator: { width: 40, height: 5, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  barcodeText: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 15, fontSize: 12 },
  cardContent: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  imagePlaceholder: { width: width * 0.3, aspectRatio: 3/4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  formContainer: { flex: 1, gap: 12 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, color: '#fff', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  notesInput: { height: 80, textAlignVertical: 'top' },
  verdictRow: { flexDirection: 'row', gap: 10 },
  verdictBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  likeActive: { backgroundColor: 'rgba(76, 175, 80, 0.5)', borderColor: '#4CAF50' },
  dislikeActive: { backgroundColor: 'rgba(244, 67, 54, 0.5)', borderColor: '#F44336' },
  saveBtn: { backgroundColor: '#4CAF50', padding: 16, borderRadius: 15, alignItems: 'center', marginTop: 'auto', marginBottom: 20 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});