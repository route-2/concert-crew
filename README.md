# Concert Crew 🎤

An offline-first mobile app for finding your friends and staying safe at concerts — no wifi, no cell service required. Built on Bluetooth mesh networking, so everything works phone-to-phone even when the venue's internet is jammed or unavailable.

## What it does

- **Offline identity & tickets** — log in via a decentralized identity SDK, check into an event (from a preset list or create your own), and broadcast a verified ticket over Bluetooth.
- **Peer discovery** — automatically discover other verified attendees nearby via Bluetooth Low Energy mesh, no server involved.
- **Crew & groups** — add discovered attendees to your crew, message them directly, or create end-to-end encrypted group chats.
- **Photo sharing** — send images over the mesh with automatic chunking, retry, and local persistence if a transfer fails.
- **Presence, typing indicators & read receipts** — real-time chat status, all offline.
- **Emergency SOS** — broadcast your location and an emergency alert to everyone in Bluetooth range, or target an alert to everyone checked into a specific event (lost & found style).
- **Event Board** — event admins can post meetup pins and live setlist updates to everyone checked in.
- **Offline venue map** — when there's no internet, falls back to a hardcoded venue map with crew positioned by real-time Bluetooth signal strength, plus a live "Finding" view with distance estimates.
- **Unread badges, friend system, and more** — a full crew messaging experience, built entirely on top of a Bluetooth mesh protocol.

## Tech stack

- [Expo](https://expo.dev) / React Native (file-based routing via `expo-router`)
- [Offline Protocol](https://docs.offlineprotocol.com) — ID SDK (identity, connections) and Mesh SDK (BLE mesh networking, MLS end-to-end encryption, file transfer, service discovery)
- `expo-location`, `expo-image-picker`, `expo-image`, `expo-file-system`, `expo-network`, `react-native-maps`
- `@react-native-async-storage/async-storage` for local persistence

## Get started

1. Install dependencies

```bash
   npm install
```

2. iOS native setup (required — this app uses native Bluetooth/mesh modules, so it will **not** run in Expo Go)

```bash
   cd ios && pod install && cd ..
```

3. Run on a physical device

```bash
   npx expo run:ios --device
```

   > ⚠️ The mesh networking features require real Bluetooth hardware and **will not work in the iOS Simulator** or Expo Go. You need at least one physical iPhone to test discovery, messaging, and SOS — and two phones to test peer-to-peer functionality.

4. Start Metro (if not already running)

```bash
   npx expo start --dev-client
```

## Testing peer-to-peer features

To test discovery, messaging, groups, or SOS, you'll need **two physical iOS devices**:

1. Build and install the app on both devices (`npx expo run:ios --device`, selecting a different device each time).
2. Log in with different accounts on each device.
3. Both devices check into the **same event name** from the Explore tab.
4. Keep Bluetooth on and the app open/foregrounded on both — discovery re-broadcasts roughly every 10 seconds.
5. Once discovered, add each other to your crew from the Explore tab.

## Project structure

- `src/app/` — screens (file-based routing): Home, Crew, Map, SOS, Explore
- `src/providers/MeshProvider.tsx` — core mesh networking logic, wraps the Offline Protocol SDK and exposes app-level state (crew, messages, groups, tickets, presence, etc.)
- `src/components/` — shared UI (buttons, banners, themed components)
- `src/constants/` — app config, event list, theme

## Known limitations

- BLE signal strength (RSSI) gives *rough* proximity estimates, not precise distance or true compass direction — treat "Finding" and venue map positions as approximate, not GPS-accurate.
- Local images loaded via `require()` are served over the Metro dev server during development, which means they need network access to load the *first* time in a dev build — production/release builds bundle assets natively and don't have this limitation.
- Group messaging, image sharing, typing indicators, and read receipts are built on top of primitives the underlying SDK exposes per-recipient, not natively for groups — the app fans these out to each group member individually.

## Learn more

- [Expo documentation](https://docs.expo.dev)