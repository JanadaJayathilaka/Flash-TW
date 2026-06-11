import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme } from "../src/theme/ThemeContext";

const PASSWORD = "36fonseka";
const SESSION_KEY = 'login_timestamp';

export default function Login() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [input, setInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  const handleSignIn = async () => {
    if (input === PASSWORD) {
      setError(false);
      try {
        await AsyncStorage.setItem(SESSION_KEY, Date.now().toString());
      } catch {}
      router.replace("/");
    } else {
      setError(true);
      setInput("");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.appBackground }]} edges={["top", "bottom"]}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.colors.statusBarBackground} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.container, { backgroundColor: theme.colors.appBackground }]}>
          {/* Logo */}
          {/* <View style={styles.logoWrap}>
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View> */}

          {/* Card */}
          <View style={[styles.card, { backgroundColor: theme.colors.surface }] }>
            {/* Input */}
            <View style={styles.inputRow}>
              <MaterialIcons name="lock" size={24} color={theme.colors.primary} style={{ marginRight: 10 }} />
              <View
                style={[
                  styles.inputWrap,
                  { borderBottomColor: theme.colors.inputBorder },
                  error && styles.inputError,
                  error && { borderBottomColor: theme.colors.danger },
                ]}
              >
                <TextInput
                style={[styles.input, { color: theme.colors.textPrimary }]}
                value={input}
                onChangeText={(v) => {
                  setInput(v);
                  setError(false);
                }}
                secureTextEntry={!showPassword}
                placeholder="Passcode"
                placeholderTextColor={theme.colors.textMuted}
                
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleSignIn}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
              </View>
            </View>

            {error && (
              <Text style={[styles.errorText, { color: theme.colors.danger }] }>
                Incorrect password. Try again.
              </Text>
            )}

            {/* Sign in button */}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: theme.colors.buttonBackground }]}
              onPress={handleSignIn}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnText, { color: theme.colors.buttonText }]}>LOGIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: { flex: 1 },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoWrap: {
    width: 180,
    height: 180,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 80,
  },
  logo: {
    width: 120,
    height: 120,
  },
  appName: {
    fontSize: 22,
    fontFamily: "Montserrat_700Bold",
    color: "#ffffff",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  appSub: {
    fontSize: 12,
    fontFamily: "Montserrat_400Regular",
    color: "#93c5fd",
    marginBottom: 40,
    letterSpacing: 0.3,
  },
  card: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: "Montserrat_600SemiBold",
    color: "#0a1f44",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  inputWrap: {
    flex: 1,
    maxWidth: "90%",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1976D2",
    paddingHorizontal: 4,
    backgroundColor: "transparent",
  },
  inputError: {
    borderBottomColor: "#ef4444",
  },
  input: {
    flex: 1,
    height: 40,
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Montserrat_400Regular",
    color: "#1e293b",
  },
  eyeBtn: {
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginBottom: 12,
    marginLeft: 2,
  },
  btn: {
    backgroundColor: "#1976D2",
    borderRadius: 4,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  btnText: {
    fontSize: 14,
    fontFamily: "Montserrat_400Regular",
    color: "#ffffff",
    letterSpacing: 1,
  },
});
