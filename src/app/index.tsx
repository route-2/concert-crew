import { useAuth } from "@offline-protocol/id-react-native";
import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedIcon } from "@/components/animated-icon";
import { AppButton } from "@/components/app-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useMesh } from "@/providers/MeshProvider";

function LoginSection() {
  const { user, loginWithModal, logout, registerUsername, isUsernameAvailable, refreshUser } =
    useAuth();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "taken" | "saving">("idle");

  if (!user) {
    return (
      <ThemedView style={styles.stepContainer}>
        <AppButton label="Login with Offline Protocol" onPress={() => loginWithModal()} />
      </ThemedView>
    );
  }

  const username = (user as any).username as string | undefined;

  const handleClaim = async () => {
    if (!input.trim()) return;
    setStatus("checking");
    const available = await isUsernameAvailable(input.trim());
    if (!available) {
      setStatus("taken");
      return;
    }
    setStatus("saving");
    await registerUsername(input.trim());
    await refreshUser();
    setStatus("idle");
    setInput("");
  };

  return (
    <ThemedView style={styles.stepContainer}>
      <ThemedText type="small">Logged in as {user.email}</ThemedText>
      {username ? (
        <ThemedText type="small">Username: {username}</ThemedText>
      ) : (
        <>
          <ThemedText type="small">No username set yet.</ThemedText>
          <TextInput
            value={input}
            onChangeText={(text) => {
              setInput(text);
              setStatus("idle");
            }}
            placeholder="Choose a username"
            placeholderTextColor="#666"
            autoCapitalize="none"
            style={styles.input}
          />
          <AppButton
            label={
              status === "checking"
                ? "Checking..."
                : status === "saving"
                ? "Saving..."
                : "Claim username"
            }
            disabled={status === "checking" || status === "saving"}
            onPress={handleClaim}
          />
          {status === "taken" && (
            <ThemedText type="small">That username is taken.</ThemedText>
          )}
        </>
      )}
      <AppButton label="Log out" variant="ghost" onPress={() => logout()} />
    </ThemedView>
  );
}

function MeshSection() {
  const { started, peers, crew } = useMesh();

  return (
    <ThemedView style={styles.stepContainer}>
      <ThemedText type="small">
        Mesh: {started ? "started" : "starting..."}
      </ThemedText>
      <ThemedText type="small">Nearby: {peers.length}</ThemedText>
      <ThemedText type="small">Crew: {crew.length}</ThemedText>
    </ThemedView>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Concert Crew
          </ThemedText>
        </ThemedView>
        <LoginSection />
        {user && <MeshSection />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    flexDirection: "row",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: "center",
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: "stretch",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  input: {
    borderWidth: 1,
    borderColor: "#2E3135",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: "#fff",
  },
});