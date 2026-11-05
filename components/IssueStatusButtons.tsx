"use client";

import { safe } from "@/lib/safe";
import { useTransition } from "react";
import { setIssueStatus } from "@/app/(ops)/actions";
import type { IssueStatus } from "@/lib/types";

export default function IssueStatusButtons({ id, status }: { id: string; status: IssueStatus }) {
  const [pending, start] = useTransition();
  const go = (s: IssueStatus) => start(async () => void (await safe(() => setIssueStatus(id, s))));
  return (
    <>
      {status !== "resolved" && (
        <button className="advance" disabled={pending} onClick={() => go("resolved")}>
          Mark resolved ✓
        </button>
      )}
      {status === "open" && (
        <button className="link" disabled={pending} onClick={() => go("waiting")}>
          Waiting on courier
        </button>
      )}
      {status !== "open" && (
        <button className="link" disabled={pending} onClick={() => go("open")}>
          Reopen
        </button>
      )}
    </>
  );
}
