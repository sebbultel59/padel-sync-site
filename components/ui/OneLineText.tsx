import React from 'react';
import { Text, StyleSheet } from 'react-native';

type OneLineTextProps = React.ComponentProps<typeof Text> & {
  children?: React.ReactNode;
  style?: React.ComponentProps<typeof Text>['style'];
};

export function OneLineText({ children, style, ...rest }: OneLineTextProps) {
  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={[styles.oneLine, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  oneLine: {
    flexShrink: 1,
    // Important pour que le texte puisse réellement se compresser
    // dans les rangées (flexDirection: 'row'), surtout sur Android.
    minWidth: 0,
  },
});

export default OneLineText;
