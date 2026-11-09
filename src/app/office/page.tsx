import { Suspense } from "react";
import Link from "next/link";
import { RunningAvatarLoader } from "@/features/agents/components/RunningAvatarLoader";
import { AgentStoreProvider } from "@/features/agents/state/store";
import { OfficeScreen } from "@/features/office/screens/OfficeScreen";

const ENABLED_RE = /^(1|true|yes|on)$/i;

const readDebugFlag = (value: string | undefined): boolean => {
  const normalized = (value ?? "").trim();
  if (!normalized) return true;
  return ENABLED_RE.test(normalized);
};

function OfficeLoadingFallback() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-background"
      aria-label="Loading office"
      role="status"
    >
      <div className="flex flex-col items-center gap-3">
        <RunningAvatarLoader
          size={28}
          trackWidth={76}
          label="Loading..."
          labelClassName="text-muted-foreground"
        />
      </div>
    </div>
  );
}

export default function OfficePage() {
  const showHermesConsole = readDebugFlag(process.env.DEBUG);

  return (
    <AgentStoreProvider>
      <Link href="/observe" className="fixed bottom-3 right-3 z-[100] rounded border border-white/20 bg-black/80 px-3 py-2 text-xs text-white">终端观察室 ↗</Link>
      <Suspense fallback={<OfficeLoadingFallback />}>
        <OfficeScreen showHermesConsole={showHermesConsole} />
      </Suspense>
    </AgentStoreProvider>
  );
}
