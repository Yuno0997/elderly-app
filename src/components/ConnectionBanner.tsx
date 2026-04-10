import { WifiOff } from 'lucide-react';

export function ConnectionBanner() {
  return (
    <div className="bg-yellow-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
      <WifiOff className="w-4 h-4" />
      <span>Realtime connection lost—reconnecting…</span>
    </div>
  );
}
