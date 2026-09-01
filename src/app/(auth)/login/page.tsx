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
import { requestMagicLink, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    requestMagicLink,
    null,
  );

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Personal Growth AI OS</CardTitle>
          <CardDescription>
            Sign in with a magic link. No password required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
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
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send magic link"}
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
