import { useConnections } from "@offline-protocol/id-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/app-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { NEARBY_EVENTS } from "@/constants/events";
import { useMesh } from "@/providers/MeshProvider";
import type { EventPostType } from "@/providers/MeshProvider";

export default function ExploreScreen() {
  const { connections, addConnection } = useConnections();
  const friendUsernames = connections.map((c) => c.peer);

  const {
    myName,
    tickets,
    activeTicket,
    buyTicket,
    setActiveEvent,
    checkOut,
    removeTicket,
    discoveredTicketHolders,
    crew,
    addToCrew,
    removeFromCrew,
    isEventAdmin,
    eventPosts,
    sendEventPost,
  } = useMesh();

  const [friendInput, setFriendInput] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);

  const [customEventName, setCustomEventName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [postType, setPostType] = useState<EventPostType>("meetup");
  const [postContent, setPostContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddFriend = async () => {
    if (!friendInput.trim()) return;
    setAddingFriend(true);
    await addConnection(friendInput.trim());
    setFriendInput("");
    setAddingFriend(false);
  };

  const handleCreateEvent = () => {
    if (!customEventName.trim()) return;
    buyTicket(customEventName.trim());
    setCustomEventName("");
    setShowCreateForm(false);
    showToast(`Created and checked into ${customEventName.trim()}`);
  };

  const handlePost = async () => {
    if (!activeTicket || !postContent.trim()) return;
    setPosting(true);
    const delivered = await sendEventPost(activeTicket.eventName, postType, postContent.trim());
    setPosting(false);
    setPostContent("");
    showToast(
      delivered.length > 0
        ? `Posted to ${delivered.length} attendee(s)`
        : "Posted (no one nearby yet to receive it)"
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.safeArea}
        contentContainerStyle={styles.container}>
        <ThemedText type="title">Add Peers</ThemedText>

        {toast && (
          <ThemedView style={styles.toast}>
            <ThemedText type="small" style={styles.toastText}>
              {toast}
            </ThemedText>
          </ThemedView>
        )}

        <ThemedView style={styles.ticketBox}>
          {activeTicket ? (
            <ThemedView style={styles.checkedInRow}>
              <ThemedView style={styles.flexShrink}>
                <ThemedText type="small">
                  Checked into: {activeTicket.eventName}
                </ThemedText>
              </ThemedView>
              <AppButton label="Check out" variant="danger" onPress={checkOut} />
            </ThemedView>
          ) : (
            <ThemedText type="small">Not checked into any event.</ThemedText>
          )}

          {tickets.length > 0 && (
            <>
              <ThemedText type="small" style={styles.sectionLabel}>
                Events you've checked into before
              </ThemedText>
              {tickets.map((t) => (
                <ThemedView key={t.eventName} style={styles.ticketRow}>
                  <ThemedView style={styles.flexShrink}>
                    <ThemedText type="small" numberOfLines={2}>
                      {t.eventName}
                    </ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.ticketRowActions}>
                    {t.eventName !== activeTicket?.eventName && (
                      <AppButton
                        label="Check in"
                        variant="success"
                        onPress={() => setActiveEvent(t.eventName)}
                      />
                    )}
                    <AppButton
                      label="Remove"
                      variant="danger"
                      onPress={() => removeTicket(t.eventName)}
                    />
                  </ThemedView>
                </ThemedView>
              ))}
            </>
          )}

          <ThemedText type="small" style={styles.sectionLabel}>
            Nearby events
          </ThemedText>
          {NEARBY_EVENTS.map((item) => {
            const alreadyHave = tickets.some((t) => t.eventName === item.name);
            return (
              <ThemedView key={item.name} style={styles.eventRow}>
                <ThemedView style={styles.flexShrink}>
                  <ThemedText type="small" numberOfLines={2}>
                    {item.name}
                  </ThemedText>
                  <ThemedText type="code">{item.region}</ThemedText>
                </ThemedView>
                <AppButton
                  label="Check in"
                  onPress={() =>
                    alreadyHave ? setActiveEvent(item.name) : buyTicket(item.name)
                  }
                />
              </ThemedView>
            );
          })}

          <ThemedText type="small" style={styles.sectionLabel}>
            Create your own event
          </ThemedText>
          {showCreateForm ? (
            <>
              <TextInput
                value={customEventName}
                onChangeText={setCustomEventName}
                placeholder="Event name"
                style={styles.input}
                placeholderTextColor="#666"
              />
              <AppButton label="Create & Check In" onPress={handleCreateEvent} />
            </>
          ) : (
            <AppButton label="+ Create Event" variant="ghost" onPress={() => setShowCreateForm(true)} />
          )}
        </ThemedView>

        {activeTicket && (
          <ThemedView style={styles.eventBoard}>
            <ThemedText type="title" style={styles.eventBoardTitle}>
              Event Board — {activeTicket.eventName}
            </ThemedText>

            {isEventAdmin && (
              <ThemedView style={styles.postForm}>
                <ThemedView style={styles.typeToggleRow}>
                  <AppButton
                    label="📍 Meetup pin"
                    variant={postType === "meetup" ? "success" : "default"}
                    onPress={() => setPostType("meetup")}
                    style={styles.typeToggleButton}
                  />
                  <AppButton
                    label="🎵 Setlist note"
                    variant={postType === "setlist" ? "success" : "default"}
                    onPress={() => setPostType("setlist")}
                    style={styles.typeToggleButton}
                  />
                </ThemedView>
                <TextInput
                  value={postContent}
                  onChangeText={setPostContent}
                  placeholder={
                    postType === "meetup"
                      ? "e.g. Meeting at the merch stand at 9pm"
                      : "e.g. Next song is Yellow"
                  }
                  style={styles.input}
                  placeholderTextColor="#666"
                  multiline
                />
                <AppButton
                  label={posting ? "Posting..." : "Post to event"}
                  disabled={posting}
                  onPress={handlePost}
                />
              </ThemedView>
            )}

            <ThemedText type="small" style={styles.sectionLabel}>
              Feed
            </ThemedText>
            {eventPosts.filter((p) => p.eventName === activeTicket.eventName).length === 0 ? (
              <ThemedText type="small">No posts yet for this event.</ThemedText>
            ) : (
              eventPosts
                .filter((p) => p.eventName === activeTicket.eventName)
                .slice()
                .reverse()
                .map((post) => (
                  <ThemedView key={post.id} style={styles.postRow}>
                    <ThemedView style={styles.postHeader}>
                      <ThemedText type="small" style={styles.adminBadge}>
                        Admin ✓
                      </ThemedText>
                      <ThemedText type="code">
                        {post.type === "meetup" ? "📍 Meetup" : "🎵 Setlist"}
                      </ThemedText>
                    </ThemedView>
                    <ThemedText type="small">{post.content}</ThemedText>
                  </ThemedView>
                ))
            )}
          </ThemedView>
        )}

        <ThemedText type="small" style={styles.sectionLabel}>
          Add friend by username
        </ThemedText>
        <TextInput
          value={friendInput}
          onChangeText={setFriendInput}
          placeholder="username"
          placeholderTextColor="#666"
          autoCapitalize="none"
          style={styles.input}
        />
        <AppButton
          label={addingFriend ? "Adding..." : "Add friend"}
          disabled={addingFriend}
          onPress={handleAddFriend}
        />

        <ThemedText type="small" style={styles.sectionLabel}>
          Nearby verified attendees ({discoveredTicketHolders.length})
        </ThemedText>
        {discoveredTicketHolders.length === 0 ? (
          <ThemedText type="small">
            {activeTicket
              ? "Scanning for other verified attendees nearby..."
              : "Check into an event first to start discovery."}
          </ThemedText>
        ) : (
          discoveredTicketHolders.map((item) => {
            const isInCrew = crew.some((m) => m.peerId === item.peerId);
            const isFriend = friendUsernames.includes(item.username);
            return (
              <ThemedView key={item.peerId} style={styles.holderRow}>
                <ThemedView style={styles.flexShrink}>
                  <ThemedText type="small" numberOfLines={1}>
                    {item.name}
                    {isInCrew ? " · In your crew" : ""}
                    {isFriend ? " · Friend" : ""}
                  </ThemedText>
                  <ThemedText type="code" numberOfLines={1}>
                    {item.eventName} · {item.hopCount} hop(s)
                  </ThemedText>
                </ThemedView>
                <AppButton
                  label={isInCrew ? "Remove" : "Add"}
                  variant={isInCrew ? "danger" : "success"}
                  onPress={() =>
                    isInCrew
                      ? removeFromCrew(item.peerId)
                      : addToCrew(item.peerId, item.name)
                  }
                />
              </ThemedView>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  toast: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: "#1C1D1F",
  },
  toastText: { color: "#fff" },
  ticketBox: { paddingVertical: Spacing.two, gap: Spacing.two },
  sectionLabel: { marginTop: Spacing.two },
  flexShrink: { flexShrink: 1, flex: 1 },
  checkedInRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  ticketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
    backgroundColor: "#1C1D1F",
    gap: Spacing.two,
  },
  ticketRowActions: { flexDirection: "row", gap: Spacing.two },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
    backgroundColor: "#1C1D1F",
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderColor: "#2E3135",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: "#fff",
  },
  holderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
    backgroundColor: "#1C1D1F",
    gap: Spacing.two,
  },
  eventBoard: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: "#141516",
    borderWidth: 1,
    borderColor: "#2E3135",
  },
  eventBoardTitle: { fontSize: 16 },
  postForm: { gap: Spacing.two },
  typeToggleRow: { flexDirection: "row", gap: Spacing.two },
  typeToggleButton: { flex: 1 },
  postRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: "#1C1D1F",
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  postHeader: { flexDirection: "row", gap: Spacing.two, alignItems: "center" },
  adminBadge: { color: "#4C9EF2", fontWeight: "700" as const },
});