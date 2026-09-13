"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requestMagicLink,
  signInWithPassword,
  tryDemoAction,
  type LoginState,
} from "./actions";

export default function LoginPage() {
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    null,
  );
  const [linkState, linkAction, linkPending] = useActionState<
    LoginState,
    FormData
  >(requestMagicLink, null);
  const [demoState, demoAction, demoPending] = useActionState<
    LoginState,
    FormData
  >(tryDemoAction, null);

  const state = pwState ?? linkState ?? demoState;
  const pending = pwPending || linkPending || demoPending;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Personal Growth AI OS</CardTitle>
          <CardDescription>
            Sign in with your password, or get a one-time magic link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={pwAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" disabled={pending}>
              {pwPending ? "Signing in…" : "Sign in"}
            </Button>
            <Button
              type="submit"
              variant="ghost"
              formAction={linkAction}
              disabled={pending}
            >
              {linkPending ? "Sending…" : "Email me a magic link instead"}
            </Button>
            <Button
              type="submit"
              variant="outline"
              formAction={demoAction}
              formNoValidate
              disabled={pending}
            >
              {demoPending ? "Entering demo…" : "Try the demo (read/write, resets daily)"}
            </Button>

            {state && (
              <p
                className={
                  state.ok
                    ? "text-sm text-muted-foreground"
                    : "text-sm text-destructive"
                }
                role="status"
              >
                {state.message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
