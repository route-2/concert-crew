import * as Location from "expo-location";
import * as Network from "expo-network";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/app-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { estimateMetersFromRssi, useMesh } from "@/providers/MeshProvider";

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hashToAngle(peerId: string) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = (hash * 31 + peerId.charCodeAt(i)) % 360;
  }
  return (hash * Math.PI) / 180;
}

const SCREEN = Dimensions.get("window");
const MAP_WIDTH = SCREEN.width;
const MAP_HEIGHT = SCREEN.height;
const YOU_X = MAP_WIDTH / 2;
const YOU_Y = MAP_HEIGHT / 2;
const MAX_PIXEL_RADIUS = Math.min(MAP_WIDTH, MAP_HEIGHT) * 0.35;
const METERS_FOR_MAX_RADIUS = 15;

const RING_SIZE = Math.min(SCREEN.width, SCREEN.height) * 0.6;

function FindingOverlay({
  name,
  meters,
  angleRad,
  onClose,
}: {
  name: string;
  meters: number | null;
  angleRad: number;
  onClose: () => void;
}) {
  const angleDeg = (angleRad * 180) / Math.PI;

  return (
    <View style={styles.findingOverlay}>
      <SafeAreaView style={styles.findingSafeArea}>
        <View style={styles.findingHeader}>
          <ThemedText type="small" style={styles.findingLabel}>
            FINDING
          </ThemedText>
          <ThemedText type="title" style={styles.findingName}>
            {name}
          </ThemedText>
        </View>

        <View style={styles.findingRingWrap}>
          <View style={styles.findingRing}>
            <View
              style={[
                styles.findingArrow,
                { transform: [{ rotate: `${angleDeg}deg` }] },
              ]}
            />
          </View>
        </View>

        <View style={styles.findingFooter}>
          <ThemedText type="title" style={styles.findingMeters}>
            {meters !== null ? `${meters.toFixed(1)} m` : "—"}
          </ThemedText>
          <ThemedText type="small" style={styles.findingSubtext}>
            estimated via Bluetooth signal
          </ThemedText>

          <Pressable onPress={onClose} style={styles.findingCloseButton}>
            <ThemedText type="title" style={styles.findingCloseText}>
              ✕
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function VenueMap() {
  const { crew, rssiByPeer } = useMesh();
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  const selectedMember = crew.find((m) => m.peerId === selectedPeerId) ?? null;

  if (selectedMember) {
    const rssi = rssiByPeer[selectedMember.peerId];
    const meters = estimateMetersFromRssi(rssi);
    const angle = hashToAngle(selectedMember.peerId);
    return (
      <FindingOverlay
        name={selectedMember.name}
        meters={meters !== null ? Math.min(meters, METERS_FOR_MAX_RADIUS) : null}
        angleRad={angle}
        onClose={() => setSelectedPeerId(null)}
      />
    );
  }

  return (
    <ThemedView style={styles.venueContainer}>
      <View style={styles.mapWrapper}>
        <Image
          source={require("../../assets/images/map2.png")}
          style={styles.mapImageRotated}
          contentFit="cover"
        />
        <View style={[styles.youPin, { left: YOU_X - 16, top: YOU_Y - 16 }]}>
          <ThemedText type="code" style={styles.pinLabel}>
            You
          </ThemedText>
        </View>

        {crew.map((member) => {
          const rssi = rssiByPeer[member.peerId];
          const meters = estimateMetersFromRssi(rssi);
          const angle = hashToAngle(member.peerId);

          const clampedMeters = meters !== null ? Math.min(meters, METERS_FOR_MAX_RADIUS) : null;
          const radius =
            clampedMeters === null
              ? MAX_PIXEL_RADIUS * 0.25
              : (clampedMeters / METERS_FOR_MAX_RADIUS) * MAX_PIXEL_RADIUS;

          const x = YOU_X + radius * Math.cos(angle);
          const y = YOU_Y + radius * Math.sin(angle);

          return (
            <Pressable
              key={member.peerId}
              onPress={() => setSelectedPeerId(member.peerId)}
              style={[styles.peerPin, { left: x - 22, top: y - 30 }]}>
              <View style={[styles.arrow, { transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }] }]} />
              <View style={styles.peerDot} />
              <ThemedText type="code" style={styles.peerLabel} numberOfLines={1}>
                {member.name}
              </ThemedText>
              <ThemedText type="code" style={styles.peerMeters}>
                {meters !== null ? `${Math.round(meters)}m` : "?"}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {crew.length === 0 && (
        <ThemedText type="small" style={styles.emptyHint}>
          No crew nearby yet.
        </ThemedText>
      )}
    </ThemedView>
  );
}

export default function MapScreen() {
  const { crew, sharedLocations, nameForPeer } = useMesh();
  const [myLocation, setMyLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [hasInternet, setHasInternet] = useState<boolean | null>(null);

  useEffect(() => {
    const ExpoImage = require("expo-image").Image;
    ExpoImage.prefetch(require("../../assets/images/map2.png"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (!cancelled) {
          setHasInternet(Boolean(state.isConnected && state.isInternetReachable));
        }
      } catch {
        if (!cancelled) setHasInternet(false);
      }
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2 },
        (loc) => setMyLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude })
      );
    })();
    return () => subscription?.remove();
  }, []);

  const pinned = crew.filter((m) => sharedLocations[m.peerId]);

  const distanceToSelected =
    selectedPeer && myLocation && sharedLocations[selectedPeer]
      ? haversineMeters(
          myLocation.lat,
          myLocation.lon,
          sharedLocations[selectedPeer].lat,
          sharedLocations[selectedPeer].lon
        )
      : null;

  if (hasInternet === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.center}>
          <ThemedText type="small">Checking connectivity...</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!hasInternet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <VenueMap />
      </SafeAreaView>
    );
  }

  if (!myLocation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.center}>
          <ThemedText type="small">Getting your location...</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <MapView
        style={styles.map}
        showsUserLocation
        followsUserLocation
        initialRegion={{
          latitude: myLocation.lat,
          longitude: myLocation.lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}>
        {pinned.map((member) => {
          const loc = sharedLocations[member.peerId];
          return (
            <Marker
              key={member.peerId}
              coordinate={{ latitude: loc.lat, longitude: loc.lon }}
              title={member.name}
              onPress={() => setSelectedPeer(member.peerId)}
            />
          );
        })}
      </MapView>

      {distanceToSelected !== null && selectedPeer && (
        <ThemedView style={styles.banner}>
          <ThemedText type="small" style={styles.bannerText}>
            {nameForPeer(selectedPeer)}: {Math.round(distanceToSelected)}m away
          </ThemedText>
        </ThemedView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  mapImageRotated: {
    position: "absolute",
    width: MAP_HEIGHT,
    height: MAP_WIDTH,
    top: (MAP_HEIGHT - MAP_WIDTH) / 2,
    left: (MAP_WIDTH - MAP_HEIGHT) / 2,
    transform: [{ rotate: "90deg" }],
  },
  banner: {
    position: "absolute",
    top: Spacing.four,
    left: Spacing.four,
    right: Spacing.four,
    backgroundColor: "#1C1D1F",
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  bannerText: { color: "#fff" },
  venueContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  emptyHint: { opacity: 0.6, marginTop: Spacing.three },
  mapWrapper: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  youPin: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2E7D32",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  pinLabel: { color: "#fff", fontSize: 9 },
  peerPin: {
    position: "absolute",
    width: 44,
    alignItems: "center",
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#4C9EF2",
    marginBottom: 2,
  },
  peerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4C9EF2",
    borderWidth: 1,
    borderColor: "#fff",
  },
  peerLabel: { color: "#fff", fontSize: 9, marginTop: 2 },
  peerMeters: { color: "#9AB", fontSize: 8 },

  findingOverlay: {
    flex: 1,
    backgroundColor: "#000",
  },
  findingSafeArea: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
  },
  findingHeader: { gap: Spacing.one },
  findingLabel: { color: "#888", letterSpacing: 1 },
  findingName: { color: "#fff", fontSize: 32 },
  findingRingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  findingRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: "#2E3135",
    alignItems: "center",
    justifyContent: "center",
  },
  findingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 26,
    borderRightWidth: 26,
    borderBottomWidth: 44,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#fff",
  },
  findingFooter: { alignItems: "center", gap: Spacing.two },
  findingMeters: { color: "#fff", fontSize: 44 },
  findingSubtext: { color: "#777" },
  findingCloseButton: {
    marginTop: Spacing.three,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1C1D1F",
    alignItems: "center",
    justifyContent: "center",
  },
  findingCloseText: { color: "#fff", fontSize: 20 },
});