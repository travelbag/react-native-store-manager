import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useHardwareBarcodeWedge } from '../hooks/useHardwareBarcodeWedge';
import { showAppDialog } from '../context/DialogContext';

const BarcodeScannerScreen = ({ route, navigation }) => {
  const {
    orderId,
    itemId,
    expectedBarcode,
    itemName,
    requiredQuantity = 1,
    alreadyPickedQuantity = 0,
    scanWithCamera = false,
  } = route.params || {};
  const requiredQty = Math.max(1, Number(requiredQuantity ?? 1));
  const initialPicked = Math.min(
    requiredQty,
    Math.max(0, Number(alreadyPickedQuantity ?? 0))
  );

  const [scanned, setScanned] = useState(false);
  const [unitsScanned, setUnitsScanned] = useState(initialPicked);
  const [wedgeResume, setWedgeResume] = useState(0);
  const cameraRef = useRef(null);
  const scanLockRef = useRef(false);
  const successAlertOpenRef = useRef(false);
  const handleScannedValueRef = useRef(() => {});
  const unitsScannedRef = useRef(initialPicked);

  // camera permissions (must run before wedge hook so `permission` is defined)
  const [permission, requestPermission] = useCameraPermissions();

  const wedgeEnabled = permission != null && !scanned;

  const { hardwareInputProps, focusCapture } = useHardwareBarcodeWedge({
    onBarcode: (data) => handleScannedValueRef.current(data),
    enabled: wedgeEnabled,
    resumeToken: wedgeResume,
  });

  const unlockForNextUnit = useCallback(() => {
    scanLockRef.current = false;
    setScanned(false);
    setWedgeResume((k) => k + 1);
  }, []);

  const resetScanner = () => {
    scanLockRef.current = false;
    successAlertOpenRef.current = false;
    setScanned(false);
    unitsScannedRef.current = initialPicked;
    setUnitsScanned(initialPicked);
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

  const finishLine = useCallback(
    (quantity, scannedData) => {
      if (successAlertOpenRef.current) {
        return;
      }

      successAlertOpenRef.current = true;
      showAppDialog(
        'Item scanned',
        `${itemName} was scanned successfully.`,
        [
          {
            text: 'OK',
            onPress: () => {
              if (route.params.onScanSuccess) {
                route.params.onScanSuccess(scannedData || expectedBarcode, quantity);
              }
              setTimeout(() => {
                if (orderId) {
                  // Pop scanner off the stack. navigate(OrderPicking) can leave BarcodeScanner
                  // underneath, so Back would reopen the camera.
                  if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.navigate({
                      name: 'OrderPicking',
                      params: { orderId, scanSuccess: true },
                      merge: true,
                    });
                  }
                } else if (navigation.canGoBack && navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('OrdersList');
                }
              }, 200); // Delay navigation to allow the dialog to close
            },
          },
        ],
        {
          variant: 'success',
          icon: 'checkmark-done',
          cancelable: false,
          highlight: {
            icon: 'layers-outline',
            label: 'Quantity picked',
            value: requiredQty > 1 ? `${quantity} of ${requiredQty}` : String(quantity),
          },
        }
      );
    },
    [itemName, expectedBarcode, orderId, navigation, requiredQty, route.params]
  );

  const registerUnitScan = useCallback(
    (scannedData) => {
      const next = Math.min(requiredQty, unitsScannedRef.current + 1);
      unitsScannedRef.current = next;
      setUnitsScanned(next);

      if (typeof route.params?.onScanProgress === 'function' && next < requiredQty) {
        route.params.onScanProgress(scannedData || expectedBarcode, next);
      }

      if (next >= requiredQty) {
        finishLine(next, scannedData);
        return;
      }

      Vibration.vibrate(60);
      // Stay on this screen and require another physical scan for the next unit.
      unlockForNextUnit();
    },
    [requiredQty, expectedBarcode, unlockForNextUnit, finishLine, route.params]
  );

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
      registerUnitScan(data);
    } else {
      showAppDialog(
        'Wrong item',
        `This barcode doesn't match ${itemName}.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Try Again', onPress: () => unlockForNextUnit() },
        ],
        {
          variant: 'error',
          icon: 'barcode-outline',
          cancelable: false,
          details: [
            { label: 'Expected', value: expectedBarcode, icon: 'checkmark-circle-outline' },
            { label: 'Scanned', value: data, icon: 'scan-outline' },
          ],
        }
      );
    }
  };

  handleScannedValueRef.current = handleScannedValue;

  const handleBarCodeScanned = ({ data }) => {
    handleScannedValue(data);
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

  const remaining = Math.max(0, requiredQty - unitsScanned);

  return (
    <SafeAreaView style={styles.container}>
      <TextInput {...hardwareInputProps} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Scan Item</Text>
          <Text style={styles.headerSubtitle}>{itemName}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {!permission.granted ? (
        <View style={styles.permissionContainer}>
          <Ionicons name={scanWithCamera ? 'camera-outline' : 'barcode-outline'} size={64} color="#666" />
          <Text style={styles.message}>
            {scanWithCamera ? (
              <>
                Camera is used to scan this barcode. Allow access to continue, or go back and use the handheld scanner on the picking list instead.
              </>
            ) : (
              <>
                Your handheld scanner is active here — pull the trigger to scan. You do not need the camera.
              </>
            )}
          </Text>
          {scanWithCamera ? (
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Allow Camera</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.message}>Use the phone camera only if you do not have a scanner.</Text>
          )}
        </View>
      ) : (
        <>
          <Text style={styles.instruction}>
            {requiredQty > 1
              ? `Scan each unit separately — ${unitsScanned} of ${requiredQty} done${
                  remaining > 0 ? `, ${remaining} left` : ''
                }.`
              : scanWithCamera
                ? 'Point the camera at the barcode, or scan with your handheld scanner.'
                : 'Use your handheld scanner, or point the camera at the barcode.'}
          </Text>

          {requiredQty > 1 ? (
            <View style={styles.progressBanner}>
              <Ionicons name="layers-outline" size={18} color="#FFFFFF" />
              <Text style={styles.progressBannerText}>
                {unitsScanned}/{requiredQty} scanned
              </Text>
            </View>
          ) : null}

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
                  'code128',
                  'code39',
                  'qr',
                ],
              }}
            />
            <View style={styles.overlay}>
              <View style={styles.scanFrame} />
            </View>
          </View>

          {scanned && !successAlertOpenRef.current && remaining > 0 ? (
            <TouchableOpacity style={styles.rescanButton} onPress={unlockForNextUnit}>
              <Text style={styles.rescanButtonText}>Scan next unit</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  headerInfo: { flex: 1, marginHorizontal: 12 },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: '#CCCCCC', fontSize: 13, marginTop: 2 },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#111',
  },
  message: {
    color: '#CCCCCC',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  permissionButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  instruction: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,122,255,0.35)',
  },
  progressBannerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  scannerContainer: { flex: 1, position: 'relative' },
  scanner: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  rescanButton: {
    margin: 16,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rescanButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});

export default BarcodeScannerScreen;
