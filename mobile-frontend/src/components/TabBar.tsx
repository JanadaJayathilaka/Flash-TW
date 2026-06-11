import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { TabName } from '../types/sales';
import { useAppTheme } from '../theme/ThemeContext';

interface TabBarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  alignLeft?: boolean;
  isLandscape?: boolean;
}

const TABS: { key: TabName; label: string; disabled?: boolean }[] = [
  { key: 'allSales', label: 'All Sales' },
  { key: 'topSales', label: 'Top Sales' },
  { key: 'laggards', label: 'Laggards' },
  { key: 'analytics', label: 'Analytics' },
];

export default function TabBar({ activeTab, onTabChange, alignLeft = false, isLandscape = false }: TabBarProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        isLandscape && activeTab !== 'analytics' ? styles.wrapperLandscape : styles.wrapper,
        alignLeft && styles.wrapperWithIconSpacing,
        { backgroundColor: theme.colors.surface },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.container, alignLeft && styles.containerAlignLeft]}
      >
        
        {TABS.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key
                ? [styles.activeTab, { backgroundColor: theme.colors.primary }]
                : [styles.inactiveTab, { backgroundColor: theme.colors.primaryAlt }],
              index === 0 && { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
              index === TABS.length - 1 && { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
            ]}
            onPress={() => !tab.disabled && onTabChange(tab.key)}
            disabled={tab.disabled}
          >
            <Text style={[styles.tabText, { color: theme.colors.textInverse }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#ffffff',
    paddingBottom: 0,
    paddingTop: 0,
    marginLeft:-6,
    width: '140%',
    marginTop: 0,
  },
  wrapperLandscape: {
    backgroundColor: '#ffffff',
    paddingBottom: 0,
    paddingTop: 0,
    marginLeft:-6,
    width: '140%',
    marginTop: 6,
  },
  wrapperWithIconSpacing: {
    marginRight: 10,
  },
  container: {
    flexDirection: 'row',
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  containerAlignLeft: {
    flexGrow: 0,
    justifyContent: 'flex-start',
    marginLeft: 16,
    marginBottom: 0,
  },
  tab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    
  },
  activeTab: {
    backgroundColor: '#1C55CC',
  },
  inactiveTab: {
    backgroundColor: '#132F86',
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Montserrat_600',
    color: '#ffffff',
  },
});
