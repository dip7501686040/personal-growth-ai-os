CREATE TYPE "public"."dsa_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."dsa_failure_reason" AS ENUM('none', 'could_not_identify_pattern', 'knew_pattern_impl_bug', 'tle', 'other');--> statement-breakpoint
CREATE TYPE "public"."learning_category" AS ENUM('technology', 'system_design', 'dsa', 'revision');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('gemini', 'openai');--> statement-breakpoint
CREATE TABLE "dsa_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"time_taken_minutes" integer,
	"solved" boolean DEFAULT false NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"confidence_before" integer,
	"confidence_after" integer,
	"failure_reason" "dsa_failure_reason" DEFAULT 'none' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dsa_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dsa_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dsa_patterns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "dsa_patterns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dsa_problem_patterns" (
	"problem_id" uuid NOT NULL,
	"pattern_id" uuid NOT NULL,
	CONSTRAINT "dsa_problem_patterns_problem_id_pattern_id_pk" PRIMARY KEY("problem_id","pattern_id")
);
--> statement-breakpoint
ALTER TABLE "dsa_problem_patterns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dsa_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"difficulty" "dsa_difficulty" NOT NULL,
	"topic" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dsa_problems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_session_skills" (
	"session_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "learning_session_skills_session_id_skill_id_pk" PRIMARY KEY("session_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "learning_session_skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"category" "learning_category" NOT NULL,
	"description" text,
	"resource_url" text,
	"duration_minutes" integer,
	"confidence_before" integer,
	"confidence_after" integer,
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_model_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_name" "agent_name" NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_model_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"agent_name" "agent_name",
	"provider" "llm_provider" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" numeric(12, 8),
	"cached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cache_key" text NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"model" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dsa_attempts" ADD CONSTRAINT "dsa_attempts_problem_id_dsa_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_problem_patterns" ADD CONSTRAINT "dsa_problem_patterns_problem_id_dsa_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_problem_patterns" ADD CONSTRAINT "dsa_problem_patterns_pattern_id_dsa_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."dsa_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_session_skills" ADD CONSTRAINT "learning_session_skills_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_session_skills" ADD CONSTRAINT "learning_session_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dsa_attempts_user_attempted_idx" ON "dsa_attempts" USING btree ("user_id","attempted_at");--> statement-breakpoint
CREATE INDEX "dsa_attempts_problem_idx" ON "dsa_attempts" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "dsa_problems_user_idx" ON "dsa_problems" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_user_occurred_idx" ON "learning_sessions" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_model_config_user_agent_idx" ON "agent_model_config" USING btree ("user_id","agent_name");--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_cache_key_idx" ON "llm_cache" USING btree ("cache_key");--> statement-breakpoint
-- read-only RLS policies (writes go through the app's service connection)
CREATE POLICY "own rows are readable" ON "learning_sessions" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "dsa_problems" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "dsa_attempts" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "ai_usage" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "own rows are readable" ON "agent_model_config" FOR SELECT TO authenticated USING ((select auth.uid()) = "user_id");--> statement-breakpoint
CREATE POLICY "patterns are readable" ON "dsa_patterns" FOR SELECT TO authenticated USING (true);--> statement-breakpoint
-- seed the DSA pattern reference list
INSERT INTO "dsa_patterns" ("slug","name","description","sort_order") VALUES
  ('sliding_window','Sliding Window','Contiguous subarray/substring over a moving window',10),
  ('two_pointers','Two Pointers','Converging or parallel pointers over a sequence',20),
  ('fast_slow_pointers','Fast & Slow Pointers','Cycle detection / middle finding with two speeds',30),
  ('binary_search','Binary Search','Search a sorted space or a monotonic predicate',40),
  ('bfs','BFS','Breadth-first traversal / shortest path on unweighted graphs',50),
  ('dfs','DFS','Depth-first traversal / recursion over graphs and trees',60),
  ('graph_modeling','Graph Modeling','Recognising when a problem is a graph and building it',70),
  ('topological_sort','Topological Sort','Ordering a DAG by dependencies',80),
  ('union_find','Union-Find','Disjoint sets / connectivity',90),
  ('dynamic_programming','Dynamic Programming','Overlapping subproblems + optimal substructure',100),
  ('greedy','Greedy','Locally optimal choices that stay globally optimal',110),
  ('backtracking','Backtracking','Systematic search with pruning',120),
  ('heap','Heap / Priority Queue','Top-K, streaming order, scheduling',130),
  ('intervals','Intervals','Merge / insert / schedule overlapping ranges',140),
  ('monotonic_stack','Monotonic Stack','Next-greater / span problems with a stack invariant',150),
  ('prefix_sum','Prefix Sum','Range aggregates via cumulative arrays',160),
  ('bit_manipulation','Bit Manipulation','XOR tricks, masks, bit counting',170),
  ('trie','Trie','Prefix tree for string sets',180),
  ('matrix_traversal','Matrix Traversal','Grid walks, often modelled as a graph',190),
  ('linked_list','Linked List','Pointer surgery, reversal, merging',200)
ON CONFLICT ("slug") DO NOTHING;