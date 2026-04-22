import { useRef, useState, useCallback, useEffect } from 'react';
import { InteractionManager, Keyboard, Platform, StyleSheet } from 'react-native';

/** Idle time after last character before treating input as complete (no suffix key). */
const DEFAULT_IDLE_MS = 320;

const HAS_SUFFIX = /[\n\r\t\u0004]/;
const STRIP_SUFFIX = /[\n\r\t\u0004]/g; // Enter, CR, Tab; some guns send EOT

/**
 * HID keyboard-wedge barcode scanners (e.g. HTA11) type the code into the focused field,
 * usually ending with Enter or Tab. Keeps a ref-backed buffer so idle debounce sees the full code.
 *
 * @param {object} options
 * @param {(data: string) => void} options.onBarcode — trimmed barcode string
 * @param {boolean} [options.enabled=true] — when false, input is not focused and events ignored
 * @param {number} [options.idleMs=320] — debounce if the scanner does not send a suffix key
 * @param {number|string} [options.resumeToken=0] — bump to run focus capture again (e.g. after "Scan again")
 */
export function useHardwareBarcodeWedge({
  onBarcode,
  enabled = true,
  idleMs = DEFAULT_IDLE_MS,
  resumeToken = 0,
}) {
  const inputRef = useRef(null);
  const bufferRef = useRef('');
  const idleTimerRef = useRef(null);
  const [displayValue, setDisplayValue] = useState('');

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const flush = useCallback(
    (raw) => {
      const data = String(raw || '').trim();
      clearIdleTimer();
      bufferRef.current = '';
      setDisplayValue('');
      if (data) {
        onBarcode(data);
      }
    },
    [onBarcode, clearIdleTimer]
  );

  const focusCapture = useCallback(() => {
    if (!enabled) {
      return;
    }
    const el = inputRef.current;
    if (!el) {
      return;
    }
    // Close any keyboard left open from the previous screen; do not call dismiss after focus()
    // or Android may blur this field and the HTA11 wedge will stop receiving keys.
    Keyboard.dismiss();
    const run = () => el.focus();
    requestAnimationFrame(run);
    setTimeout(run, 0);
    setTimeout(run, 50);
    setTimeout(run, 200);
    setTimeout(run, 500);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(run, 16);
      setTimeout(run, 120);
    });
  }, [enabled]);

  const onChangeText = useCallback(
    (text) => {
      if (!enabled) {
        return;
      }
      bufferRef.current = text;
      setDisplayValue(text);
      clearIdleTimer();

      if (HAS_SUFFIX.test(text)) {
        const cleaned = text.replace(STRIP_SUFFIX, '').trim();
        flush(cleaned);
        return;
      }

      idleTimerRef.current = setTimeout(() => {
        const cleaned = bufferRef.current.trim();
        flush(cleaned);
      }, idleMs);
    },
    [enabled, idleMs, flush, clearIdleTimer]
  );

  const onSubmitEditing = useCallback(() => {
    if (!enabled) {
      return;
    }
    const cleaned = bufferRef.current.replace(STRIP_SUFFIX, '').trim();
    flush(cleaned);
  }, [enabled, flush]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    focusCapture();
    return () => clearIdleTimer();
  }, [enabled, resumeToken, focusCapture, clearIdleTimer]);

  const hardwareInputProps = {
    ref: inputRef,
    value: displayValue,
    onChangeText,
    onSubmitEditing,
    blurOnSubmit: false,
    showSoftInputOnFocus: false,
    autoCapitalize: 'none',
    autoCorrect: false,
    caretHidden: true,
    keyboardType: Platform.OS === 'android' ? 'visible-password' : 'default',
    // Programmatic focus only — autoFocus tends to pop the soft keyboard on Android.
    autoFocus: false,
    editable: enabled,
    importantForAutofill: 'no',
    spellCheck: false,
    textContentType: 'none',
    underlineColorAndroid: 'transparent',
    multiline: false,
    style: styles.hiddenHardwareInput,
    ...(Platform.OS === 'android' ? { disableFullscreenUI: true } : {}),
  };

  return { hardwareInputProps, focusCapture };
}

const styles = StyleSheet.create({
  hiddenHardwareInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    left: 0,
    top: 0,
    opacity: 0,
  },
});
