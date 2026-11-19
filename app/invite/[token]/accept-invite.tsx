"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { acceptInvitationAction } from "@/lib/actions/business";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitationAction(token);
            if (res.ok) router.push("/dashboard");
            else setError(res.message);
          })
        }
      >
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
