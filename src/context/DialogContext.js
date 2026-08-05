import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AppDialog from '../components/AppDialog';

const DialogContext = createContext(null);

/**
 * Set by DialogProvider so non-component code (services, event listeners, plain
 * callbacks) can raise a dialog the same way Alert.alert was callable anywhere.
 */
let dialogHandler = null;

const TITLE_VARIANT_HINTS = [
  [/(^|\s)(error|failed|failure|invalid|wrong|not supported|unable|expired)/i, 'error'],
  [/(success|complete|completed|downloaded|ready|deleted|registered)/i, 'success'],
  [/(warning|expiry|expiring|caution|cancelled|no drivers|unavailable)/i, 'warning'],
  [/(are you sure|confirm|sign out|delete|mark )/i, 'confirm'],
];

/** Keeps migrated call sites readable: the title alone picks a sensible look. */
const inferVariant = (title, buttons) => {
  const text = String(title || '');
  for (const [pattern, variant] of TITLE_VARIANT_HINTS) {
    if (pattern.test(text)) return variant;
  }
  const hasChoice = Array.isArray(buttons) && buttons.length > 1;
  return hasChoice ? 'confirm' : 'info';
};

export const DialogProvider = ({ children }) => {
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);
  // Tracked in a ref as well as state: two dialogs raised in the same tick would
  // both read a stale `current` from state and the first would be dropped.
  const activeRef = useRef(null);

  const presentNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setCurrent(next);
  }, []);

  const enqueue = useCallback((config) => {
    return new Promise((resolve) => {
      const entry = { ...config, key: `${Date.now()}-${Math.random()}`, resolve };
      if (activeRef.current) {
        queueRef.current.push(entry);
      } else {
        activeRef.current = entry;
        setCurrent(entry);
      }
    });
  }, []);

  const handleDismiss = useCallback(
    (action) => {
      const active = activeRef.current;
      activeRef.current = null;
      setCurrent(null);
      // Let the modal finish closing before the next one mounts, otherwise
      // Android can drop the second modal entirely.
      setTimeout(presentNext, 180);

      if (!active) return;
      try {
        action?.onPress?.();
      } finally {
        active.resolve?.(action ?? null);
      }
    },
    [presentNext]
  );

  /** Mirrors Alert.alert(title, message, buttons, options). */
  const showDialog = useCallback(
    (title, message, buttons, options = {}) =>
      enqueue({
        title,
        message,
        buttons,
        variant: options.variant || inferVariant(title, buttons),
        icon: options.icon,
        highlight: options.highlight,
        details: options.details,
        cancelable: options.cancelable !== false,
      }),
    [enqueue]
  );

  /** Resolves true only when the affirmative button is chosen. */
  const confirmDialog = useCallback(
    async ({
      title,
      message,
      confirmText = 'Continue',
      cancelText = 'Cancel',
      destructive = false,
      variant,
      icon,
      highlight,
      details,
      cancelable = false,
    }) => {
      const CONFIRM = Symbol('confirm');
      const action = await enqueue({
        title,
        message,
        variant: variant || (destructive ? 'error' : 'confirm'),
        icon,
        highlight,
        details,
        cancelable,
        buttons: [
          { text: cancelText, style: 'cancel' },
          { text: confirmText, style: destructive ? 'destructive' : 'default', value: CONFIRM },
        ],
      });
      return action?.value === CONFIRM;
    },
    [enqueue]
  );

  const value = useMemo(() => ({ showDialog, confirmDialog }), [showDialog, confirmDialog]);
  dialogHandler = value;

  return (
    <DialogContext.Provider value={value}>
      {children}
      <AppDialog
        key={current?.key}
        visible={!!current}
        variant={current?.variant}
        title={current?.title}
        message={current?.message}
        icon={current?.icon}
        highlight={current?.highlight}
        details={current?.details}
        buttons={current?.buttons}
        cancelable={current?.cancelable !== false}
        onDismiss={handleDismiss}
      />
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside a DialogProvider');
  return ctx;
};

/**
 * Drop-in replacement for Alert.alert. Falls back to the native alert if the
 * provider is not mounted yet so a message is never silently swallowed.
 */
export const showAppDialog = (title, message, buttons, options) => {
  if (dialogHandler) return dialogHandler.showDialog(title, message, buttons, options);
  Alert.alert(String(title ?? ''), message ? String(message) : undefined, buttons);
  return Promise.resolve(null);
};

export const confirmAppDialog = (config) => {
  if (dialogHandler) return dialogHandler.confirmDialog(config);
  return new Promise((resolve) => {
    Alert.alert(String(config?.title ?? ''), config?.message ? String(config.message) : undefined, [
      { text: config?.cancelText || 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: config?.confirmText || 'Continue', onPress: () => resolve(true) },
    ]);
  });
};

export default DialogContext;
