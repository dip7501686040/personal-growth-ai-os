-- Phase 9: stream agent activity + approvals to the browser via Supabase Realtime.
-- RLS on these tables already restricts SELECT to `auth.uid() = user_id`, so a
-- signed-in client only ever receives its own rows.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE approvals;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
