import { isSupabaseConfigured } from '@/lib/supabase';
import { DataProvider } from '@/store/DataProvider';
import { AppShell } from '@/AppShell';
import { AuthGate } from '@/auth/AuthGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function App() {
  // Com Supabase configurado → nuvem + login. Sem chaves → modo local.
  return (
    <ErrorBoundary>
      {isSupabaseConfigured ? (
        <AuthGate />
      ) : (
        <DataProvider>
          <AppShell />
        </DataProvider>
      )}
    </ErrorBoundary>
  );
}
