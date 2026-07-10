import * as Location from "expo-location";
import { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/app-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useMesh } from "@/providers/MeshProvider";

export default function SosScreen() {
  const {
    started,
    peers,
    sendMessage,
    myName,
    nameForPeer,
    tickets,
    sendEventSos,
    eventAlerts,
  } = useMesh();
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [eventMessage, setEventMessage] = useState("");
  const [sendingEventSos, setSendingEventSos] = useState(false);

  const showConfirmation = (text: string) => {
    setConfirmation(text);
    setTimeout(() => setConfirmation(null), 3000);
  };

  const triggerSos = async () => {
    if (peers.length === 0) {
      showConfirmation("No one nearby to receive an SOS yet.");
      return;
    }
    setSending(true);

    let locationSuffix = "";
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const position = await Location.getCurrentPositionAsync({});
        locationSuffix = ` LOC:${position.coords.latitude},${position.coords.longitude}`;
      }
    } catch {}

    const results = await Promise.all(
      peers.map((peerId) =>
        sendMessage(peerId, `SOS: ${myName} needs help.${locationSuffix}`)
      )
    );
    const delivered = peers.filter((_, i) => results[i]);
    setSentTo(delivered);
    setSending(false);
    showConfirmation(`SOS sent to ${delivered.length} nearby device(s).`);
  };

  const triggerEventSos = async () => {
    if (!selectedEvent || !eventMessage.trim()) return;
    setSendingEventSos(true);
    const delivered = await sendEventSos(selectedEvent, eventMessage.trim());
    setSendingEventSos(false);
    setEventMessage("");
    showConfirmation(
      delivered.length > 0
        ? `Event alert sent to ${delivered.length} checked-in attendee(s).`
        : "No one from this event is currently nearby."
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}>
        <ScrollView
          style={styles.safeArea}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Emergency SOS</ThemedText>
          <ThemedText type="small">
            Mesh: {started ? "active" : "starting..."} · Nearby: {peers.length}
          </ThemedText>

          <Pressable onPress={triggerSos} style={styles.sosButton} disabled={sending}>
            <ThemedText type="title" style={styles.sosText}>
              {sending ? "..." : "SOS"}
            </ThemedText>
          </Pressable>

          <ThemedText type="small" style={styles.centerText}>
            Tap to broadcast an SOS with your location to everyone currently in mesh range.
          </ThemedText>

          {confirmation && (
            <ThemedView style={styles.toast}>
              <ThemedText type="small" style={styles.toastText}>
                {confirmation}
              </ThemedText>
            </ThemedView>
          )}

          {sentTo.length > 0 && (
            <ThemedView style={styles.sentBox}>
              <ThemedText type="small">Last SOS sent to:</ThemedText>
              {sentTo.map((id) => (
                <ThemedText key={id} type="code">
                  {nameForPeer(id)}
                </ThemedText>
              ))}
            </ThemedView>
          )}

          <ThemedView style={styles.divider} />

          <ThemedText type="title" style={styles.eventSectionTitle}>
            Event Alert
          </ThemedText>
          <ThemedText type="small" style={styles.leftText}>
            Send a lost & found / missing person alert to everyone checked into an event.
          </ThemedText>

          <ThemedText type="small" style={styles.sectionLabel}>
            Your events
          </ThemedText>
          <FlatList
            data={tickets}
            keyExtractor={(t) => t.eventName}
            horizontal
            style={styles.eventChipList}
            renderItem={({ item }) => (
              <AppButton
                label={item.eventName}
                variant={selectedEvent === item.eventName ? "success" : "default"}
                onPress={() => setSelectedEvent(item.eventName)}
                style={styles.eventChipButton}
              />
            )}
            ListEmptyComponent={
              <ThemedText type="small">
                Check into an event from the Explore tab first.
              </ThemedText>
            }
          />

          {selectedEvent && (
            <ThemedView style={styles.eventForm}>
              <TextInput
                value={eventMessage}
                onChangeText={setEventMessage}
                placeholder="e.g. Lost my friend, wearing a red jacket near stage left"
                placeholderTextColor="#666"
                style={styles.input}
                multiline
              />
              <AppButton
                label={sendingEventSos ? "Sending..." : `Alert everyone at ${selectedEvent}`}
                variant="danger"
                disabled={sendingEventSos}
                onPress={triggerEventSos}
              />

              <ThemedText type="small" style={styles.sectionLabel}>
                Alert history for {selectedEvent}
              </ThemedText>
              {eventAlerts.filter((a) => a.eventName === selectedEvent).length === 0 ? (
                <ThemedText type="small">No alerts yet for this event.</ThemedText>
              ) : (
                eventAlerts
                  .filter((a) => a.eventName === selectedEvent)
                  .map((item) => (
                    <ThemedView key={item.id} style={styles.alertRow}>
                      <ThemedText type="small">
                        {nameForPeer(item.sender)}: {item.message}
                      </ThemedText>
                    </ThemedView>
                  ))
              )}
            </ThemedView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
    alignItems: "center",
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#D64545",
    alignItems: "center",
    justifyContent: "center",
  },
  sosText: { color: "#fff" },
  centerText: { textAlign: "center" },
  leftText: { alignSelf: "flex-start" },
  sentBox: { gap: Spacing.two, alignItems: "center" },
  toast: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: "#1C1D1F",
  },
  toastText: { color: "#fff" },
  divider: {
    height: 1,
    alignSelf: "stretch",
    backgroundColor: "#2E3135",
    marginVertical: Spacing.three,
  },
  eventSectionTitle: { alignSelf: "flex-start" },
  sectionLabel: { alignSelf: "flex-start", marginTop: Spacing.two },
  eventChipList: { alignSelf: "stretch" },
  eventChipButton: { marginRight: Spacing.two },
  eventForm: { alignSelf: "stretch", gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderColor: "#2E3135",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: "#fff",
    minHeight: 60,
  },
  alertRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: "#1C1D1F",
    marginBottom: Spacing.one,
    alignSelf: "stretch",
  },
});