"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  generateTokenAction,
  revokeTokenAction,
  type TokenState,
} from "@/app/(app)/activity/actions";

export type TokenRow = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function useToastOnResult(state: TokenState) {
  const seen = useRef<TokenState>(null);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function RevokeButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(
    revokeTokenAction,
    null,
  );
  useToastOnResult(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Revoke
      </Button>
    </form>
  );
}

export function TokenManager({ tokens }: { tokens: TokenRow[] }) {
  const [state, action, pending] = useActionState<TokenState, FormData>(
    generateTokenAction,
    null,
  );
  useToastOnResult(state);

  const freshToken = state?.ok ? (state.token ?? null) : null;

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="label">New token label</Label>
          <Input
            id="label"
            name="label"
            placeholder="mac-collector"
            className="w-52"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Generating…" : "Generate token"}
        </Button>
      </form>

      {freshToken && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium">
            Copy this into <code>collector/.env</code> now — it won&apos;t be
            shown again:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1 text-xs">
              {freshToken}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard?.writeText(freshToken).then(
                  () => toast.success("Copied"),
                  () => toast.error("Copy failed"),
                )
              }
            >
              Copy
            </Button>
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="divide-y rounded-lg border">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{t.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t.revokedAt
                    ? `revoked ${fmtDate(t.revokedAt)}`
                    : t.lastUsedAt
                      ? `last used ${fmtDateTime(t.lastUsedAt)}`
                      : "never used"}
                </span>
              </div>
              {!t.revokedAt && <RevokeButton id={t.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
