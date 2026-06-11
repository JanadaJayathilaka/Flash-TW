import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  useWindowDimensions,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useAppTheme } from "../theme/ThemeContext";

interface AppHeaderProps {
  showBack?: boolean;
  onRotate?: () => void;
  onBack?: () => void;
  onHome?: () => void;
  isHomeDisabled?: boolean;
}

export default function AppHeader({ showBack = true, onRotate, onBack, onHome, isHomeDisabled }: AppHeaderProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const router = useRouter();
  const pathname = usePathname();
  const { theme, themeName } = useAppTheme();

  const now = new Date();
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const h = now.getHours();
  const h12 = h % 12 || 12;
  const ampm = h >= 12 ? "PM" : "AM";
  const mm = String(now.getMinutes()).padStart(2, "0");

  const dateStr = `${now.getFullYear()} ${months[now.getMonth()]} ${String(
    now.getDate()
  ).padStart(2, "0")} ${days[now.getDay()]} | ${h12}:${mm} ${ampm} USA, Pacific`;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/login");
    }
  };

  const handleHome = () => {
    if (onHome) {
      router.replace("/");
      
    }
    if (pathname !== "/") {
      router.replace("/");
    }
  };

  const homeDisabled = isHomeDisabled ?? pathname === "/";

  const handleRotation = () => {
    onRotate?.();
    ScreenOrientation.lockAsync(
      !(width > height)
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch((e) => {
      onRotate?.(); // revert on error
      console.log("Orientation error:", e);
    });
  };

  const handleLogout = () => {
    router.replace("/login");
  };

  return (
    <View style={[styles.header, { backgroundColor: theme.colors.headerBackground, borderColor: theme.colors.headerBorder }]}>
      {/* Top row: date — portrait only */}
      {!isLandscape && (
        <View style={styles.topRow}>
          <Text style={[styles.dateText, { color: theme.colors.textInverse }]}>{dateStr}</Text>
        </View>
      )}

      {/* Bottom row: nav buttons on left, profile on right */}
      <View style={styles.bottomRow2}>
        <View style={styles.bottomRow}>
          <TouchableOpacity onPress={handleBack} style={styles.navBtn}>
            {/* <Ionicons name="arrow-back" size={22} color="#ffffff" /> */}
            <Image 
              source={require('../../assets/images/back.png')} 
              style={{ width: 28, height: 28 }}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.colors.headerBorder }]} />
          <TouchableOpacity onPress={handleHome} style={[styles.navBtn , {opacity: homeDisabled ? 0.5 : 1}]} disabled={homeDisabled }>
            <Image 
              source={require('../../assets/images/Home.png')} 
              style={{ width: 22, height: 22, tintColor: theme.colors.textInverse }}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.colors.headerBorder }]} />
          <TouchableOpacity onPress={handleRotation} style={styles.navBtn} >
            <View style={styles.rotateIconWrap}>
              {themeName === 'default' ? (
                <Image
                  source={require('../../assets/images/Rotate.png')}
                  style={{ width: 20, height: 20 }}
                  resizeMode="contain"
                />
              ) : (
                <MaterialCommunityIcons name="phone-rotate-portrait" size={18} color={theme.colors.textInverse} />
              )}
            </View>
            
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.colors.headerBorder }]} />
          
          {/* Date inline — landscape only */}
          {isLandscape && (
            <Text style={[styles.dateTextInline, { color: theme.colors.textInverse }]}>{dateStr}</Text>
          )}
        </View>
        <View style={styles.profileRow}>
          <Text style={[styles.profileName, { color: theme.colors.textInverse }]}>Peacock</Text>
          {/* <FontAwesome5 name="user-circle" size={18} color="#ffffff" /> */}
          <Image
            source={require('../../assets/images/peacock.png')}
            style={{ width: 18, height: 18 }}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Image
            source={require('../../assets/images/Logout.png')}
            style={{ width: 18, height: 18 }}
            resizeMode="contain"
          />
          </TouchableOpacity>
          
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#0a1f44",
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 12,
    borderColor: "#ffffff",
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 0,
    borderRadius: 12,
    borderBottomEndRadius: 0,
    borderBottomStartRadius: 0,
    width: "100%",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 2,
    marginRight: 4,
  },
  dateText: {
    fontSize: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#ffffff",
    textAlign: "right",
  },
  dateTextInline: {
    fontSize: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#ffffff",
    marginLeft: 2,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  profileName: {
    fontSize: 17,
    fontFamily: "Montserrat_600SemiBold",
    color: "#ffffff",
  },
  logoutBtn: {
    marginLeft: 4,
    padding: 2,
    },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bottomRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  navBtn: {
    width: 30,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  rotateIconWrap: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  crossLine: {
    position: "absolute",
    width: 24,
    height: 1.5,
    backgroundColor: "#ff2b2b",
    borderRadius: 2,
  },
  crossLineLeft: {
    transform: [{ rotate: "45deg" }],
  },
  crossLineRight: {
    transform: [{ rotate: "-45deg" }],
  },
  
   divider: {
    width: 2.5,
    height: 20,
    backgroundColor: '#ffffff',
    opacity: 0.5,
  },
});
