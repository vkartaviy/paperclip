import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../dist/office/schema.js",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
