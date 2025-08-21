import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Try to import BarCodeScanner, fall back to manual entry if not available
let BarCodeScanner;
try {
  const BarcodeModule = require('expo-barcode-scanner');
  BarCodeScanner = BarcodeModule.BarCodeScanner;
} catch (error) {
  console.log('BarCodeScanner not available, using fallback');
  BarCodeScanner = null;
}

const BarcodeScannerScreen = ({ route, navigation }) => {
  const { orderId, itemId, expectedBarcode, itemName, requiredQuantity = 1 } = route.params;
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [pickedQuantity, setPickedQuantity] = useState(1);
  const [showQuantitySelector, setShowQuantitySelector] = useState(false);

  useEffect(() => {
    if (!BarCodeScanner) {
      // If BarCodeScanner is not available, navigate to fallback
      navigation.replace('BarcodeScannerFallback', route.params);
      return;
    }

    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ type, data }) => {
    setScanned(true);
    Vibration.vibrate();

    if (data === expectedBarcode) {
      Alert.alert(
        'Success!',
        `✅ ${itemName} scanned successfully!`,
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
              // Pass back the scanned result
              if (route.params.onScanSuccess) {
                route.params.onScanSuccess(data);
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Wrong Item',
        `❌ This barcode doesn't match ${itemName}.\n\nExpected: ${expectedBarcode}\nScanned: ${data}`,
        [
          { text: 'Try Again', onPress: () => setScanned(false) },
          { text: 'Cancel', onPress: () => navigation.goBack() },
        ]
      );
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#666" />
          <Text style={styles.message}>Camera permission is required to scan barcodes</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => BarCodeScanner?.requestPermissionsAsync()}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
        <Text style={styles.instructionText}>
          Point your camera at the barcode on the product
        </Text>
      </View>

      <View style={styles.scannerContainer}>
        {BarCodeScanner ? (
          <BarCodeScanner
            onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
            style={styles.scanner}
          />
        ) : (
          <View style={styles.fallbackContainer}>
            <Text style={styles.fallbackText}>Camera Scanner Not Available</Text>
          </View>
        )}
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </View>

      <View style={styles.bottomContainer}>
        {scanned && (
          <TouchableOpacity
            style={styles.button}
            onPress={() => setScanned(false)}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  instructionContainer: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
  },
  instructionTitle: {
    fontSize: 16,
    color: '#CCCCCC',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  scanner: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#00FF00',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  bottomContainer: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    gap: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#CCCCCC',
  },
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  fallbackText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginVertical: 20,
  },
});

export default BarcodeScannerScreen;
