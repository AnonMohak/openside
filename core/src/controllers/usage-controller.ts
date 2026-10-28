import type { Response } from "express";
import { prisma } from "../db/index.ts";
import type { AuthenticatedRequest } from "../middlewares/auth-middleware.ts";
import { findOrCreateUser } from "../services/auth-service.ts";
import {
	LOW_CREDIT_WARNING_SECONDS,
	getEntitlements,
	hasActiveSubscription,
} from "../services/entitlements-service.ts";
import {
	type UsageSnapshot,
	getUsage,
	heartbeatSession,
	resolveSessionOwner,
} from "../services/usage-service.ts";

function serializeUsage(usage: UsageSnapshot, subscribed = false) {
	return {
		plan: usage.plan,
		// Paying for Pro - true even while recording on their own keys
		// (plan "selfhost"), so the client can still offer billing management.
		subscribed,
		used: usage.used,
		limit: usage.limit,
		remaining: usage.remaining,
		resets_at: usage.resetsAt ? usage.resetsAt.toISOString() : null,
		exhausted: usage.exhausted,
		warning:
			usage.remaining !== null && usage.remaining <= LOW_CREDIT_WARNING_SECONDS,
	};
}

/** GET /api/usage -> { used, limit, remaining, resets_at, plan } */
export async function getUsageController(
	req: AuthenticatedRequest,
	res: Response,
): Promise<void> {
	try {
		if (!req.user) {
			res.status(401).json({
				success: false,
				data: null,
				message: "Authentication required!",
			});
			return;
		}

		const user = await findOrCreateUser(req.user);
		const [usage, subscribed] = await Promise.all([
			getUsage(user.id),
			hasActiveSubscription(user.id),
		]);

		res.status(200).json({
			success: true,
			data: serializeUsage(usage, subscribed),
			message: "Usage retrieved successfully!",
		});
	} catch (error: unknown) {
		console.error("[API] Failed to load usage:", error);
		res.status(500).json({
			success: false,
			data: null,
			message: "Failed to load usage!",
		});
	}
}

/** GET /api/usage/entitlements - plan limits for client-side gating (UI only). */
export async function getEntitlementsController(
	req: AuthenticatedRequest,
	res: Response,
): Promise<void> {
	try {
		if (!req.user) {
			res.status(401).json({
				success: false,
				data: null,
				message: "Authentication required!",
			});
			return;
		}

		const user = await findOrCreateUser(req.user);
		const entitlements = await getEntitlements(user.id);

		res.status(200).json({
			success: true,
			data: entitlements,
			message: "Entitlements retrieved successfully!",
		});
	} catch (error: unknown) {
		console.error("[API] Failed to load entitlements:", error);
		res.status(500).json({
			success: false,
			data: null,
			message: "Failed to load entitlements!",
		});
	}
}

/**
 * POST /api/usage/heartbeat { sessionId }
 *
 * Sent by the recording client every ~15s. Credits elapsed seconds to the
 * owner's usage period and returns the fresh snapshot; when credit hits 0 the
 * session is stopped server-side (captured media is kept) and `exhausted` tells
 * the client to stop, save, and show the upgrade CTA.
 */
export async function usageHeartbeatController(
	req: AuthenticatedRequest,
	res: Response,
): Promise<void> {
	try {
		if (!req.user) {
			res.status(401).json({
				success: false,
				data: null,
				message: "Authentication required!",
			});
			return;
		}

		const { sessionId } = req.body;
		if (!sessionId || typeof sessionId !== "string") {
			res.status(400).json({
				success: false,
				data: null,
				message: "Session ID is required!",
			});
			return;
		}

		const session = await prisma.recordingSession.findUnique({
			where: { id: sessionId },
			select: { spaceId: true, userId: true },
		});

		if (!session) {
			res
				.status(404)
				.json({ success: false, data: null, message: "Session not found!" });
			return;
		}

		// Only the user whose credit the session burns may drive its meter.
		const user = await findOrCreateUser(req.user);
		const ownerUserId = await resolveSessionOwner(session);
		if (ownerUserId !== user.id) {
			res
				.status(403)
				.json({ success: false, data: null, message: "Not your session!" });
			return;
		}

		const usage = await heartbeatSession(sessionId);
		if (!usage) {
			// Unmetered (self-host) - nothing to report, nothing to enforce.
			res.status(200).json({
				success: true,
				data: null,
				message: "Session is not metered.",
			});
			return;
		}

		res.status(200).json({
			success: true,
			data: serializeUsage(usage),
			message: "Heartbeat recorded!",
		});
	} catch (error: unknown) {
		console.error("[API] Heartbeat failed:", error);
		res.status(500).json({
			success: false,
			data: null,
			message: "Heartbeat failed!",
		});
	}
}
