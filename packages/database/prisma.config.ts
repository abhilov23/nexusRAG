import { config as loadEnv } from "dotenv";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as definePostgresConfig } from "@prisma/orm-postgres/config";

loadEnv({ path: "../../.env" }); // applying the global env 

const prismaConfig: Record<string, unknown> = definePrismaConfig({
  orm: definePostgresConfig({
    contract: "./prisma/schema.prisma",
    db: {
      connection: process.env["DATABASE_URL"]!,
    },
  }),
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});

export default prismaConfig;