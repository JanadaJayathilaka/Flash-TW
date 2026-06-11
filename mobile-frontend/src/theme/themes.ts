export type ThemeName = 'default' | 'dark' | 'ocean' | 'forest' | 'warm' | 'wine';

export interface ThemeColors {
  appBackground: string;
  statusBarBackground: string;
  surface: string;
  surfaceMuted: string;
  card: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryAlt: string;
  headerBackground: string;
  headerBorder: string;
  buttonBackground: string;
  buttonText: string;
  inputBorder: string;
  divider: string;
  icon: string;
  overlay: string;
  success: string;
  danger: string;
}

export interface AppTheme {
  name: ThemeName;
  label: string;
  previewTile: string;
  previewDot: string;
  previewText: string;
  statusBarStyle: 'light-content' | 'dark-content';
  colors: ThemeColors;
}

export const THEMES: Record<ThemeName, AppTheme> = {
  default: {
    name: 'default',
    label: 'Default',
    previewTile: '#F6F8FC',
    previewDot: '#2457C5',
    previewText: '#2E3748',
    statusBarStyle: 'light-content',
    colors: {
      appBackground: '#006EC9',
      statusBarBackground: '#0B4FA8',
      surface: '#FFFFFF',
      surfaceMuted: '#F5F7FB',
      card: '#F5F7FB',
      cardBorder: '#38A2FF',
      textPrimary: '#1E293B',
      textSecondary: '#374151',
      textMuted: '#64748B',
      textInverse: '#FFFFFF',
      primary: '#1C55CC',
      primaryAlt: '#132F86',
      headerBackground: '#0A1F44',
      headerBorder: '#FFFFFF',
      buttonBackground: '#1976D2',
      buttonText: '#FFFFFF',
      inputBorder: '#1976D2',
      divider: '#D1D5DB',
      icon: '#333333',
      overlay: 'rgba(0,0,0,0.35)',
      success: '#15803D',
      danger: '#DC2626',
    },
  },
  dark: {
    name: 'dark',
    label: 'Dark',
    previewTile: '#232327',
    previewDot: '#61656E',
    previewText: '#E5E7EB',
    statusBarStyle: 'light-content',
    colors: {
      appBackground: '#111418',
      statusBarBackground: '#0B0E11',
      surface: '#1A1D22',
      surfaceMuted: '#23272F',
      card: '#262B34',
      cardBorder: '#3A4252',
      textPrimary: '#E5E7EB',
      textSecondary: '#D1D5DB',
      textMuted: '#9CA3AF',
      textInverse: '#FFFFFF',
      primary: '#596273',
      primaryAlt: '#3A4252',
      headerBackground: '#0F1216',
      headerBorder: '#2F3743',
      buttonBackground: '#374151',
      buttonText: '#FFFFFF',
      inputBorder: '#596273',
      divider: '#374151',
      icon: '#E5E7EB',
      overlay: 'rgba(0,0,0,0.5)',
      success: '#22C55E',
      danger: '#F87171',
    },
  },
  ocean: {
    name: 'ocean',
    label: 'Ocean',
    previewTile: '#CFEAF1',
    previewDot: '#56BBD0',
    previewText: '#23414A',
    statusBarStyle: 'dark-content',
    colors: {
      appBackground: '#8BC8D8',
      statusBarBackground: '#67B5C9',
      surface: '#F4FBFD',
      surfaceMuted: '#E6F4F8',
      card: '#EAF7FB',
      cardBorder: '#89C7D8',
      textPrimary: '#15323B',
      textSecondary: '#285260',
      textMuted: '#4B6F7A',
      textInverse: '#FFFFFF',
      primary: '#4FAEC5',
      primaryAlt: '#3D8EA6',
      headerBackground: '#3D8EA6',
      headerBorder: '#D5EFF6',
      buttonBackground: '#4FAEC5',
      buttonText: '#FFFFFF',
      inputBorder: '#4FAEC5',
      divider: '#BADDE7',
      icon: '#23414A',
      overlay: 'rgba(11,37,45,0.3)',
      success: '#0F8F74',
      danger: '#C64646',
    },
  },
  forest: {
    name: 'forest',
    label: 'Forest',
    previewTile: '#0F3E16',
    previewDot: '#38A647',
    previewText: '#EAF8EA',
    statusBarStyle: 'light-content',
    colors: {
      appBackground: '#0B3F12',
      statusBarBackground: '#08350F',
      surface: '#143A1B',
      surfaceMuted: '#1A4723',
      card: '#1E5429',
      cardBorder: '#2F8A3E',
      textPrimary: '#EAF8EA',
      textSecondary: '#D6EDD6',
      textMuted: '#A9CFAE',
      textInverse: '#FFFFFF',
      primary: '#2F8A3E',
      primaryAlt: '#1D6B2A',
      headerBackground: '#082B0E',
      headerBorder: '#3EA94D',
      buttonBackground: '#2F8A3E',
      buttonText: '#FFFFFF',
      inputBorder: '#3EA94D',
      divider: '#2A6A34',
      icon: '#EAF8EA',
      overlay: 'rgba(0,0,0,0.42)',
      success: '#7CE38A',
      danger: '#FF8888',
    },
  },
  warm: {
    name: 'warm',
    label: 'Warm',
    previewTile: '#D8D3AF',
    previewDot: '#D2A15B',
    previewText: '#4B3F2C',
    statusBarStyle: 'dark-content',
    colors: {
      appBackground: '#D6CFAD',
      statusBarBackground: '#C9C196',
      surface: '#FAF8EF',
      surfaceMuted: '#EFE9D3',
      card: '#F2EBD4',
      cardBorder: '#D2A15B',
      textPrimary: '#4A3E2A',
      textSecondary: '#5E513A',
      textMuted: '#85755A',
      textInverse: '#FFFFFF',
      primary: '#C9964E',
      primaryAlt: '#B37F3E',
      headerBackground: '#B37F3E',
      headerBorder: '#F4E3C1',
      buttonBackground: '#C9964E',
      buttonText: '#FFFFFF',
      inputBorder: '#C9964E',
      divider: '#D8CCAD',
      icon: '#5E513A',
      overlay: 'rgba(52,37,16,0.28)',
      success: '#3F7E42',
      danger: '#A84545',
    },
  },
  wine: {
    name: 'wine',
    label: 'Wine',
    previewTile: '#5D1128',
    previewDot: '#A63C5F',
    previewText: '#F4E6EC',
    statusBarStyle: 'light-content',
    colors: {
      appBackground: '#5D1128',
      statusBarBackground: '#4A0D20',
      surface: '#6D1A33',
      surfaceMuted: '#7A2340',
      card: '#7A2340',
      cardBorder: '#A63C5F',
      textPrimary: '#FCEEF3',
      textSecondary: '#F3D8E2',
      textMuted: '#D8A6B8',
      textInverse: '#FFFFFF',
      primary: '#A63C5F',
      primaryAlt: '#832D49',
      headerBackground: '#4A0D20',
      headerBorder: '#C56A89',
      buttonBackground: '#A63C5F',
      buttonText: '#FFFFFF',
      inputBorder: '#C56A89',
      divider: '#8C3452',
      icon: '#FCEEF3',
      overlay: 'rgba(29,0,10,0.4)',
      success: '#7CE38A',
      danger: '#FF9BAE',
    },
  },
};

export const THEME_OPTIONS: AppTheme[] = [
  THEMES.default,
  THEMES.dark,
  THEMES.ocean,
  THEMES.forest,
  THEMES.warm,
  THEMES.wine,
];
