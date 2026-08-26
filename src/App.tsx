import { DataProvider } from '@/store/DataProvider';
import { AppShell } from '@/AppShell';

export default function App() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  );
}
