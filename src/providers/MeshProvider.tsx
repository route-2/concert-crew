import { useAuth, useConnections } from "@offline-protocol/id-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OfflineProtocol,
  MeshServices,
  MessagePriority,
  type MessageReceivedEvent,
  type NeighborDiscoveredEvent,
  type ServiceDiscoveredEvent,
  type GroupMessageReceivedEvent,
} from "@offline-protocol/mesh-sdk";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";

const TICKET_SERVICE_ID = "concert-crew.ticket.v1";
const SOS_PREFIX = "SOS:";
const EVENTPOST_PREFIX = "EVENTPOST:";
const ADMIN_EMAIL = "ruthurao@gmail.com";

async function withRetry(fn: () => Promise<any>, attempts = 3, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === attempts - 1) {
        console.warn("[MeshProvider] action failed after retries:", err);
      } else {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

function smoothRssi(previous: number | undefined, next: number, alpha = 0.2) {
  if (previous === undefined) return next;
  return alpha * next + (1 - alpha) * previous;
}

export type ProximityLevel = "very-close" | "nearby" | "far" | "very-far" | "unknown";

export function proximityFromRssi(rssi: number | undefined): ProximityLevel {
  if (rssi === undefined) return "unknown";
  if (rssi > -60) return "very-close";
  if (rssi > -75) return "nearby";
  if (rssi > -85) return "far";
  return "very-far";
}
const MEASURED_POWER_AT_1M = -59;
const ENVIRONMENT_FACTOR = 2.2;

export function estimateMetersFromRssi(rssi: number | undefined): number | null {
  if (rssi === undefined) return null;
  return Math.pow(10, (MEASURED_POWER_AT_1M - rssi) / (10 * ENVIRONMENT_FACTOR));
}

export const PROXIMITY_LABELS: Record<ProximityLevel, string> = {
  "very-close": "Very close",
  nearby: "Nearby",
  far: "Far",
  "very-far": "Very far / weak signal",
  unknown: "Unknown",
};

export interface Ticket {
  eventName: string;
  ticketNumber: string;
}

export interface DiscoveredTicketHolder {
  peerId: string;
  ticketNumber: string;
  name: string;
  username: string;
  eventName: string;
  hopCount: number;
}

export interface SharedLocation {
  peerId: string;
  lat: number;
  lon: number;
  timestamp: number;
}

export interface CrewMember {
  peerId: string;
  name: string;
}

export interface MeshGroup {
  groupId: string;
  name: string;
  memberIds: string[];
}

export interface IncomingAlert {
  id: string;
  peerId: string;
  content: string;
  isSos: boolean;
  timestamp: number;
}

export interface EventAlert {
  id: string;
  eventName: string;
  sender: string;
  message: string;
  timestamp: number;
}

export type EventPostType = "meetup" | "setlist";

export interface EventPost {
  id: string;
  eventName: string;
  type: EventPostType;
  content: string;
  timestamp: number;
}

export interface PendingImage {
  id: string;
  recipient: string;
  isGroup: boolean;
  filePath: string;
  status: "sending" | "failed";
}

interface MeshContextValue {
  started: boolean;
  peers: string[];
  rssiByPeer: Record<string, number>;
  messages: MessageReceivedEvent[];
  sendMessage: (recipient: string, content: string) => Promise<string | null>;
  myName: string;
  myUserId: string | null;
  isEventAdmin: boolean;
  tickets: Ticket[];
  activeTicket: Ticket | null;
  buyTicket: (eventName: string) => void;
  setActiveEvent: (eventName: string) => void;
  checkOut: () => void;
  removeTicket: (eventName: string) => void;
  discoveredTicketHolders: DiscoveredTicketHolder[];
  sharedLocations: Record<string, SharedLocation>;
  crew: CrewMember[];
  addToCrew: (peerId: string, name: string) => void;
  removeFromCrew: (peerId: string) => void;
  nameForPeer: (peerId: string) => string;
  groups: MeshGroup[];
  groupMessages: GroupMessageReceivedEvent[];
  createGroup: (name: string) => Promise<string | null>;
  inviteToGroup: (groupId: string, peerId: string) => Promise<void>;
  sendGroupMessage: (groupId: string, content: string) => Promise<void>;
  sendGroupSos: (groupId: string, locationSuffix: string) => Promise<void>;
  sendEventSos: (eventName: string, message: string) => Promise<string[]>;
  eventAlerts: EventAlert[];
  eventPosts: EventPost[];
  sendEventPost: (eventName: string, type: EventPostType, content: string) => Promise<string[]>;
  latestIncomingAlert: IncomingAlert | null;
  dismissIncomingAlert: () => void;
  sendSos: () => Promise<string[]>;
  presenceByPeer: Record<string, string>;
  typingByPeer: Record<string, boolean>;
  sendTypingStatus: (peerId: string, isTyping: boolean) => void;
  markMessagesRead: (peerId: string) => void;
  isMessageRead: (messageId: string) => boolean;
  sendImageMessage: (recipient: string, base64Data: string, fileName: string) => Promise<string | null>;
  typingByGroup: Record<string, string[]>;
  sendGroupTypingStatus: (groupId: string, isTyping: boolean) => void;
  sendGroupImage: (groupId: string, base64Data: string) => Promise<void>;
  pendingImages: PendingImage[];
  retryPendingImage: (pendingId: string) => Promise<void>;
  markConversationOpened: (conversationId: string) => void;
  getUnreadCount: (conversationId: string, isGroup: boolean) => number;
}

const MeshContext = createContext<MeshContextValue | null>(null);

function generateTicketNumber() {
  return "TCK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ticketsKey(userId: string) {
  return `concert-crew:tickets:${userId}`;
}
function activeEventKey(userId: string) {
  return `concert-crew:activeEvent:${userId}`;
}
function crewKey(userId: string) {
  return `concert-crew:crew:${userId}`;
}
function messagesKey(userId: string) {
  return `concert-crew:messages:${userId}`;
}
function groupsKey(userId: string) {
  return `concert-crew:groups:${userId}`;
}
function groupMessagesKey(userId: string) {
  return `concert-crew:groupMessages:${userId}`;
}
function eventAlertsKey(userId: string) {
  return `concert-crew:eventAlerts:${userId}`;
}
function eventPostsKey(userId: string) {
  return `concert-crew:eventPosts:${userId}`;
}
function pendingImagesKey(userId: string) {
  return `concert-crew:pendingImages:${userId}`;
}
function lastReadKey(userId: string) {
  return `concert-crew:lastRead:${userId}`;
}

export function MeshProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { connections } = useConnections();
  const userId = user?.id?.toString() ?? null;
  const myName = user?.email ?? "Guest";
  const myUsername = (user as any)?.username ?? "";
  const friendUsernames = connections.map((c) => c.peer);
  const isEventAdmin = myName === ADMIN_EMAIL;

  const protocolRef = useRef<OfflineProtocol | null>(null);
  const servicesRef = useRef<MeshServices | null>(null);

  const [started, setStarted] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const [rssiByPeer, setRssiByPeer] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<MessageReceivedEvent[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeEventName, setActiveEventName] = useState<string | null>(null);
  const [discoveredTicketHolders, setDiscoveredTicketHolders] = useState<DiscoveredTicketHolder[]>([]);
  const [sharedLocations, setSharedLocations] = useState<Record<string, SharedLocation>>({});
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [groups, setGroups] = useState<MeshGroup[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessageReceivedEvent[]>([]);
  const [eventAlerts, setEventAlerts] = useState<EventAlert[]>([]);
  const [eventPosts, setEventPosts] = useState<EventPost[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, number>>({});
  const [latestIncomingAlert, setLatestIncomingAlert] = useState<IncomingAlert | null>(null);
  const [presenceByPeer, setPresenceByPeer] = useState<Record<string, string>>({});
  const [typingByPeer, setTypingByPeer] = useState<Record<string, boolean>>({});
  const [typingByGroup, setTypingByGroup] = useState<Record<string, string[]>>({});
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());

  const groupsRef = useRef<MeshGroup[]>([]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const activeTicket = tickets.find((t) => t.eventName === activeEventName) ?? null;

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(ticketsKey(userId)).then((raw) => {
      if (raw) {
        try {
          setTickets(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(activeEventKey(userId)).then((raw) => {
      if (raw) setActiveEventName(raw);
    });
    AsyncStorage.getItem(crewKey(userId)).then((raw) => {
      if (raw) {
        try {
          setCrew(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(messagesKey(userId)).then((raw) => {
      if (raw) {
        try {
          setMessages(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(groupsKey(userId)).then((raw) => {
      if (raw) {
        try {
          setGroups(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(groupMessagesKey(userId)).then((raw) => {
      if (raw) {
        try {
          setGroupMessages(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(eventAlertsKey(userId)).then((raw) => {
      if (raw) {
        try {
          setEventAlerts(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(eventPostsKey(userId)).then((raw) => {
      if (raw) {
        try {
          setEventPosts(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(pendingImagesKey(userId)).then((raw) => {
      if (raw) {
        try {
          setPendingImages(JSON.parse(raw));
        } catch {}
      }
    });
    AsyncStorage.getItem(lastReadKey(userId)).then((raw) => {
      if (raw) {
        try {
          setLastReadTimestamps(JSON.parse(raw));
        } catch {}
      }
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(messagesKey(userId), JSON.stringify(messages));
  }, [userId, messages]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(groupsKey(userId), JSON.stringify(groups));
  }, [userId, groups]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(groupMessagesKey(userId), JSON.stringify(groupMessages));
  }, [userId, groupMessages]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(eventAlertsKey(userId), JSON.stringify(eventAlerts));
  }, [userId, eventAlerts]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(eventPostsKey(userId), JSON.stringify(eventPosts));
  }, [userId, eventPosts]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(pendingImagesKey(userId), JSON.stringify(pendingImages));
  }, [userId, pendingImages]);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.setItem(lastReadKey(userId), JSON.stringify(lastReadTimestamps));
  }, [userId, lastReadTimestamps]);

  useEffect(() => {
    if (!started || !activeTicket || !servicesRef.current) return;
    withRetry(() =>
      servicesRef.current!.registerService(TICKET_SERVICE_ID, "1.0", {
        ticketNumber: activeTicket.ticketNumber,
        name: myName,
        username: myUsername,
        eventName: activeTicket.eventName,
      })
    );
  }, [started, activeTicket, myName, myUsername]);

  const addToCrewRef = useRef<(peerId: string, name: string) => void>(() => {});

  useEffect(() => {
    if (!userId) return;

    const protocol = new OfflineProtocol({ appId: "concert-crew", userId });
    protocolRef.current = protocol;

    protocol.on("neighbor_discovered", (event: NeighborDiscoveredEvent) => {
      setPeers((prev) => (prev.includes(event.peer_id) ? prev : [...prev, event.peer_id]));
      if (typeof event.rssi === "number") {
        setRssiByPeer((prev) => ({
          ...prev,
          [event.peer_id]: smoothRssi(prev[event.peer_id], event.rssi as number),
        }));
      }
    });

    protocol.on("neighbor_lost", (event: any) => {
      setPeers((prev) => prev.filter((id) => id !== event.peer_id));
      setRssiByPeer((prev) => {
        const next = { ...prev };
        delete next[event.peer_id];
        return next;
      });
    });

    protocol.on("message_received", (event: MessageReceivedEvent) => {
      const autoLocMatch = event.content.match(/^AUTOLOC:(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
      if (autoLocMatch) {
        setSharedLocations((prev) => ({
          ...prev,
          [event.sender]: {
            peerId: event.sender,
            lat: Number(autoLocMatch[1]),
            lon: Number(autoLocMatch[2]),
            timestamp: event.timestamp,
          },
        }));
        return;
      }

      if (event.content.startsWith(EVENTPOST_PREFIX)) {
        try {
          const parsed = JSON.parse(event.content.slice(EVENTPOST_PREFIX.length));
          setEventPosts((prev) => [
            ...prev,
            {
              id: event.message_id,
              eventName: parsed.eventName,
              type: parsed.type,
              content: parsed.content,
              timestamp: event.timestamp,
            },
          ]);
        } catch (err) {
          console.warn("[MeshProvider] failed to parse event post:", err);
        }
        return;
      }

      setMessages((prev) => [...prev, event]);
      const locMatch = event.content.match(/LOC:(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (locMatch) {
        setSharedLocations((prev) => ({
          ...prev,
          [event.sender]: {
            peerId: event.sender,
            lat: Number(locMatch[1]),
            lon: Number(locMatch[2]),
            timestamp: event.timestamp,
          },
        }));
      }
      const isSos = event.content.startsWith(SOS_PREFIX);
      const eventTagMatch = event.content.match(/^SOS:\s*\[([^\]]+)\]\s*(.*)$/);
      if (eventTagMatch) {
        setEventAlerts((prev) => [
          ...prev,
          {
            id: event.message_id,
            eventName: eventTagMatch[1],
            sender: event.sender,
            message: eventTagMatch[2],
            timestamp: event.timestamp,
          },
        ]);
      }
      setLatestIncomingAlert({
        id: event.message_id,
        peerId: event.sender,
        content: event.content,
        isSos,
        timestamp: event.timestamp,
      });
    });

    protocol.on("group_message_received", (event: GroupMessageReceivedEvent) => {
      setGroupMessages((prev) => [...prev, event]);
      const locMatch = event.content.match(/LOC:(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (locMatch) {
        setSharedLocations((prev) => ({
          ...prev,
          [event.sender]: {
            peerId: event.sender,
            lat: Number(locMatch[1]),
            lon: Number(locMatch[2]),
            timestamp: Date.now(),
          },
        }));
      }
      const isSos = event.content.startsWith(SOS_PREFIX);
      if (isSos) {
        setLatestIncomingAlert({
          id: event.message_id,
          peerId: event.sender,
          content: event.content,
          isSos: true,
          timestamp: Date.now(),
        });
      }
    });

    protocol.on("group_member_added", (event: any) => {
      setGroups((prev) => {
        const exists = prev.find((g) => g.groupId === event.group_id);
        if (exists) {
          if (exists.memberIds.includes(event.user_id)) return prev;
          return prev.map((g) =>
            g.groupId === event.group_id
              ? { ...g, memberIds: [...g.memberIds, event.user_id] }
              : g
          );
        }
        return [
          ...prev,
          {
            groupId: event.group_id,
            name: event.group_name || "Group",
            memberIds: [event.user_id],
          },
        ];
      });
    });

    protocol.on("service_discovered", (event: ServiceDiscoveredEvent) => {
      if (event.service_id !== TICKET_SERVICE_ID) return;
      setDiscoveredTicketHolders((prev) => {
        const entry: DiscoveredTicketHolder = {
          peerId: event.provider_peer_id,
          ticketNumber: event.capabilities.ticketNumber ?? "unknown",
          name: event.capabilities.name ?? event.provider_peer_id,
          username: event.capabilities.username ?? "",
          eventName: event.capabilities.eventName ?? "Unknown event",
          hopCount: event.hop_count,
        };
        const exists = prev.some((p) => p.peerId === event.provider_peer_id);
        return exists
          ? prev.map((p) => (p.peerId === event.provider_peer_id ? entry : p))
          : [...prev, entry];
      });
    });

    protocol.on("presence_updated", (event: any) => {
      setPresenceByPeer((prev) => ({ ...prev, [event.peer_id]: event.status }));
    });

    protocol.on("typing_indicator_received", (event: any) => {
      const isGroupConversation = groupsRef.current.some(
        (g) => g.groupId === event.conversation_id
      );
      if (isGroupConversation) {
        setTypingByGroup((prev) => {
          const current = prev[event.conversation_id] || [];
          const next = event.is_typing
            ? current.includes(event.sender)
              ? current
              : [...current, event.sender]
            : current.filter((id) => id !== event.sender);
          return { ...prev, [event.conversation_id]: next };
        });
        if (event.is_typing) {
          setTimeout(() => {
            setTypingByGroup((prev) => ({
              ...prev,
              [event.conversation_id]: (prev[event.conversation_id] || []).filter(
                (id) => id !== event.sender
              ),
            }));
          }, 5000);
        }
        return;
      }
      setTypingByPeer((prev) => ({ ...prev, [event.sender]: event.is_typing }));
      if (event.is_typing) {
        setTimeout(() => {
          setTypingByPeer((prev) => ({ ...prev, [event.sender]: false }));
        }, 5000);
      }
    });

    protocol.on("read_receipt_received", (event: any) => {
      setReadMessageIds((prev) => {
        const next = new Set(prev);
        (event.message_ids || []).forEach((id: string) => next.add(id));
        return next;
      });
    });

    protocol.on("file_progress", (event: any) => {
      console.log(
        "[Mesh debug] file_progress:",
        event.file_id,
        event.chunks_sent,
        "/",
        event.total_chunks
      );
    });

    protocol.on("file_received", (event: any) => {
      const mime = event.media_metadata?.mime_type || "image/jpeg";
      const dataUri = `data:${mime};base64,${event.file_data}`;
      const fileName = event.file_name || event.media_metadata?.file_name || "";
      const groupMatch = fileName.match(/^group:([^:]+):/);

      if (groupMatch) {
        const groupId = groupMatch[1];
        setGroupMessages((prev) => [
          ...prev,
          {
            type: "group_message_received",
            group_id: groupId,
            sender: event.sender,
            content: `IMG:${dataUri}`,
            timestamp: String(Date.now()),
            message_id: event.file_id,
          } as GroupMessageReceivedEvent,
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          type: "message_received",
          message_id: event.file_id,
          sender: event.sender,
          recipient: userId,
          content: `IMG:${dataUri}`,
          hop_count: 0,
          transport: "file",
          timestamp: Date.now(),
          lamport_clock: 0,
        } as MessageReceivedEvent,
      ]);
    });

    protocol.start().then(() => {
      const services = new MeshServices();
      servicesRef.current = services;
      setStarted(true);
    });

    return () => {
      protocol.stop().then(() => protocol.destroy());
    };
  }, [userId]);

  useEffect(() => {
    if (!started || crew.length === 0) return;
    let subscription: any = null;
    let cancelled = false;

    (async () => {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 10 },
        (loc) => {
          if (!protocolRef.current) return;
          const payload = `AUTOLOC:${loc.coords.latitude},${loc.coords.longitude}`;
          crew.forEach((member) => {
            protocolRef.current!.sendMessage({
              recipient: member.peerId,
              content: payload,
              priority: MessagePriority.Low,
            }).catch(() => {});
          });
        }
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [started, crew]);

  const sendPresence = useCallback(
    (status: "online" | "away" | "offline") => {
      crew.forEach((member) => {
        protocolRef.current?.sendPresenceUpdate(member.peerId, status).catch(() => {});
      });
    },
    [crew]
  );

  useEffect(() => {
    if (!started || crew.length === 0) return;
    sendPresence("online");
    const interval = setInterval(() => sendPresence("online"), 30000);
    return () => clearInterval(interval);
  }, [started, crew, sendPresence]);

  const addToCrew = useCallback(
    (peerId: string, name: string) => {
      if (!userId) return;
      setCrew((prev) => {
        if (prev.some((m) => m.peerId === peerId)) return prev;
        const next = [...prev, { peerId, name }];
        AsyncStorage.setItem(crewKey(userId), JSON.stringify(next));
        return next;
      });
    },
    [userId]
  );

  useEffect(() => {
    addToCrewRef.current = addToCrew;
  }, [addToCrew]);

  useEffect(() => {
    discoveredTicketHolders.forEach((holder) => {
      if (holder.username && friendUsernames.includes(holder.username)) {
        addToCrewRef.current(holder.peerId, holder.name);
      }
    });
  }, [discoveredTicketHolders, friendUsernames]);

  const sendMessage = useCallback(
    async (recipient: string, content: string) => {
      if (!protocolRef.current || !userId) return null;
      let messageId: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          messageId = await protocolRef.current.sendMessage({
            recipient,
            content,
            priority: MessagePriority.High,
          });
          break;
        } catch (err) {
          console.warn(`[MeshProvider] sendMessage attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (messageId) {
        setMessages((prev) => [
          ...prev,
          {
            type: "message_received",
            message_id: messageId,
            sender: userId,
            recipient,
            content,
            hop_count: 0,
            transport: "local",
            timestamp: Date.now(),
            lamport_clock: 0,
          } as MessageReceivedEvent,
        ]);
      }
      return messageId;
    },
    [userId]
  );

  const sendSos = useCallback(async () => {
    const results = await Promise.all(
      peers.map((peerId) => sendMessage(peerId, `${SOS_PREFIX} ${myName} needs help.`))
    );
    return peers.filter((_, i) => results[i]);
  }, [peers, sendMessage, myName]);

  const sendEventSos = useCallback(
    async (eventName: string, message: string) => {
      if (servicesRef.current) {
        await withRetry(() => servicesRef.current!.discoverServices(TICKET_SERVICE_ID));
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const recipients = discoveredTicketHolders.filter((h) => h.eventName === eventName);
      const results = await Promise.all(
        recipients.map((holder) =>
          sendMessage(holder.peerId, `${SOS_PREFIX} [${eventName}] ${myName}: ${message}`)
        )
      );
      const delivered = recipients.filter((_, i) => results[i]).map((h) => h.peerId);

      if (userId) {
        setEventAlerts((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            eventName,
            sender: userId,
            message: `${myName}: ${message}`,
            timestamp: Date.now(),
          },
        ]);
      }

      return delivered;
    },
    [discoveredTicketHolders, sendMessage, myName, userId]
  );

  const sendEventPost = useCallback(
    async (eventName: string, type: EventPostType, content: string) => {
      if (!isEventAdmin) return [];

      if (servicesRef.current) {
        await withRetry(() => servicesRef.current!.discoverServices(TICKET_SERVICE_ID));
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const recipients = discoveredTicketHolders.filter((h) => h.eventName === eventName);
      const payload = `${EVENTPOST_PREFIX}${JSON.stringify({ type, eventName, content })}`;
      const results = await Promise.all(
        recipients.map((holder) => sendMessage(holder.peerId, payload))
      );
      const delivered = recipients.filter((_, i) => results[i]).map((h) => h.peerId);

      setEventPosts((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, eventName, type, content, timestamp: Date.now() },
      ]);

      return delivered;
    },
    [isEventAdmin, discoveredTicketHolders, sendMessage]
  );

  const buyTicket = useCallback(
    (eventName: string) => {
      if (!userId) return;
      const trimmedEvent = eventName.trim();
      if (!trimmedEvent) return;

      setTickets((prev) => {
        if (prev.some((t) => t.eventName === trimmedEvent)) return prev;
        const next = [
          ...prev,
          { eventName: trimmedEvent, ticketNumber: generateTicketNumber() },
        ];
        AsyncStorage.setItem(ticketsKey(userId), JSON.stringify(next));
        return next;
      });

      setActiveEventName(trimmedEvent);
      AsyncStorage.setItem(activeEventKey(userId), trimmedEvent);
    },
    [userId]
  );

  const setActiveEvent = useCallback(
    (eventName: string) => {
      if (!userId) return;
      setActiveEventName(eventName);
      AsyncStorage.setItem(activeEventKey(userId), eventName);
      setDiscoveredTicketHolders([]);
    },
    [userId]
  );

  const checkOut = useCallback(() => {
    if (!userId) return;
    setActiveEventName(null);
    AsyncStorage.removeItem(activeEventKey(userId));
    setDiscoveredTicketHolders([]);
  }, [userId]);

  const removeTicket = useCallback(
    (eventName: string) => {
      if (!userId) return;
      setTickets((prev) => {
        const next = prev.filter((t) => t.eventName !== eventName);
        AsyncStorage.setItem(ticketsKey(userId), JSON.stringify(next));
        return next;
      });
      setActiveEventName((current) => {
        if (current !== eventName) return current;
        AsyncStorage.removeItem(activeEventKey(userId));
        setDiscoveredTicketHolders([]);
        return null;
      });
    },
    [userId]
  );

  useEffect(() => {
    if (!started || !activeTicket || !servicesRef.current) return;
    withRetry(() => servicesRef.current!.discoverServices(TICKET_SERVICE_ID));
    const interval = setInterval(() => {
      if (servicesRef.current) {
        withRetry(() => servicesRef.current!.discoverServices(TICKET_SERVICE_ID));
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [started, activeTicket]);

  const removeFromCrew = useCallback(
    (peerId: string) => {
      if (!userId) return;
      setCrew((prev) => {
        const next = prev.filter((m) => m.peerId !== peerId);
        AsyncStorage.setItem(crewKey(userId), JSON.stringify(next));
        return next;
      });
    },
    [userId]
  );

  const nameForPeer = useCallback(
    (peerId: string) => {
      if (peerId === userId) return "You";
      const crewMatch = crew.find((m) => m.peerId === peerId);
      if (crewMatch) return crewMatch.name;
      const discoveredMatch = discoveredTicketHolders.find((h) => h.peerId === peerId);
      if (discoveredMatch) return discoveredMatch.name;
      return peerId;
    },
    [crew, discoveredTicketHolders, userId]
  );

  const createGroup = useCallback(async (name: string) => {
    if (!protocolRef.current) return null;
    const info = await protocolRef.current.meshCreateGroup(name);
    setGroups((prev) =>
      prev.some((g) => g.groupId === info.groupId)
        ? prev
        : [...prev, { groupId: info.groupId, name, memberIds: [] }]
    );
    return info.groupId;
  }, []);

  const inviteToGroup = useCallback(async (groupId: string, peerId: string) => {
    if (!protocolRef.current) return;
    await protocolRef.current.meshInviteToGroup(groupId, peerId);
    setGroups((prev) =>
      prev.map((g) =>
        g.groupId === groupId && !g.memberIds.includes(peerId)
          ? { ...g, memberIds: [...g.memberIds, peerId] }
          : g
      )
    );
  }, []);

  const sendGroupMessage = useCallback(
    async (groupId: string, content: string) => {
      if (!protocolRef.current || !userId) return;
      const ids = await protocolRef.current.meshSendGroupMessage(groupId, content);
      setGroupMessages((prev) => [
        ...prev,
        {
          type: "group_message_received",
          group_id: groupId,
          sender: userId,
          content,
          timestamp: String(Date.now()),
          message_id: ids[0] ?? `local-${Date.now()}`,
        } as GroupMessageReceivedEvent,
      ]);
    },
    [userId]
  );

  const sendGroupSos = useCallback(
    async (groupId: string, locationSuffix: string) => {
      await sendGroupMessage(groupId, `${SOS_PREFIX} ${myName} needs help.${locationSuffix}`);
    },
    [sendGroupMessage, myName]
  );

  const dismissIncomingAlert = useCallback(() => {
    setLatestIncomingAlert(null);
  }, []);

  const sendTypingStatus = useCallback((peerId: string, isTyping: boolean) => {
    protocolRef.current?.sendTypingIndicator(peerId, peerId, isTyping).catch(() => {});
  }, []);

  const sendGroupTypingStatus = useCallback(
    (groupId: string, isTyping: boolean) => {
      const group = groups.find((g) => g.groupId === groupId);
      if (!group) return;
      group.memberIds.forEach((peerId) => {
        protocolRef.current?.sendTypingIndicator(peerId, groupId, isTyping).catch(() => {});
      });
    },
    [groups]
  );

  const markMessagesRead = useCallback(
    (peerId: string) => {
      if (!protocolRef.current) return;
      const unreadIds = messages
        .filter((m) => m.sender === peerId)
        .map((m) => m.message_id);
      if (unreadIds.length === 0) return;
      protocolRef.current.sendReadReceipt(peerId, unreadIds).catch(() => {});
    },
    [messages]
  );

  const isMessageRead = useCallback(
    (messageId: string) => readMessageIds.has(messageId),
    [readMessageIds]
  );

  const markConversationOpened = useCallback((conversationId: string) => {
    setLastReadTimestamps((prev) => ({ ...prev, [conversationId]: Date.now() }));
  }, []);

 const parseGroupTimestamp = (raw: string) => {
    const asNumber = Number(raw);
    if (!Number.isNaN(asNumber)) return asNumber;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const getUnreadCount = useCallback(
    (conversationId: string, isGroup: boolean) => {
      const lastRead = lastReadTimestamps[conversationId] ?? 0;
      if (isGroup) {
        return groupMessages.filter(
          (m) =>
            m.group_id === conversationId &&
            m.sender !== userId &&
            parseGroupTimestamp(m.timestamp) > lastRead
        ).length;
      }
      return messages.filter(
        (m) =>
          (m.sender === conversationId || m.recipient === conversationId) &&
          m.sender !== userId &&
          m.timestamp > lastRead
      ).length;
    },
    [lastReadTimestamps, messages, groupMessages, userId]
  );

  const sendImageMessage = useCallback(
    async (recipient: string, base64Data: string, fileName: string) => {
      if (!protocolRef.current || !userId) return null;

      const FileSystem = await import("expo-file-system/legacy");
      const pendingId = `pending-${Date.now()}`;
      const filePath = `${FileSystem.cacheDirectory}${pendingId}.b64`;
      await FileSystem.writeAsStringAsync(filePath, base64Data);
      setPendingImages((prev) => [
        ...prev,
        { id: pendingId, recipient, isGroup: false, filePath, status: "sending" },
      ]);

      let fileId: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fileId = await protocolRef.current.sendImage(recipient, base64Data, fileName);
          if (fileId) break;
        } catch (err) {
          console.warn(`[MeshProvider] sendImage attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        }
      }

      if (fileId) {
        setPendingImages((prev) => prev.filter((p) => p.id !== pendingId));
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        setMessages((prev) => [
          ...prev,
          {
            type: "message_received",
            message_id: fileId!,
            sender: userId,
            recipient,
            content: `IMG:data:image/jpeg;base64,${base64Data}`,
            hop_count: 0,
            transport: "local",
            timestamp: Date.now(),
            lamport_clock: 0,
          } as MessageReceivedEvent,
        ]);
      } else {
        setPendingImages((prev) =>
          prev.map((p) => (p.id === pendingId ? { ...p, status: "failed" } : p))
        );
      }

      return fileId;
    },
    [userId]
  );

  const retryPendingImage = useCallback(
    async (pendingId: string) => {
      const pending = pendingImages.find((p) => p.id === pendingId);
      if (!pending || !protocolRef.current) return;

      const FileSystem = await import("expo-file-system/legacy");
      const base64Data = await FileSystem.readAsStringAsync(pending.filePath);

      setPendingImages((prev) =>
        prev.map((p) => (p.id === pendingId ? { ...p, status: "sending" } : p))
      );

      try {
        let success = false;
        if (pending.isGroup) {
          const group = groups.find((g) => g.groupId === pending.recipient);
          if (group) {
            await Promise.all(
              group.memberIds.map((peerId) =>
                protocolRef.current!.sendImage(
                  peerId,
                  base64Data,
                  `group:${pending.recipient}:photo.jpg`
                )
              )
            );
            success = true;
          }
        } else {
          const fileId = await protocolRef.current.sendImage(
            pending.recipient,
            base64Data,
            "photo.jpg"
          );
          success = Boolean(fileId);
        }

        if (success) {
          setPendingImages((prev) => prev.filter((p) => p.id !== pendingId));
          await FileSystem.deleteAsync(pending.filePath, { idempotent: true });
        } else {
          setPendingImages((prev) =>
            prev.map((p) => (p.id === pendingId ? { ...p, status: "failed" } : p))
          );
        }
      } catch {
        setPendingImages((prev) =>
          prev.map((p) => (p.id === pendingId ? { ...p, status: "failed" } : p))
        );
      }
    },
    [pendingImages, groups]
  );

  const sendGroupImage = useCallback(
    async (groupId: string, base64Data: string) => {
      const group = groups.find((g) => g.groupId === groupId);
      if (!group || !userId) return;
      const taggedFileName = `group:${groupId}:photo.jpg`;
      await Promise.all(
        group.memberIds.map((peerId) =>
          protocolRef.current?.sendImage(peerId, base64Data, taggedFileName).catch(() => {})
        )
      );
      setGroupMessages((prev) => [
        ...prev,
        {
          type: "group_message_received",
          group_id: groupId,
          sender: userId,
          content: `IMG:data:image/jpeg;base64,${base64Data}`,
          timestamp: String(Date.now()),
          message_id: `local-img-${Date.now()}`,
        } as GroupMessageReceivedEvent,
      ]);
    },
    [groups, userId]
  );

  return (
    <MeshContext.Provider
      value={{
        started,
        peers,
        rssiByPeer,
        messages,
        sendMessage,
        myName,
        myUserId: userId,
        isEventAdmin,
        tickets,
        activeTicket,
        buyTicket,
        setActiveEvent,
        checkOut,
        removeTicket,
        discoveredTicketHolders,
        sharedLocations,
        crew,
        addToCrew,
        removeFromCrew,
        nameForPeer,
        groups,
        groupMessages,
        createGroup,
        inviteToGroup,
        sendGroupMessage,
        sendGroupSos,
        sendEventSos,
        eventAlerts,
        eventPosts,
        sendEventPost,
        latestIncomingAlert,
        dismissIncomingAlert,
        sendSos,
        presenceByPeer,
        typingByPeer,
        sendTypingStatus,
        markMessagesRead,
        isMessageRead,
        sendImageMessage,
        typingByGroup,
        sendGroupTypingStatus,
        sendGroupImage,
        pendingImages,
        retryPendingImage,
        markConversationOpened,
        getUnreadCount,
      }}>
      {children}
    </MeshContext.Provider>
  );
}

export function useMesh() {
  const ctx = useContext(MeshContext);
  if (!ctx) {
    throw new Error("useMesh must be used within a MeshProvider");
  }
  return ctx;
}