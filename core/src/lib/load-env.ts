import dotenv from "dotenv";
import { resolveWorkerRole } from "./worker-role.ts";

const nodeEnv = process.env.NODE_ENV ?? "development";
const isWorker =
	process.env.OPENSIDE_SERVICE === "worker" ||
	process.env.npm_lifecycle_event?.startsWith("worker") ||
	process.argv.some((arg) => /(?:^|[/\\])worker\.(?:ts|js)$/.test(arg));

function workerEnvFile(): string {
	const role = resolveWorkerRole();
	// No role = the legacy single worker that consumes every queue.
	return role ? `.env.production-${role}-worker` : ".env.production-worker";
}

const productionEnv = isWorker ? workerEnvFile() : ".env.production-api";
const envFile = nodeEnv === "production" ? productionEnv : ".env.local";

dotenv.config({ path: envFile });
