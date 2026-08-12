import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  TextInput,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useHardwareBarcodeWedge } from '../hooks/useHardwareBarcodeWedge';
import ExpiredProductModal from '../components/ExpiredProductModal';
import { resolvePickExpiryState } from '../utils/resolvePickExpiry';
import { showAppDialog } from '../context/DialogContext';
import { confirmExpiringSoonPick } from '../utils/expiryDialog';

const BarcodeScannerScreen = ({ route, navigation }) => {
  const {
    orderId,
    itemId,
    expectedBarcode,
    itemName,
    requiredQuantity = 1,
    alreadyPickedQuantity = 0,
    scanWithCamera = false,
    storeId = null,
    inventoryId: inventoryIdParam = null,
    expiryDate: expiryDateParam = null,
  } = route.params || {};
  const requiredQty = Math.max(1, Number(requiredQuantity ?? 1));
  const initialPicked = Math.min(
    requiredQty,
    Math.max(0, Number(alreadyPickedQuantity ?? 0))
  );

  const [scanned, setScanned] = useState(false);
  const [unitsScanned, setUnitsScanned] = useState(initialPicked);
  const [wedgeResume, setWedgeResume] = useState(0);
  const [checkingExpiry, setCheckingExpiry] = useState(false);
  const [expiredGate, setExpiredGate] = useState(null);
  const cameraRef = useRef(null);
  const scanLockRef = useRef(false);
  const successAlertOpenRef = useRef(false);
  const handleScannedValueRef = useRef(() => {});
  const unitsScannedRef = useRef(initialPicked);

  // camera permissions (must run before wedge hook so `permission` is defined)
  const [permission, requestPermission] = useCameraPermissions();

  const wedgeEnabled = permission != null && !scanned && !checkingExpiry && !expiredGate;

  const { hardwareInputProps, focusCapture } = useHardwareBarcodeWedge({
    onBarcode: (data) => handleScannedValueRef.current(data),
    enabled: wedgeEnabled,
    resumeToken: wedgeResume,
  });

  const unlockForNextUnit = useCallback(() => {
    scanLockRef.current = false;
    setScanned(false);
    setCheckingExpiry(false);
    setWedgeResume((k) => k + 1);
  }, []);

  const resetScanner = () => {
    scanLockRef.current = false;
    successAlertOpenRef.current = false;
    setCheckingExpiry(false);
    setExpiredGate(null);
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

  const promptExpiringSoon = useCallback(
    (payload) =>
      confirmExpiringSoonPick({
        productName: payload.productName || itemName,
        expiryValue: payload.expiryValue,
        alert: payload.alert,
      }),
    [itemName]
  );

  const promptIfExpired = useCallback((payload) => {
    return new Promise((resolve) => {
      setExpiredGate({
        productName: payload.productName,
        expiryValue: payload.expiryValue,
        inventoryId: payload.inventoryId,
        resolve,
      });
    });
  }, []);

  const ensureProductAllowedForScan = useCallback(
    async (barcode) => {
      const expiryState = await resolvePickExpiryState({
        storeId,
        barcode,
        item: {
          barcode: expectedBarcode,
          name: itemName,
          inventory_id: inventoryIdParam,
          inventoryId: inventoryIdParam,
          expiry_date: expiryDateParam,
          expiryDate: expiryDateParam,
        },
      });

      if (expiryState.isExpired) {
        Vibration.vibrate([0, 120, 80, 120]);
        return promptIfExpired({
          productName: itemName || barcode,
          expiryValue: expiryState.expiryValue,
          inventoryId: expiryState.inventoryId || inventoryIdParam,
        });
      }

      if (expiryState.isExpiringSoon && expiryState.alert) {
        Vibration.vibrate([0, 80, 60, 80]);
        return promptExpiringSoon({
          productName: itemName || barcode,
          expiryValue: expiryState.expiryValue,
          alert: expiryState.alert,
        });
      }

      return true;
    },
    [
      storeId,
      expectedBarcode,
      itemName,
      inventoryIdParam,
      expiryDateParam,
      promptIfExpired,
      promptExpiringSoon,
    ]
  );

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

  const proceedAfterExpiryCheck = useCallback(
    async (scannedData) => {
      setCheckingExpiry(true);
      try {
        const allowed = await ensureProductAllowedForScan(scannedData || expectedBarcode);
        if (!allowed) {
          unlockForNextUnit();
          return;
        }
        registerUnitScan(scannedData);
      } finally {
        setCheckingExpiry(false);
      }
    },
    [ensureProductAllowedForScan, expectedBarcode, registerUnitScan, unlockForNextUnit]
  );

  const handleScannedValue = (rawData) => {
    if (scanLockRef.current || successAlertOpenRef.current || checkingExpiry) {
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
      void proceedAfterExpiryCheck(data);
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
              onBarcodeScanned={scanned || checkingExpiry ? undefined : handleBarCodeScanned}
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
            {checkingExpiry ? (
              <View style={styles.expiryCheckOverlay}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.expiryCheckText}>Checking expiry…</Text>
              </View>
            ) : null}
          </View>

          {scanned && !checkingExpiry && !successAlertOpenRef.current && remaining > 0 ? (
            <TouchableOpacity style={styles.rescanButton} onPress={unlockForNextUnit}>
              <Text style={styles.rescanButtonText}>Scan next unit</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      <ExpiredProductModal
        visible={Boolean(expiredGate)}
        productName={expiredGate?.productName}
        expiryValue={expiredGate?.expiryValue}
        inventoryId={expiredGate?.inventoryId}
        onPickAnother={() => {
          const resolve = expiredGate?.resolve;
          setExpiredGate(null);
          resolve?.(false);
          unlockForNextUnit();
        }}
        onExpiryUpdated={() => {
          const resolve = expiredGate?.resolve;
          setExpiredGate(null);
          resolve?.(true);
        }}
      />
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
  permissionButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionButtonText: { color: '#FFFFFF', fontWeight: '700' },
  message: { color: '#CCCCCC', textAlign: 'center', marginTop: 12, lineHeight: 20 },
  instruction: {
    color: '#FFFFFF',
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
    backgroundColor: '#0F5132',
  },
  progressBannerText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  scannerContainer: { flex: 1, position: 'relative' },
  scanner: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#00FF00',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  expiryCheckOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  expiryCheckText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rescanButton: {
    margin: 16,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rescanButtonText: { color: '#FFFFFF', fontWeight: '700' },
});

export default BarcodeScannerScreen;
