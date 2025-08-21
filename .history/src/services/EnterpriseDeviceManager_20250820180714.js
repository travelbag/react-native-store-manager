// Enterprise device detection and optimization
import { Dimensions, Platform } from 'react-native';
import * as Device from 'expo-device';

class EnterpriseDeviceManager {
  constructor() {
    this.deviceInfo = null;
    this.isEnterpriseDevice = false;
    this.init();
  }

  async init() {
    this.deviceInfo = await this.getDeviceInfo();
    this.isEnterpriseDevice = this.detectEnterpriseDevice();
  }

  async getDeviceInfo() {
    const screenData = Dimensions.get('screen');
    
    return {
      brand: Device.brand,
      manufacturer: Device.manufacturer,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      screenWidth: screenData.width,
      screenHeight: screenData.height,
      isTablet: this.isTabletDevice(),
    };
  }

  detectEnterpriseDevice() {
    const manufacturer = this.deviceInfo?.manufacturer?.toLowerCase() || '';
    const brand = this.deviceInfo?.brand?.toLowerCase() || '';
    const model = this.deviceInfo?.modelName?.toLowerCase() || '';

    // Common enterprise device manufacturers
    const enterpriseManufacturers = [
      'zebra',
      'honeywell',
      'datalogic',
      'bluebird',
      'chainway',
      'urovo',
      'mobile-computer',
      'tc',
      'mc', // Zebra model prefixes
    ];

    return enterpriseManufacturers.some(manufacturer => 
      manufacturer.includes(manufacturer) || 
      brand.includes(manufacturer) ||
      model.includes(manufacturer)
    );
  }

  isTabletDevice() {
    const { width, height } = Dimensions.get('screen');
    const minDimension = Math.min(width, height);
    const maxDimension = Math.max(width, height);
    
    // Typical tablet screen sizes (in dp)
    return minDimension >= 600 && maxDimension >= 960;
  }

  getOptimizedScannerConfig() {
    if (this.isEnterpriseDevice) {
      return {
        // Optimized for enterprise scanning
        torchMode: 'auto',
        flashMode: 'auto',
        autoFocus: true,
        whiteBalance: 'auto',
        // Higher timeout for industrial environments
        scanTimeout: 10000,
        // Multiple barcode format support
        barCodeTypes: [
          'aztec', 'ean13', 'ean8', 'qr', 'pdf417', 
          'upc_e', 'datamatrix', 'code39', 'code93', 
          'itf14', 'codabar', 'code128', 'upc_a'
        ],
      };
    }
    
    return {
      // Standard mobile device config
      barCodeTypes: ['qr', 'ean13', 'code128', 'upc_a'],
      scanTimeout: 5000,
    };
  }

  getUIOptimizations() {
    return {
      // Larger touch targets for enterprise use
      buttonHeight: this.isEnterpriseDevice ? 60 : 48,
      fontSize: this.isEnterpriseDevice ? 18 : 16,
      iconSize: this.isEnterpriseDevice ? 28 : 24,
      // Better contrast for industrial environments
      highContrast: this.isEnterpriseDevice,
      // Larger scan frame for handheld use
      scanFrameSize: this.isEnterpriseDevice ? 300 : 250,
    };
  }

  // Check if device has dedicated scan buttons
  hasDedicatedScanButton() {
    // Many enterprise devices have hardware scan triggers
    return this.isEnterpriseDevice;
  }

  // Enhanced error handling for industrial environments
  getErrorHandlingConfig() {
    return {
      retryAttempts: this.isEnterpriseDevice ? 5 : 3,
      connectionTimeout: this.isEnterpriseDevice ? 30000 : 15000,
      offlineMode: this.isEnterpriseDevice, // Enable offline sync
    };
  }
}

export default new EnterpriseDeviceManager();
