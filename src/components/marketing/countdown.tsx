"use client";

import { useEffect, useState } from "react";
import { DPDP_DEADLINE } from "@/lib/constants";

/** Days until the DPDP deadline, computed in the browser so it's never stale. */
export function DeadlineSentence({ className }: { className?: string }) {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setDays(Math.max(0, Math.ceil((DPDP_DEADLINE.getTime() - Date.now()) / 86_400_000)));
    update();
    const id = setInterval(update, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className={className}>
      Full obligations apply from 13 May 2027
      {days !== null && days > 0 && (
        <>
          {" "}— <span className="tabular-nums text-paper">{days}</span> days from today.
        </>
      )}
      {days === 0 && <>. They are in force now.</>}
    </p>
  );
}
