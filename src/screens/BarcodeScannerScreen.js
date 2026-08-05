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
    scanWithCamera = false,
    storeId = null,
    inventoryId: inventoryIdParam = null,
    expiryDate: expiryDateParam = null,
  } = route.params || {};
  const [scanned, setScanned] = useState(false);
  const [pickedQuantity, setPickedQuantity] = useState(1);
  const [showQuantitySelector, setShowQuantitySelector] = useState(false);
  const [wedgeResume, setWedgeResume] = useState(0);
  const [checkingExpiry, setCheckingExpiry] = useState(false);
  const [expiredGate, setExpiredGate] = useState(null);
  const cameraRef = useRef(null);
  const scanLockRef = useRef(false);
  const successAlertOpenRef = useRef(false);
  const handleScannedValueRef = useRef(() => {});
  const pendingConfirmRef = useRef(null);

  // camera permissions (must run before wedge hook so `permission` is defined)
  const [permission, requestPermission] = useCameraPermissions();

  const wedgeEnabled = permission != null && !scanned && !checkingExpiry && !expiredGate;

  const { hardwareInputProps, focusCapture } = useHardwareBarcodeWedge({
    onBarcode: (data) => handleScannedValueRef.current(data),
    enabled: wedgeEnabled,
    resumeToken: wedgeResume,
  });

  const resetScanner = () => {
    scanLockRef.current = false;
    successAlertOpenRef.current = false;
    pendingConfirmRef.current = null;
    setCheckingExpiry(false);
    setExpiredGate(null);
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

  const confirmScan = (quantity, scannedData) => {
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
          value: requiredQuantity > 1 ? `${quantity} of ${requiredQuantity}` : String(quantity),
        },
      }
    );
  };

  const proceedAfterExpiryCheck = useCallback(
    async (quantity, scannedData) => {
      setCheckingExpiry(true);
      try {
        const allowed = await ensureProductAllowedForScan(scannedData || expectedBarcode);
        if (!allowed) {
          resetScanner();
          return;
        }
        if (requiredQuantity > 1 && quantity == null) {
          setShowQuantitySelector(true);
          return;
        }
        confirmScan(quantity ?? 1, scannedData);
      } finally {
        setCheckingExpiry(false);
      }
    },
    [ensureProductAllowedForScan, expectedBarcode, requiredQuantity]
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
      void proceedAfterExpiryCheck(requiredQuantity > 1 ? null : 1, data);
    } else {
      showAppDialog(
        'Wrong item',
        `This barcode doesn't match ${itemName}.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Try Again', onPress: () => resetScanner() },
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
            {scanWithCamera
              ? 'Point the camera at the barcode, or scan with your handheld scanner.'
              : 'Use your handheld scanner, or point the camera at the barcode.'}
          </Text>

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

          {showQuantitySelector && (
            <View style={styles.quantityContainer}>
              <Text style={styles.quantityTitle}>Select quantity</Text>
              <View style={styles.quantityControls}>
                <TouchableOpacity style={styles.qtyButton} onPress={decreaseQuantity}>
                  <Ionicons name="remove" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.quantityValue}>{pickedQuantity}</Text>
                <TouchableOpacity style={styles.qtyButton} onPress={increaseQuantity}>
                  <Ionicons name="add" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => confirmScan(pickedQuantity, expectedBarcode)}
              >
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          )}

          {scanned && !showQuantitySelector && !checkingExpiry && (
            <TouchableOpacity style={styles.rescanButton} onPress={resetScanner}>
              <Text style={styles.rescanButtonText}>Scan Again</Text>
            </TouchableOpacity>
          )}
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
          resetScanner();
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
  quantityContainer: {
    backgroundColor: '#1C1C1E',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  quantityTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  qtyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', minWidth: 40, textAlign: 'center' },
  confirmButton: {
    backgroundColor: '#34C759',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
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
