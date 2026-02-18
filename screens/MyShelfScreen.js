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
import {
  loadBarcodeResults,
  removeBarcodeResult,
  clearAllBarcodeResults,
  updateBarcodeNotes,
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
  const [editModal, setEditModal] = useState({ visible: false, barcode: null, notes: '' });

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

  const handleDelete = (barcode) => {
    Alert.alert(
      'Удалить?',
      `Удалить товар из истории?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            const next = await removeBarcodeResult(barcode, rawResults);
            setRawResults(next);
            setItems((prev) => prev.filter((i) => i.barcode !== barcode));
          },
        },
      ]
    );
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

  const openEditNotes = (item) => {
    setEditModal({
      visible: true,
      barcode: item.barcode,
      notes: item.notes || '',
    });
  };

  const saveEditNotes = async () => {
    const { barcode, notes } = editModal;
    if (barcode == null) return;
    const next = await updateBarcodeNotes(barcode, notes, rawResults);
    setRawResults(next);
    setItems((prev) =>
      prev.map((i) => (i.barcode === barcode ? { ...i, notes: notes || '' } : i))
    );
    setEditModal({ visible: false, barcode: null, notes: '' });
  };

  const renderItem = ({ item, index }) => {
    const displayName = getDisplayName(item) || item.barcode;
    return (
      <AnimatedCard index={index}>
        <TouchableOpacity
          style={styles.cardWrap}
          onPress={() => openEditNotes(item)}
          activeOpacity={0.9}
        >
          <BlurView intensity={55} tint="dark" style={styles.card}>
            <ProductImage imageUrl={item.imageUrl} size={CARD_IMAGE_SIZE} />
            <View style={styles.cardContent}>
              <Text style={styles.productName} numberOfLines={2}>
                {displayName}
              </Text>
              {item.notes ? (
                <Text style={styles.notes} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : (
                <Text style={styles.notesPlaceholder}>Нажмите, чтобы добавить заметку</Text>
              )}
              <View style={styles.row}>
                <View style={[styles.badge, item.result === 'like' ? styles.badgeLike : styles.badgeDislike]}>
                  <Text style={styles.badgeText}>{item.result === 'like' ? 'Лайк' : 'Дизлайк'}</Text>
                </View>
                <Text style={styles.date}>{formatDate(item.scannedAt)}</Text>
              </View>
              {displayName === item.barcode ? null : (
                <Text style={styles.barcodeSmall}>Штрихкод: {item.barcode}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item.barcode);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="trash-outline" size={22} color="#f44336" />
            </TouchableOpacity>
          </BlurView>
        </TouchableOpacity>
      </AnimatedCard>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }}>
      <View style={styles.header}>
        <Text style={styles.title}>Моя Полка</Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearAll} activeOpacity={0.8}>
          <Text style={styles.clearButtonText}>Очистить всё</Text>
        </TouchableOpacity>
      </View>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Пока нет сохранённых товаров</Text>
          <Text style={styles.emptySubtext}>Сканируйте штрихкоды во вкладке «Сканер»</Text>
        </View>
      ) : (
        <FlatList
          data={items}
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
              <Text style={styles.editModalTitle}>Редактировать заметку</Text>
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
                  onPress={() => setEditModal({ visible: false, barcode: null, notes: '' })}
                >
                  <Text style={styles.editModalBtnText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editModalBtn, styles.editModalBtnSave]}
                  onPress={saveEditNotes}
                >
                  <Text style={styles.editModalBtnText}>Сохранить</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
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
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  cardWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    overflow: 'hidden',
    borderRadius: 18,
  },
  cardImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginRight: 14,
  },
  placeholderImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardContent: { flex: 1 },
  productName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  notes: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    marginBottom: 6,
    lineHeight: 20,
  },
  notesPlaceholder: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginBottom: 6,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeLike: { backgroundColor: 'rgba(76, 175, 80, 0.9)' },
  badgeDislike: { backgroundColor: 'rgba(244, 67, 54, 0.9)' },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  date: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  barcodeSmall: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    padding: 6,
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
