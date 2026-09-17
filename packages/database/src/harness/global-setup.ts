import type { TestProject } from "vitest/node";
import { createMigratedTemplate, startServer, type DbServerInfo } from "./server";

declare module "vitest" {
  export interface ProvidedContext {
    db: DbServerInfo;
  }
}

export default async function setup(project: TestProject) {
  const server = await startServer();
  try {
    await createMigratedTemplate(server.info);
  } catch (error) {
    await server.stop();
    throw error;
  }

  project.provide("db", server.info);

  return async () => {
    await server.stop();
  };
}
