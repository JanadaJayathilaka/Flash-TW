import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { THEME_OPTIONS } from '../theme/themes';
import { useAppTheme } from '../theme/ThemeContext';

interface ThemePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ThemePickerModal({ visible, onClose }: ThemePickerModalProps) {
  const { theme, themeName, setThemeName } = useAppTheme();

  const handleSelectTheme = async (nextTheme: (typeof THEME_OPTIONS)[number]) => {
    await setThemeName(nextTheme.name);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Choose a Theme</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={[styles.close, { color: theme.colors.textMuted }]}>x</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Hover over six color theme squares for preview, and click to select one.
          </Text>

          <View style={styles.grid}>
            {THEME_OPTIONS.map((option) => {
              const isSelected = option.name === themeName;

              return (
                <TouchableOpacity
                  key={option.name}
                  style={[
                    styles.themeTile,
                    {
                      backgroundColor: option.previewTile,
                      borderColor: isSelected ? theme.colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => handleSelectTheme(option)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.dot, { backgroundColor: option.previewDot }]} />
                  <Text style={[styles.themeLabel, { color: option.previewText }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Montserrat_600SemiBold',
  },
  close: {
    fontSize: 22,
    lineHeight: 22,
    fontFamily: 'Montserrat_600SemiBold',
    textTransform: 'lowercase',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  themeTile: {
    width: '31%',
    minWidth: 92,
    aspectRatio: 1.22,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginBottom: 8,
  },
  themeLabel: {
    fontSize: 18,
    fontFamily: 'Montserrat_500Medium',
    textAlign: 'center',
  },
});
