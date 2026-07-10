import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { OfflineAppProvider } from '@offline-protocol/id-react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { IncomingAlertBanner } from '@/components/incoming-alert-banner';
import { OFFLINE_PROTOCOL_PROJECT_ID } from '@/constants/offline-protocol';
import { MeshProvider } from '@/providers/MeshProvider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <OfflineAppProvider projectId={OFFLINE_PROTOCOL_PROJECT_ID}>
      <MeshProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <AppTabs />
          <IncomingAlertBanner />
        </ThemeProvider>
      </MeshProvider>
    </OfflineAppProvider>
  );
}