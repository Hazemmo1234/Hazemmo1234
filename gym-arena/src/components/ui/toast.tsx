"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon } from "./icons";

/** Success confirmation that announces itself to screen readers and hides after 4 s. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  const show = useCallback((text: string) => setMessage(text), []);
  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
      {message && (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-up/30 bg-surface px-4 py-3 text-sm font-semibold shadow-2xl">
          <CheckIcon size={18} className="text-up" />
          {message}
        </div>
      )}
    </div>
  );
}
