import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  BackHandler,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../src/components/AppHeader";
import ThemePickerModal from "../src/components/ThemePickerModal";
import { useAppTheme } from "../src/theme/ThemeContext";

/* ── dashboard item config ─────────────────────────────────── */
interface DashItem {
  key: string;
  label: string;
  route?: string;
  image?: any;
}



const DASH_ITEMS: DashItem[] = [
  {
    key: "purchasing",
    label: "Purchasing",
    image: require("../assets/images/Purchasing.png"),
  },
  {
    key: "sales",
    label: "Sales",
   image: require("../assets/images/Sales.png"),
    route: "/flash-sales",
  },
  {
    key: "inventory",
    label: "Inventory",
    
    image: require("../assets/images/Inventory.png"),
  },
  
  // {
  //   key: "receivables",
  //   label: "Receivables",
  //  image: require("../assets/images/Receivables.png"),
  // },
  // {
  //   key: "payables",
  //   label: "Payables",
  //   image: require("../assets/images/Payables.png"),
    
  // },
  // {
  //   key: "accounting",
  //   label: "Accounting",
  //  image: require("../assets/images/Accounting.png"),
  // },
  // {
  //   key: "tickets",
  //   label: "Tickets",
  //  image: require("../assets/images/Tickets.png"),
  // },
  // {
  //   key: "hr",
  //   label: "Human Resources",
  //  image: require("../assets/images/HumanResources.png"),
  // },
  // {
  //   key: "pr",
  //   label: "Public Relations",
  // image: require("../assets/images/Public Relations.png"),
  // },
  // {
  //   key: "corporate",
  //   label: "Corporate",
  //  image: require("../assets/images/Corporate.png"),
  // },
];

/* ── component ─────────────────────────────────────────────── */

export default function Dashboard() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { theme } = useAppTheme();
  const useWhiteDashboardContent = theme.name === "dark" || theme.name === "forest" || theme.name === "wine";
  const [showThemePicker, setShowThemePicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.replace("/login");
        return true;
      });
      return () => sub.remove();
    }, [router])
  );

  const handlePress = (item: DashItem) => {
    if (item.route) {
      router.push(item.route as any);
    }
  };



  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.appBackground }]} edges={["top"]}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.colors.statusBarBackground} />
      <View style={[styles.contentWrapper, { borderColor: theme.colors.cardBorder }]}>
        <AppHeader />

        {/* Title bar */}
        <View style={[styles.titleBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.divider }]}>
        <Image
          source={require("../assets/images/applogo.jpg")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.companyNameContainer}>
          <Text style={[styles.companyName, { color: useWhiteDashboardContent ? theme.colors.textInverse : theme.colors.textPrimary }]}>Selgadoe</Text>
          <View style={[styles.blackRectangle, { backgroundColor: useWhiteDashboardContent ? theme.colors.textInverse : theme.colors.primaryAlt, borderColor: useWhiteDashboardContent ? theme.colors.textInverse : theme.colors.primaryAlt }]} />
        </View>
        
        <TouchableOpacity style={styles.menuBtn} onPress={() => setShowThemePicker(true)}>
          <Ionicons name="menu-outline" size={30} color={useWhiteDashboardContent ? theme.colors.textInverse : theme.colors.icon} />
        </TouchableOpacity>
      </View>

      {/* Grid */}
      {isLandscape ? (
        <ScrollView
          style={[styles.gridScrollLandscape, { backgroundColor: theme.colors.surface }]}
          contentContainerStyle={styles.gridContentLandscape}
          showsVerticalScrollIndicator={false}
        >
          {DASH_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.cardLandscape, { backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder }]}
              activeOpacity={0.7}
              onPress={() => handlePress(item)}
            >
              <View style={styles.iconWrap}>
                {item.image && (
                  <Image
                    source={item.image}
                    style={[styles.itemImage, useWhiteDashboardContent && { tintColor: theme.colors.textInverse }]}
                    resizeMode="contain"
                  />
                )}
                {item.key !== 'sales' && (
                  <View pointerEvents="none" style={styles.crossOverlay}>
                    <View style={[styles.crossLine1, { backgroundColor: theme.colors.danger }]} />
                    <View style={[styles.crossLine2, { backgroundColor: theme.colors.danger }]} />
                  </View>
                )}
              </View>
              <Text style={[styles.cardLabel, { color: useWhiteDashboardContent ? theme.colors.textInverse : theme.colors.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.gridContainer, { backgroundColor: theme.colors.surface }] }>
          {DASH_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder }]}
              activeOpacity={0.7}
              onPress={() => handlePress(item)}
            >
              <View style={styles.iconWrap}>
                {item.image && (
                  <Image
                    source={item.image}
                    style={[styles.itemImage, useWhiteDashboardContent && { tintColor: theme.colors.textInverse }]}
                    resizeMode="contain"
                  />
                )}
                {item.key !== 'sales' && (
                  <View pointerEvents="none" style={styles.crossOverlay}>
                    <View style={[styles.crossLine1, { backgroundColor: theme.colors.danger }]} />
                    <View style={[styles.crossLine2, { backgroundColor: theme.colors.danger }]} />
                  </View>
                )}
              </View>
              <Text style={[styles.cardLabel, { color: useWhiteDashboardContent ? theme.colors.textInverse : theme.colors.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      </View>
      <ThemePickerModal visible={showThemePicker} onClose={() => setShowThemePicker(false)} />
    </SafeAreaView>
  );
}

/* ── styles ────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#006ec9",
  },
  contentWrapper: {
    flex: 1,
    marginHorizontal: 6,
    marginTop: 6,
    marginBottom: 2,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 0,
    borderColor: "#2196F3",
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderBottomWidth: 1,
    
    borderBottomColor: "#bebebe",
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 8,
    marginBottom:0
  },
  companyNameContainer: {
    flex: 1,
    position: "relative",
  },
  companyName: {
    fontSize: 28,
    fontFamily: "Montserrat_700Bold",
    color: "#1e293b",
    
  },
  blackRectangle:{
    width:  '68%',
    height: 40,
    backgroundColor: "#000000",
    borderColor: "#000000",
    position: "absolute",
    top: 0,
    left: 82,
    borderWidth: 5,
  },
  menuBtn: {
    paddingLeft: 2,
    marginRight: 8,
    marginTop: 12,
  },
  gridContainer: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#ffffff",
    paddingTop: 20,
    paddingBottom: 25,
    padding: 8,
    gap: 20,
    height: "100%",
  },
  gridScrollLandscape: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  gridContentLandscape: {
    padding: 8,
    gap: 8,
    flexDirection: "column",
  },
  card: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#38a2ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrap: {
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 80,
    width: 80,
    overflow: "hidden",
  },
  itemImage: {
    width: 70,
    height: 70,
  },
  cardLandscape: {
    height: 110,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#38a2ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontFamily: "Montserrat_600SemiBold",
    color: "#374151",
    textAlign: "center",
  },
  crossOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crossLine1: {
    position: 'absolute',
    width: '160%',
    height: 1,
    backgroundColor: '#ec1515',
    transform: [{ rotate: '45deg' }],
  },
  crossLine2: {
    position: 'absolute',
    width: '160%',
    height: 1,
    backgroundColor: '#ec1515',
    transform: [{ rotate: '-45deg' }],
  },
});
