import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use the direct connection (port 5432) for migrations when available,
    // otherwise fall back to the pooled URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
