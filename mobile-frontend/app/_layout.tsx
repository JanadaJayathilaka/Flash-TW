import { Stack, useRouter } from "expo-router";
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppThemeProvider } from '../src/theme/ThemeContext';

const SESSION_KEY = 'login_timestamp';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        setHasSession(!!stored);
      } catch {}
      setSessionChecked(true);
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (fontsLoaded && sessionChecked) {
      if (!hasSession) {
        router.replace('/login');
      }
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, sessionChecked]);

  return (
    <AppThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="index" />
        <Stack.Screen name="flash-sales" />
      </Stack>
    </AppThemeProvider>
  );
}
