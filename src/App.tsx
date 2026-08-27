import { isSupabaseConfigured } from '@/lib/supabase';
import { DataProvider } from '@/store/DataProvider';
import { AppShell } from '@/AppShell';
import { AuthGate } from '@/auth/AuthGate';

export default function App() {
  // Com Supabase configurado → nuvem + login. Sem chaves → modo local.
  if (isSupabaseConfigured) return <AuthGate />;
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  );
}
