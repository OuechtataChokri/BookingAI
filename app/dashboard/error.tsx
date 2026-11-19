"use client";

import { useEffect } from "react";
import { Alert, Button } from "@/components/ui";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[bookai] dashboard error", error.digest ?? "");
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tone="error" title="We could not load this page">
        Something went wrong while loading your data. If you just set up Supabase, make sure you ran the SQL migration (see README).
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      </Alert>
    </div>
  );
}
