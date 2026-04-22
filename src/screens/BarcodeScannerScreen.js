import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useHardwareBarcodeWedge } from '../hooks/useHardwareBarcodeWedge';

const BarcodeScannerScreen = ({ route, navigation }) => {
  const {
    orderId,
    itemId,
    expectedBarcode,
    itemName,
    requiredQuantity = 1,
    scanWithCamera = false,
  } = route.params || {};
  const [scanned, setScanned] = useState(false);
  const [pickedQuantity, setPickedQuantity] = useState(1);
  const [showQuantitySelector, setShowQuantitySelector] = useState(false);
  const [wedgeResume, setWedgeResume] = useState(0);
  const cameraRef = useRef(null);
  const scanLockRef = useRef(false);
  const successAlertOpenRef = useRef(false);
  const handleScannedValueRef = useRef(() => {});

  // camera permissions (must run before wedge hook so `permission` is defined)
  const [permission, requestPermission] = useCameraPermissions();

  const wedgeEnabled = permission != null && !scanned;

  const { hardwareInputProps, focusCapture } = useHardwareBarcodeWedge({
    onBarcode: (data) => handleScannedValueRef.current(data),
    enabled: wedgeEnabled,
    resumeToken: wedgeResume,
  });

  const resetScanner = () => {
    scanLockRef.current = false;
    successAlertOpenRef.current = false;
    setScanned(false);
    setPickedQuantity(1);
    setShowQuantitySelector(false);
    setWedgeResume((k) => k + 1);
  };

  // Reset scanner state when itemId changes (for multi-item scanning)
  useEffect(() => {
    resetScanner();
  }, [itemId]);

  // Only prompt for camera when the user explicitly chose "Camera" on the picking screen.
  useEffect(() => {
    if (scanWithCamera && permission && !permission.granted) {
      requestPermission();
    }
  }, [scanWithCamera, permission, requestPermission]);

  const handleScannedValue = (rawData) => {
    if (scanLockRef.current || successAlertOpenRef.current) {
      return;
    }
    const data = String(rawData || '').trim();
    if (!data) {
      return;
    }

    scanLockRef.current = true;
    setScanned(true);
    Vibration.vibrate();

    if (data === expectedBarcode) {
      if (requiredQuantity > 1) {
        setShowQuantitySelector(true);
      } else {
        confirmScan(1, data);
      }
    } else {
      Alert.alert(
        'Wrong Item',
        `❌ This barcode doesn't match ${itemName}.\n\nExpected: ${expectedBarcode}\nScanned: ${data}`,
        [
          { text: 'Try Again', onPress: () => resetScanner() },
          { text: 'Cancel', onPress: () => navigation.goBack() },
        ]
      );
    }
  };

  handleScannedValueRef.current = handleScannedValue;

  const handleBarCodeScanned = ({ data }) => {
    handleScannedValue(data);
  };

  const confirmScan = (quantity, scannedData) => {
    if (successAlertOpenRef.current) {
      return;
    }

    successAlertOpenRef.current = true;
    Alert.alert(
      'Success!',
      `✅ ${itemName} scanned successfully!\nQuantity picked: ${quantity}${requiredQuantity > 1 ? ` of ${requiredQuantity}` : ''}`,
      [
        {
          text: 'OK',
          onPress: () => {
            if (route.params.onScanSuccess) {
              route.params.onScanSuccess(scannedData || expectedBarcode, quantity);
            }
            setTimeout(() => {
              if (orderId) {
                navigation.navigate({
                  name: 'OrderPicking',
                  params: { orderId, scanSuccess: true },
                  merge: true,
                });
              } else if (navigation.canGoBack && navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('OrdersList');
              }
            }, 200); // Delay navigation to allow alert to close
          },
        },
      ]
    );
  };

  const increaseQuantity = () => {
    if (pickedQuantity < requiredQuantity) {
      setPickedQuantity(pickedQuantity + 1);
    }
  };

  const decreaseQuantity = () => {
    if (pickedQuantity > 1) {
      setPickedQuantity(pickedQuantity - 1);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Dismiss soft keyboard from Order Picking (search fields, etc.) before wedge focus.
      Keyboard.dismiss();
      const t = setTimeout(() => {
        // focusCapture no-ops when wedge is disabled (e.g. permission still loading).
        focusCapture();
      }, 60);
      return () => clearTimeout(t);
    }, [focusCapture])
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TextInput {...hardwareInputProps} />

      {!permission.granted ? (
        <View style={styles.permissionContainer}>
          <Ionicons name={scanWithCamera ? 'camera-outline' : 'barcode-outline'} size={64} color="#666" />
          <Text style={styles.permissionItemTitle}>{itemName}</Text>
          {scanWithCamera ? (
            <>
              <Text style={styles.permissionHint}>
                Camera is used to scan this barcode. Allow access to continue, or go back and use the handheld scanner on the picking list instead.
              </Text>
              <TouchableOpacity style={styles.button} onPress={requestPermission}>
                <Text style={styles.buttonText}>Allow camera</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.permissionHint}>
                Your handheld scanner is active here — pull the trigger to scan. You do not need the camera.
              </Text>
              <Text style={styles.message}>Use the phone camera only if you do not have a scanner.</Text>
              <TouchableOpacity style={styles.button} onPress={requestPermission}>
                <Text style={styles.buttonText}>Use phone camera</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, styles.permissionCancel]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Barcode</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.instructionContainer}>
        <Text style={styles.instructionTitle}>Scanning for:</Text>
        <Text style={styles.itemName}>{itemName}</Text>
        {requiredQuantity > 1 && (
          <Text style={styles.quantityText}>Required: {requiredQuantity} items</Text>
        )}
        <Text style={styles.instructionText}>
          {scanWithCamera
            ? 'Point the camera at the barcode, or scan with your handheld scanner.'
            : 'Use your handheld scanner, or point the camera at the barcode.'}
        </Text>
      </View>

      <View style={styles.scannerContainer}>
        <CameraView
          ref={cameraRef}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={styles.scanner}
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'code39',
              'code128',
              'qr',
            ],
          }}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </View>

      <View style={styles.bottomContainer}>
        {showQuantitySelector && (
          <View style={styles.quantitySelectorContainer}>
            <Text style={styles.quantitySelectorTitle}>How many did you pick?</Text>
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={[styles.quantityButton, pickedQuantity <= 1 && styles.quantityButtonDisabled]}
                onPress={decreaseQuantity}
                disabled={pickedQuantity <= 1}
              >
                <Ionicons name="remove" size={24} color={pickedQuantity <= 1 ? "#666" : "#FFFFFF"} />
              </TouchableOpacity>
              <View style={styles.quantityDisplay}>
                <Text style={styles.quantityNumber}>{pickedQuantity}</Text>
                <Text style={styles.quantityLabel}>of {requiredQuantity}</Text>
              </View>
              <TouchableOpacity
                style={[styles.quantityButton, pickedQuantity >= requiredQuantity && styles.quantityButtonDisabled]}
                onPress={increaseQuantity}
                disabled={pickedQuantity >= requiredQuantity}
              >
                <Ionicons name="add" size={24} color={pickedQuantity >= requiredQuantity ? "#666" : "#FFFFFF"} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => confirmScan(pickedQuantity)}
            >
              <Text style={styles.buttonText}>Confirm Quantity</Text>
            </TouchableOpacity>
          </View>
        )}
        {scanned && !showQuantitySelector && (
          <TouchableOpacity
            style={styles.button}
            onPress={resetScanner}
          >
            <Text style={styles.buttonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
        </TouchableOpacity>
      </View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // 🔹 your same styles (unchanged) 🔹
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.8)' },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  placeholder: { width: 40 },
  instructionContainer: { padding: 20, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center' },
  instructionTitle: { fontSize: 16, color: '#CCCCCC', marginBottom: 4 },
  itemName: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  quantityText: { fontSize: 16, color: '#FFD700', fontWeight: '600', marginBottom: 4 },
  instructionText: { fontSize: 14, color: '#CCCCCC', textAlign: 'center' },
  permissionHint: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  permissionCancel: { marginTop: 12 },
  permissionItemTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  scannerContainer: { flex: 1, position: 'relative' },
  scanner: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: '#00FF00', borderRadius: 12, backgroundColor: 'transparent' },
  bottomContainer: { padding: 20, backgroundColor: 'rgba(0,0,0,0.8)', gap: 12 },
  button: { backgroundColor: '#007AFF', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, alignItems: 'center' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#666' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButtonText: { color: '#CCCCCC' },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  message: { fontSize: 16, color: '#CCCCCC', textAlign: 'center', marginVertical: 20 },
  quantitySelectorContainer: { backgroundColor: 'rgba(0, 0, 0, 0.9)', padding: 20, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  quantitySelectorTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginBottom: 16, textAlign: 'center' },
  quantityControls: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 20 },
  quantityButton: { backgroundColor: '#007AFF', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  quantityButtonDisabled: { backgroundColor: '#333' },
  quantityDisplay: { alignItems: 'center', minWidth: 80 },
  quantityNumber: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  quantityLabel: { fontSize: 14, color: '#CCCCCC', marginTop: 4 },
  confirmButton: { backgroundColor: '#34C759', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, alignItems: 'center', minWidth: 200 },
});

export default BarcodeScannerScreen;
