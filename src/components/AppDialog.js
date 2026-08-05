import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const DIALOG_VARIANTS = {
  info: {
    icon: 'information-circle',
    accent: '#2563EB',
    iconBg: '#DBEAFE',
    border: '#BFDBFE',
    title: '#1E3A8A',
  },
  success: {
    icon: 'checkmark-circle',
    accent: '#059669',
    iconBg: '#D1FAE5',
    border: '#A7F3D0',
    title: '#065F46',
  },
  warning: {
    icon: 'warning',
    accent: '#B45309',
    iconBg: '#FEF3C7',
    border: '#FDE68A',
    title: '#92400E',
  },
  error: {
    icon: 'close-circle',
    accent: '#DC2626',
    iconBg: '#FEE2E2',
    border: '#FECACA',
    title: '#991B1B',
  },
  confirm: {
    icon: 'help-circle',
    accent: '#4F46E5',
    iconBg: '#E0E7FF',
    border: '#C7D2FE',
    title: '#312E81',
  },
};

const resolveVariant = (variant) => DIALOG_VARIANTS[variant] || DIALOG_VARIANTS.info;

/**
 * Styled replacement for Alert.alert.
 *
 * Buttons follow the Alert button shape ({ text, style, onPress }) so call sites
 * migrate without restructuring. Two short buttons sit side by side; anything
 * longer stacks so labels never truncate on narrow scanner screens.
 */
const AppDialog = ({
  visible,
  variant = 'info',
  title,
  message,
  icon,
  highlight,
  details,
  buttons,
  cancelable = true,
  onDismiss,
}) => {
  const theme = resolveVariant(variant);
  const overlay = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      overlay.setValue(0);
      pop.setValue(0);
      Animated.parallel([
        Animated.timing(overlay, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(pop, {
          toValue: 1,
          friction: 8,
          tension: 90,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlay, pop]);

  const actions = Array.isArray(buttons) && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  const detailRows = Array.isArray(details) ? details.filter((row) => row && row.value != null) : [];

  const stackButtons =
    actions.length > 2 || actions.some((action) => String(action?.text || '').length > 14);

  const handlePress = (action) => {
    onDismiss?.(action);
  };

  const requestClose = () => {
    if (!cancelable) return;
    const cancelAction = actions.find((action) => action?.style === 'cancel');
    onDismiss?.(cancelAction ?? null);
  };

  const buttonTone = (action, index) => {
    if (action?.style === 'destructive') return 'destructive';
    if (action?.style === 'cancel') return 'cancel';
    // The last action is the affirmative one in every Alert layout used here.
    return index === actions.length - 1 ? 'primary' : 'neutral';
  };

  return (
    <Modal visible={!!visible} transparent animationType="none" onRequestClose={requestClose}>
      <Animated.View style={[styles.backdrop, { opacity: overlay }]}>
        <Pressable style={styles.backdropPress} onPress={requestClose}>
          <Animated.View
            style={[
              styles.cardWrap,
              {
                opacity: overlay,
                transform: [
                  {
                    scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                  },
                ],
              },
            ]}
          >
            <Pressable style={[styles.card, { borderColor: theme.border }]} onPress={() => {}}>
              <View style={[styles.iconWrap, { backgroundColor: theme.iconBg }]}>
                <Ionicons name={icon || theme.icon} size={28} color={theme.accent} />
              </View>

              {title ? <Text style={[styles.title, { color: theme.title }]}>{title}</Text> : null}

              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.bodyContent}
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                {message ? <Text style={styles.message}>{message}</Text> : null}

                {highlight?.value ? (
                  <View style={[styles.highlight, { backgroundColor: theme.iconBg, borderColor: theme.border }]}>
                    <Ionicons
                      name={highlight.icon || 'time-outline'}
                      size={18}
                      color={theme.accent}
                    />
                    <View style={styles.highlightText}>
                      {highlight.label ? (
                        <Text style={[styles.highlightLabel, { color: theme.accent }]}>
                          {highlight.label}
                        </Text>
                      ) : null}
                      <Text style={[styles.highlightValue, { color: theme.title }]}>
                        {highlight.value}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {detailRows.length > 0 ? (
                  <View style={styles.details}>
                    {detailRows.map((row, index) => (
                      <View
                        key={`${row.label || 'row'}-${index}`}
                        style={[styles.detailRow, index > 0 && styles.detailRowDivider]}
                      >
                        {row.icon ? (
                          <Ionicons name={row.icon} size={15} color="#6B7280" style={styles.detailIcon} />
                        ) : null}
                        <Text style={styles.detailLabel}>{row.label}</Text>
                        <Text style={styles.detailValue} numberOfLines={2}>
                          {String(row.value)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>

              <View style={stackButtons ? styles.actionsColumn : styles.actionsRow}>
                {actions.map((action, index) => {
                  const tone = buttonTone(action, index);
                  return (
                    <Pressable
                      key={`${action?.text || 'action'}-${index}`}
                      style={({ pressed }) => [
                        styles.btn,
                        stackButtons && styles.btnStacked,
                        tone === 'primary' && { backgroundColor: theme.accent },
                        tone === 'destructive' && styles.btnDestructive,
                        (tone === 'cancel' || tone === 'neutral') && styles.btnNeutral,
                        pressed && styles.btnPressed,
                      ]}
                      onPress={() => handlePress(action)}
                    >
                      <Text
                        style={[
                          styles.btnText,
                          tone === 'primary' && styles.btnTextOnAccent,
                          tone === 'destructive' && styles.btnTextOnAccent,
                        ]}
                        numberOfLines={1}
                      >
                        {action?.text || 'OK'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  backdropPress: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  cardWrap: {
    width: '100%',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
  },
  bodyScroll: {
    maxHeight: 320,
  },
  bodyContent: {
    paddingBottom: 4,
  },
  message: {
    fontSize: 14.5,
    lineHeight: 21,
    color: '#374151',
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  highlightText: {
    flex: 1,
  },
  highlightLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  highlightValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  details: {
    marginTop: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  detailRowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  detailIcon: {
    width: 18,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  detailValue: {
    flex: 1,
    fontSize: 13.5,
    color: '#111827',
    fontWeight: '600',
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  actionsColumn: {
    flexDirection: 'column-reverse',
    gap: 10,
    marginTop: 18,
  },
  btn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  btnStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  btnNeutral: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  btnDestructive: {
    backgroundColor: '#DC2626',
  },
  btnPressed: {
    opacity: 0.75,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  btnTextOnAccent: {
    color: '#fff',
  },
});

export default AppDialog;
