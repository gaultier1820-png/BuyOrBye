import * as FileSystem from 'expo-file-system/legacy';
import { DeviceEventEmitter } from 'react-native';
import { loadBarcodeResults, saveBarcodeResult } from '../storage';

export const ProductService = {
  // Фоновое сохранение: возвращает управление UI мгновенно
  async saveProductBackground(barcode, verdict, data, currentSavedResults) {
    const { name, image, notes } = data;

    // 1. Сразу уведомляем "Полку" об изменении (Optimistic Update)
    DeviceEventEmitter.emit('SHELF_OPTIMISTIC_ADD', {
      barcode,
      result: verdict,
      productName: name,
      imageUrl: image,
      notes,
      scannedAt: Date.now(),
    });

    // 2. Уводим тяжелую работу в фон через setTimeout
    setTimeout(async () => {
      try {
        let finalImageUrl = image;

        // Обработка фото (если оно временное с камеры)
        if (image && !image.startsWith(FileSystem.documentDirectory)) {
          const permanentUri = `${FileSystem.documentDirectory}${Date.now()}.jpg`;
          await FileSystem.copyAsync({ from: image, to: permanentUri });
          finalImageUrl = permanentUri;
        }

        // Запись в хранилище
        await saveBarcodeResult(barcode, verdict, currentSavedResults, {
          productName: name,
          imageUrl: finalImageUrl,
          notes,
          dateString: new Date().toLocaleDateString(),
        });

        // Уведомляем, что финальная запись завершена
        DeviceEventEmitter.emit('SHELF_UPDATED');
      } catch (error) {
        console.error("Service: Background save failed", error);
      }
    }, 0);
  }
};