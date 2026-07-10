import { useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { FlatList, Image, Linking, Pressable, StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton } from "@/components/app-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useMesh } from "@/providers/MeshProvider";
import { parseMessageContent } from "@/utils/message-format";

function MessageBubble({
  content,
  senderLabel,
  isRead,
}: {
  content: string;
  senderLabel: string;
  isRead?: boolean;
}) {
  if (content.startsWith("IMG:")) {
    const uri = content.slice(4);
    return (
      <ThemedView style={styles.bubbleRow}>
        <ThemedText type="small">{senderLabel}:</ThemedText>
        <Image source={{ uri }} style={styles.chatImage} resizeMode="cover" />
        {isRead !== undefined && (
          <ThemedText type="code" style={styles.readReceipt}>
            {isRead ? "Read" : "Delivered"}
          </ThemedText>
        )}
      </ThemedView>
    );
  }

  const { text, location } = parseMessageContent(content);
  return (
    <ThemedView style={styles.bubbleRow}>
      <ThemedText type="small">
        {senderLabel}: {text}
      </ThemedText>
      {location && (
        <Pressable
          onPress={() =>
            Linking.openURL(`https://maps.apple.com/?ll=${location.lat},${location.lon}`)
          }>
          <ThemedText type="code">📍 Open location in Maps</ThemedText>
        </Pressable>
      )}
      {isRead !== undefined && (
        <ThemedText type="code" style={styles.readReceipt}>
          {isRead ? "Read" : "Delivered"}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function PresenceDot({ status }: { status?: string }) {
  const color = status === "online" ? "#2E7D32" : status === "away" ? "#8A7A2E" : "#555";
  return <ThemedView style={[styles.presenceDot, { backgroundColor: color }]} />;
}

type View = "list" | "dm" | "group-create" | "group-chat";

export default function CrewScreen() {
  const {
    started,
    crew,
    messages,
    sendMessage,
    groups,
    groupMessages,
    createGroup,
    inviteToGroup,
    sendGroupMessage,
    sendGroupSos,
    sendGroupImage,
    typingByGroup,
    sendGroupTypingStatus,
    nameForPeer,
    presenceByPeer,
    typingByPeer,
    sendTypingStatus,
    markMessagesRead,
    isMessageRead,
    sendImageMessage,
    pendingImages,
    retryPendingImage,
    markConversationOpened,
    getUnreadCount,
  } = useMesh();

  const [view, setView] = useState<View>("list");
  const [search, setSearch] = useState("");
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [pickedMembers, setPickedMembers] = useState<string[]>([]);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredCrew = useMemo(() => {
    if (!search.trim()) return crew;
    const q = search.toLowerCase();
    return crew.filter(
      (m) => m.name.toLowerCase().includes(q) || m.peerId.toLowerCase().includes(q)
    );
  }, [crew, search]);

  const openDm = (peerId: string) => {
    setSelectedPeer(peerId);
    setView("dm");
    markConversationOpened(peerId);
  };

  useEffect(() => {
    if (view === "dm" && selectedPeer) {
      markMessagesRead(selectedPeer);
      markConversationOpened(selectedPeer);
    }
  }, [view, selectedPeer, messages.length]);

  useEffect(() => {
    if (view === "group-chat" && selectedGroupId) {
      markConversationOpened(selectedGroupId);
    }
  }, [view, selectedGroupId, groupMessages.length]);

  const handleDraftChange = (text: string) => {
    setDraft(text);
    if (!selectedPeer) return;
    sendTypingStatus(selectedPeer, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(selectedPeer, false);
    }, 2000);
  };

  const handleSendDm = async () => {
    if (!selectedPeer || !draft.trim()) return;
    setDmError(null);
    const result = await sendMessage(selectedPeer, draft.trim());
    if (result) {
      setDraft("");
    } else {
      setDmError("Message failed to send — mesh connection may be down. Try again.");
    }
  };

  const handleShareLocationDm = async () => {
    if (!selectedPeer) return;
    setSharingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const position = await Location.getCurrentPositionAsync({});
      await sendMessage(
        selectedPeer,
        `LOC:${position.coords.latitude},${position.coords.longitude}`
      );
    } finally {
      setSharingLocation(false);
    }
  };

  const handleSendPhotoDm = async () => {
    if (!selectedPeer) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.3,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0].base64) return;
    setSendingImage(true);
    try {
      await sendImageMessage(selectedPeer, result.assets[0].base64, "photo.jpg");
    } finally {
      setSendingImage(false);
    }
  };

  const handleShareLocationGroup = async () => {
    if (!selectedGroupId) return;
    setSharingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const position = await Location.getCurrentPositionAsync({});
      await sendGroupMessage(
        selectedGroupId,
        `LOC:${position.coords.latitude},${position.coords.longitude}`
      );
    } finally {
      setSharingLocation(false);
    }
  };

  const togglePickedMember = (peerId: string) => {
    setPickedMembers((prev) =>
      prev.includes(peerId) ? prev.filter((id) => id !== peerId) : [...prev, peerId]
    );
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || pickedMembers.length === 0) return;
    const groupId = await createGroup(newGroupName.trim());
    if (!groupId) return;
    for (const peerId of pickedMembers) {
      await inviteToGroup(groupId, peerId);
    }
    setNewGroupName("");
    setPickedMembers([]);
    setSelectedGroupId(groupId);
    setView("group-chat");
  };

  const openGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setView("group-chat");
    markConversationOpened(groupId);
  };

  const handleSendGroup = async () => {
    if (!selectedGroupId || !draft.trim()) return;
    await sendGroupMessage(selectedGroupId, draft.trim());
    setDraft("");
  };

  if (view === "dm" && selectedPeer) {
    const isTyping = typingByPeer[selectedPeer];
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <AppButton label="‹ Back" variant="ghost" onPress={() => setView("list")} style={styles.backButton} />
          <ThemedView style={styles.dmHeader}>
            <PresenceDot status={presenceByPeer[selectedPeer]} />
            <ThemedText type="title">{nameForPeer(selectedPeer)}</ThemedText>
          </ThemedView>
          {isTyping && <ThemedText type="small">typing...</ThemedText>}
          {pendingImages
            .filter((p) => p.recipient === selectedPeer)
            .map((p) => (
              <ThemedView key={p.id} style={styles.pendingRow}>
                <ThemedText type="small">
                  Photo {p.status === "sending" ? "sending..." : "failed to send"}
                </ThemedText>
                {p.status === "failed" && (
                  <AppButton label="Retry" variant="ghost" onPress={() => retryPendingImage(p.id)} />
                )}
              </ThemedView>
            ))}
          <FlatList
            style={styles.messageList}
            data={messages.filter(
              (m) => m.sender === selectedPeer || m.recipient === selectedPeer
            )}
            keyExtractor={(m) => m.message_id}
            renderItem={({ item }) => (
              <MessageBubble
                content={item.content}
                senderLabel={nameForPeer(item.sender)}
                isRead={item.sender !== selectedPeer ? isMessageRead(item.message_id) : undefined}
              />
            )}
          />
          {dmError && (
            <ThemedText type="small" style={styles.errorText}>
              {dmError}
            </ThemedText>
          )}
          <ThemedView style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={handleDraftChange}
              placeholder="Message..."
              placeholderTextColor="#666"
              style={styles.inputFlex}
            />
            <AppButton label={sendingImage ? "..." : "🖼️"} onPress={handleSendPhotoDm} />
            <AppButton label={sharingLocation ? "..." : "📍"} onPress={handleShareLocationDm} />
            <AppButton label="Send" variant="success" onPress={handleSendDm} />
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (view === "group-create") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <AppButton label="‹ Back" variant="ghost" onPress={() => setView("list")} style={styles.backButton} />
          <ThemedText type="title">New Group</ThemedText>
          <TextInput
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="Group name"
            placeholderTextColor="#666"
            style={styles.input}
          />
          <ThemedText type="small">Select members:</ThemedText>
          <FlatList
            data={crew}
            keyExtractor={(m) => m.peerId}
            renderItem={({ item }) => {
              const picked = pickedMembers.includes(item.peerId);
              return (
                <Pressable
                  onPress={() => togglePickedMember(item.peerId)}
                  style={[styles.peerRow, picked && styles.peerRowSelected]}>
                  <PresenceDot status={presenceByPeer[item.peerId]} />
                  <ThemedText type="small">
                    {picked ? "✓ " : ""}
                    {item.name}
                  </ThemedText>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <ThemedText type="small">No crew members to add yet.</ThemedText>
            }
          />
          <AppButton label="Create Group" variant="success" onPress={handleCreateGroup} />
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (view === "group-chat" && selectedGroupId) {
    const group = groups.find((g) => g.groupId === selectedGroupId);
    const typingUsers = typingByGroup[selectedGroupId] || [];

    const handleGroupDraftChange = (text: string) => {
      setDraft(text);
      sendGroupTypingStatus(selectedGroupId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendGroupTypingStatus(selectedGroupId, false);
      }, 2000);
    };

    const handleSendPhotoGroup = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.3,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets[0].base64) return;
      setSendingImage(true);
      try {
        await sendGroupImage(selectedGroupId, result.assets[0].base64);
      } finally {
        setSendingImage(false);
      }
    };

    const handleGroupSos = async () => {
      let locationSuffix = "";
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const position = await Location.getCurrentPositionAsync({});
          locationSuffix = ` LOC:${position.coords.latitude},${position.coords.longitude}`;
        }
      } catch {}
      await sendGroupSos(selectedGroupId, locationSuffix);
    };

    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <AppButton label="‹ Back" variant="ghost" onPress={() => setView("list")} style={styles.backButton} />
          <ThemedText type="title">{group?.name ?? "Group"}</ThemedText>
          <FlatList
            style={styles.messageList}
            data={groupMessages.filter((m) => m.group_id === selectedGroupId)}
            keyExtractor={(m) => m.message_id}
            renderItem={({ item }) => (
              <MessageBubble content={item.content} senderLabel={nameForPeer(item.sender)} />
            )}
          />
          {typingUsers.length > 0 && (
            <ThemedText type="small">
              {typingUsers.map((id) => nameForPeer(id)).join(", ")} typing...
            </ThemedText>
          )}
          <ThemedView style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={handleGroupDraftChange}
              placeholder="Message..."
              placeholderTextColor="#666"
              style={styles.inputFlex}
            />
            <AppButton label={sendingImage ? "..." : "🖼️"} onPress={handleSendPhotoGroup} />
            <AppButton label={sharingLocation ? "..." : "📍"} onPress={handleShareLocationGroup} />
            <AppButton label="🚨" variant="danger" onPress={handleGroupSos} />
            <AppButton label="Send" variant="success" onPress={handleSendGroup} />
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">My Crew</ThemedText>
        <ThemedText type="small">
          Mesh: {started ? "active" : "starting..."}
        </ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search crew..."
          placeholderTextColor="#666"
          style={styles.input}
        />

        <ThemedText type="small" style={styles.sectionLabel}>
          Crew ({filteredCrew.length})
        </ThemedText>
        <FlatList
          data={filteredCrew}
          keyExtractor={(m) => m.peerId}
          style={styles.peerList}
          renderItem={({ item }) => {
            const unread = getUnreadCount(item.peerId, false);
            return (
              <Pressable onPress={() => openDm(item.peerId)} style={styles.peerRow}>
                <PresenceDot status={presenceByPeer[item.peerId]} />
                <ThemedText type="small" style={styles.peerNameFlex}>
                  {item.name}
                </ThemedText>
                {unread > 0 && (
                  <ThemedView style={styles.unreadBadge}>
                    <ThemedText type="code" style={styles.unreadBadgeText}>
                      {unread > 9 ? "9+" : unread}
                    </ThemedText>
                  </ThemedView>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <ThemedText type="small">
              No crew yet. Add verified ticket holders from the Explore tab.
            </ThemedText>
          }
        />

        <ThemedText type="small" style={styles.sectionLabel}>
          Groups ({groups.length})
        </ThemedText>
        <FlatList
          data={groups}
          keyExtractor={(g) => g.groupId}
          style={styles.peerList}
          renderItem={({ item }) => {
            const unread = getUnreadCount(item.groupId, true);
            return (
              <Pressable onPress={() => openGroup(item.groupId)} style={styles.peerRow}>
                <ThemedText type="small" style={styles.peerNameFlex}>
                  {item.name}
                </ThemedText>
                <ThemedText type="code">{item.memberIds.length} members</ThemedText>
                {unread > 0 && (
                  <ThemedView style={styles.unreadBadge}>
                    <ThemedText type="code" style={styles.unreadBadgeText}>
                      {unread > 9 ? "9+" : unread}
                    </ThemedText>
                  </ThemedView>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <ThemedText type="small">No groups yet.</ThemedText>
          }
        />
        <AppButton label="+ New Group" variant="ghost" onPress={() => setView("group-create")} />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  sectionLabel: { marginTop: Spacing.two },
  peerList: { maxHeight: 160 },
  messageList: { flex: 1 },
  bubbleRow: { gap: Spacing.one, marginBottom: Spacing.one },
  dmHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  chatImage: { width: 200, height: 200, borderRadius: Spacing.two },
  readReceipt: { opacity: 0.6 },
  errorText: { color: "#D64545" },
  backButton: { alignSelf: "flex-start" },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    marginBottom: Spacing.one,
    backgroundColor: "#1C1D1F",
  },
  peerRowSelected: { backgroundColor: "#2E3135" },
  peerNameFlex: { flex: 1 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#D64545",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11 },
  input: {
    borderWidth: 1,
    borderColor: "#2E3135",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: "#fff",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  inputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2E3135",
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: "#fff",
  },
  pendingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.two,
    backgroundColor: "#1C1D1F",
    borderRadius: Spacing.two,
    marginBottom: Spacing.one,
  },
});