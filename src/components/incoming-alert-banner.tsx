import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useMesh } from "@/providers/MeshProvider";

export function IncomingAlertBanner() {
  const { latestIncomingAlert, dismissIncomingAlert, nameForPeer } = useMesh();
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (!latestIncomingAlert) return;

    if (latestIncomingAlert.isSos) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    Animated.sequence([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.delay(latestIncomingAlert.isSos ? 5000 : 3000),
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      dismissIncomingAlert();
    });
  }, [latestIncomingAlert]);

  if (!latestIncomingAlert) return null;

  const name = nameForPeer(latestIncomingAlert.peerId);

  return (
    <Animated.View
      style={[
        styles.banner,
        latestIncomingAlert.isSos && styles.bannerSos,
        { transform: [{ translateY }] },
      ]}>
      <Pressable onPress={dismissIncomingAlert} style={styles.content}>
        <ThemedText type="small" style={styles.title}>
          {latestIncomingAlert.isSos ? "🚨 SOS" : "New message"} · {name}
        </ThemedText>
        <ThemedText type="small" style={styles.body} numberOfLines={2}>
          {latestIncomingAlert.content}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "#1C1D1F",
    paddingTop: 56,
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: "#2E3135",
  },
  bannerSos: {
    backgroundColor: "#B23A3A",
  },
  content: { gap: Spacing.one },
  title: { fontWeight: "700" as const, color: "#fff" },
  body: { color: "#fff" },
});