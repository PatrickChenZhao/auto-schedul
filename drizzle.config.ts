import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Generation is offline. Migration commands must override this placeholder.
    url:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://unused:unused@localhost:5432/unused",
  },
  strict: true,
  verbose: true,
});
