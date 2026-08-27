import { AccountingShell } from './accounting-shell';

export default function Home() {
  return <AccountingShell runtimeApiConfigured={Boolean(process.env.LEDGERLY_API_BASE_URL)} />;
}
