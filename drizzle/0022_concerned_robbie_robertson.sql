ALTER TABLE "skills" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_id_skills_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skills_parent_idx" ON "skills" USING btree ("parent_id") WHERE "skills"."parent_id" is not null;