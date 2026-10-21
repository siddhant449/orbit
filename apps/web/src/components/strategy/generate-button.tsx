"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@brandloop/ui";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function GenerateButton({ label = "Generate my strategy", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function poll(jobId: string) {
    for (let i = 0; i < 90; i++) {
      await wait(2000);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) continue;
        const job = (await res.json()) as { status: string; error?: string | null };
        if (job.status === "DONE") {
          router.refresh();
          toast.success("Strategy ready");
          return;
        }
        if (job.status === "FAILED") {
          toast.error(job.error || "Couldn't generate your strategy");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    toast.error("This is taking longer than expected. Check back soon.");
  }

  async function generate() {
    setWorking(true);
    try {
      const res = await fetch("/api/strategy/generate", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !body.jobId) {
        toast.error(body.error || "Couldn't generate your strategy");
        return;
      }
      toast("Building your strategy. It will appear here in a moment.");
      await poll(body.jobId);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={generate} disabled={working}>
      <Sparkles aria-hidden /> {working ? "Generating…" : label}
    </Button>
  );
}
