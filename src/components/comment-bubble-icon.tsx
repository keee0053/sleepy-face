import { StyleSheet, View } from 'react-native';

type CommentBubbleIconProps = {
  color: string;
  size?: number;
};

// A wide, outlined speech-bubble (oval + a small tail), matching the reference icon
// rather than the system bubble glyph, which reads as a rounded square at small sizes.
export function CommentBubbleIcon({
  color,
  size = 16,
}: CommentBubbleIconProps) {
  const width = size;
  const height = size * 0.78;
  const strokeWidth = Math.max(1.5, size * 0.1);
  const tailSize = size * 0.26;

  return (
    <View style={{ height, width }}>
      <View
        style={[
          styles.oval,
          {
            borderColor: color,
            borderRadius: height / 2,
            borderWidth: strokeWidth,
            height,
            width,
          },
        ]}
      />
      <View
        style={[
          styles.tail,
          {
            borderTopColor: color,
            borderTopWidth: tailSize,
            borderRightWidth: tailSize,
            bottom: -tailSize * 0.55,
            left: width * 0.14,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  oval: {
    backgroundColor: 'transparent',
  },
  tail: {
    borderRightColor: 'transparent',
    borderStyle: 'solid',
    height: 0,
    position: 'absolute',
    transform: [{ rotate: '-6deg' }],
    width: 0,
  },
});
