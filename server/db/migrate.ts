import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, sqlite } from "./client";

migrate(db, { migrationsFolder: "./server/db/migrations" });
sqlite.close();
console.log("[db] migrations applied");
