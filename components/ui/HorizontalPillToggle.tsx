import React from 'react';
import { Platform, Text, View, ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

export type HorizontalPillToggleOption<T extends string> = {
  key: T;
  label: string;
  /** Affiché avant le label (ex. « + ») avec une couleur dédiée. */
  leadingText?: string;
  leadingTextColor?: string;
};

type Props<T extends string> = {
  value: T;
  options: HorizontalPillToggleOption<T>[];
  onChange: (next: T) => void;
  style?: ViewStyle;
  /** Réduit padding / typo — écrans denses (ex. header Matchs). */
  compact?: boolean;
  activeColor?: string;
  inactiveBg?: string;
  inactiveBorder?: string;
  inactiveText?: string;
  activeText?: string;
};

export function HorizontalPillToggle<T extends string>({
  value,
  options,
  onChange,
  style,
  compact = false,
  activeColor = '#ff8c00',
  inactiveBg = 'rgba(255,255,255,0.10)',
  inactiveBorder = 'rgba(255,255,255,0.16)',
  inactiveText = '#EAF0FF',
  activeText = '#061A2B',
}: Props<T>) {
  const rowPad = compact
    ? { paddingHorizontal: 10, paddingVertical: 4, gap: 6 as const }
    : { paddingHorizontal: 12, paddingVertical: 8, gap: 8 as const };
  const pill = compact
    ? { minHeight: 40, paddingH: 6, paddingV: 7, labelFs: 12, leadFs: 13 }
    : { minHeight: 46, paddingH: 8, paddingV: 12, labelFs: 13, leadFs: 14 };

  return (
    <View style={[{ zIndex: 20, ...(Platform.OS === 'android' ? { elevation: 12 } : {}) }, style]}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: rowPad.gap,
          paddingHorizontal: rowPad.paddingHorizontal,
          paddingVertical: rowPad.paddingVertical,
        }}
      >
        {options.map((opt) => {
          const active = opt.key === value;
          const lead = opt.leadingText;
          const leadColor =
            lead && active ? activeText : (opt.leadingTextColor ?? '#ff8c00');
          return (
            <Pressable
              key={opt.key}
              unstable_pressDelay={0}
              onPress={() => onChange(opt.key)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minWidth: 0,
                  minHeight: pill.minHeight,
                  paddingHorizontal: pill.paddingH,
                  paddingVertical: pill.paddingV,
                  borderRadius: 999,
                  backgroundColor: active ? activeColor : inactiveBg,
                  borderWidth: active ? 0 : 1,
                  borderColor: inactiveBorder,
                  opacity: pressed ? 0.96 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={lead ? `${lead} ${opt.label}` : opt.label}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  maxWidth: '100%',
                }}
              >
                {lead ? (
                  <Text
                    style={{
                      fontSize: pill.leadFs,
                      fontWeight: '900',
                      color: leadColor,
                      marginRight: 3,
                      ...(active
                        ? {}
                        : {
                            textShadowColor: 'rgba(0,0,0,0.25)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 1,
                          }),
                    }}
                  >
                    {lead}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  style={{
                    flexShrink: 1,
                    fontSize: pill.labelFs,
                    fontWeight: '900',
                    color: active ? activeText : inactiveText,
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.35)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }}
                >
                  {opt.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

