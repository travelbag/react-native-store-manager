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
      // Show quantity selector if required quantity > 1
      if (requiredQuantity > 1) {
        setShowQuantitySelector(true);
      } else {
        confirmScan(1);
      }
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

  const confirmScan = (quantity) => {
    Alert.alert(
      'Success!',
      `✅ ${itemName} scanned successfully!\nQuantity picked: ${quantity}${requiredQuantity > 1 ? ` of ${requiredQuantity}` : ''}`,
      [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
            // Pass back the scanned result with quantity
            if (route.params.onScanSuccess) {
              route.params.onScanSuccess(data, quantity);
            }
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
        {requiredQuantity > 1 && (
          <Text style={styles.quantityText}>Required: {requiredQuantity} items</Text>
        )}
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
