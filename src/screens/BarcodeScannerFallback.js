import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const BarcodeScannerFallback = ({ route, navigation }) => {
  const { orderId, itemId, expectedBarcode, itemName } = route.params;
  const [manualBarcode, setManualBarcode] = useState('');

  const handleManualEntry = () => {
    if (!manualBarcode.trim()) {
      Alert.alert('Error', 'Please enter a barcode');
      return;
    }

    if (manualBarcode === expectedBarcode) {
      Alert.alert(
        'Success!',
        `✅ ${itemName} verified successfully!`,
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
              if (route.params.onScanSuccess) {
                route.params.onScanSuccess(manualBarcode);
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Wrong Item',
        `❌ This barcode doesn't match ${itemName}.\n\nExpected: ${expectedBarcode}\nEntered: ${manualBarcode}`,
        [
          { text: 'Try Again', onPress: () => setManualBarcode('') },
          { text: 'Cancel', onPress: () => navigation.goBack() },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Barcode</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.instructionContainer}>
          <Ionicons name="scan-outline" size={64} color="#666" />
          <Text style={styles.instructionTitle}>Camera Scanner Unavailable</Text>
          <Text style={styles.itemName}>{itemName}</Text>
          <Text style={styles.instructionText}>
            Please manually enter the barcode from the product
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Expected Barcode:</Text>
          <Text style={styles.expectedBarcode}>{expectedBarcode}</Text>
          
          <Text style={styles.inputLabel}>Enter Barcode:</Text>
          <TextInput
            style={styles.textInput}
            value={manualBarcode}
            onChangeText={setManualBarcode}
            placeholder="Scan or type barcode here"
            keyboardType="numeric"
            autoFocus
          />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={handleManualEntry}
            disabled={!manualBarcode.trim()}
          >
            <Text style={styles.buttonText}>Verify Barcode</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.autoFillButton]}
            onPress={() => setManualBarcode(expectedBarcode)}
          >
            <Text style={styles.buttonText}>Auto-fill (Demo)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    marginTop: 16,
    marginBottom: 8,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 32,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
  expectedBarcode: {
    fontSize: 16,
    color: '#007AFF',
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    fontFamily: 'monospace',
  },
  buttonContainer: {
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
    borderColor: '#CCCCCC',
  },
  autoFillButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#666666',
  },
});

export default BarcodeScannerFallback;
