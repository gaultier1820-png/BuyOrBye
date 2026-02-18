import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'barcodeResults';

/**
 * Нормализует значение из хранилища (поддержка старого формата).
 */
function normalizeEntry(value) {
  const base = {
    result: 'like',
    scannedAt: 0,
    productName: undefined,
    brand: undefined,
    notes: '',
    imageUrl: undefined,
  };
  if (typeof value === 'string') {
    return { ...base, result: value };
  }
  if (value && typeof value === 'object') {
    if (value.result === 'like' || value.result === 'dislike') {
      return {
        result: value.result,
        scannedAt: typeof value.scannedAt === 'number' ? value.scannedAt : 0,
        productName: value.productName != null ? String(value.productName) : undefined,
        brand: value.brand != null ? String(value.brand) : undefined,
        notes: value.notes != null ? String(value.notes) : '',
        imageUrl: value.imageUrl != null ? String(value.imageUrl) : undefined,
      };
    }
  }
  return base;
}

/**
 * Загружает все сохранённые результаты.
 */
export async function loadBarcodeResults() {
  try {
    const data = await AsyncStorage.getItem(KEY);
    if (!data) return {};
    const raw = JSON.parse(data);
    const out = {};
    for (const [barcode, value] of Object.entries(raw)) {
      out[barcode] = normalizeEntry(value);
    }
    return out;
  } catch (e) {
    console.error('loadBarcodeResults:', e);
    return {};
  }
}

/**
 * Сохраняет результат по штрихкоду (с текущим временем, названием, брендом, заметками).
 */
export async function saveBarcodeResult(barcode, result, currentResults, options = {}) {
  const { productName, brand, notes = '', imageUrl } = options;
  const next = {
    ...currentResults,
    [barcode]: {
      result,
      scannedAt: Date.now(),
      ...(productName != null && { productName: String(productName) }),
      ...(brand != null && { brand: String(brand) }),
      notes: notes != null ? String(notes) : '',
      ...(imageUrl != null && imageUrl !== '' && { imageUrl: String(imageUrl) }),
    },
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/**
 * Обновляет только заметку по штрихкоду.
 */
export async function updateBarcodeNotes(barcode, notes, currentResults) {
  const existing = currentResults[barcode];
  const entry = existing ? normalizeEntry(existing) : { result: 'like', scannedAt: 0, notes: '' };
  const next = {
    ...currentResults,
    [barcode]: {
      ...entry,
      notes: notes != null ? String(notes) : '',
    },
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/**
 * Удаляет один штрихкод из хранилища.
 */
export async function removeBarcodeResult(barcode, currentResults) {
  const next = { ...currentResults };
  delete next[barcode];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/**
 * Очищает всю историю.
 */
export async function clearAllBarcodeResults() {
  await AsyncStorage.setItem(KEY, JSON.stringify({}));
  return {};
}
