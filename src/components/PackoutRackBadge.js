import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const SIZE_PRESETS = {
  xs: {
    glow: 52,
    circle: 46,
    fontSize: 16,
    caption: 9,
    letterSpacing: 0.8,
    captionGap: 4,
  },
  sm: {
    glow: 72,
    circle: 64,
    fontSize: 22,
    caption: 10,
    letterSpacing: 1,
    captionGap: 6,
  },
  md: {
    glow: 88,
    circle: 78,
    fontSize: 26,
    caption: 10,
    letterSpacing: 1.1,
    captionGap: 6,
  },
  lg: {
    glow: 104,
    circle: 92,
    fontSize: 30,
    caption: 11,
    letterSpacing: 1.2,
    captionGap: 8,
  },
};

/**
 * Circular pack-out rack badge — matches driver app rack spotlight styling.
 */
const PackoutRackBadge = ({
  rackNumber,
  size = 'md',
  captionTop = 'Place on',
  captionBottom = 'Rack',
  showCaptions = true,
  muted = false,
  style,
}) => {
  const label = String(rackNumber || '').trim().toUpperCase();
  if (!label) return null;

  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.md;
  const glowRadius = preset.glow / 2;
  const circleRadius = preset.circle / 2;

  return (
    <View style={[styles.wrap, style]}>
      {showCaptions && captionTop ? (
        <Text
          style={[
            styles.caption,
            {
              fontSize: preset.caption,
              letterSpacing: preset.letterSpacing,
              marginBottom: preset.captionGap,
            },
          ]}
        >
          {captionTop}
        </Text>
      ) : null}
      <View
        style={[
          styles.glow,
          {
            width: preset.glow,
            height: preset.glow,
            borderRadius: glowRadius,
          },
        ]}
      >
        <View
          style={[
            styles.circle,
            {
              width: preset.circle,
              height: preset.circle,
              borderRadius: circleRadius,
            },
          ]}
        >
          <Text
            style={[
              styles.number,
              {
                fontSize: preset.fontSize,
              },
              muted && styles.numberMuted,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.45}
          >
            {label}
          </Text>
        </View>
      </View>
      {showCaptions && captionBottom ? (
        <Text
          style={[
            styles.caption,
            {
              fontSize: preset.caption,
              letterSpacing: preset.letterSpacing,
              marginTop: preset.captionGap,
            },
          ]}
        >
          {captionBottom}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  glow: {
    backgroundColor: 'rgba(255, 152, 0, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  circle: {
    backgroundColor: '#FFF8E1',
    borderWidth: 3,
    borderColor: '#FF9800',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  number: {
    fontWeight: '800',
    color: '#E65100',
    textAlign: 'center',
  },
  numberMuted: {
    color: '#BDBDBD',
    fontWeight: '700',
  },
});

export default PackoutRackBadge;
