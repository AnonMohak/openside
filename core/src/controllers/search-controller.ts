import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth-middleware.ts";
import { findOrCreateUser } from "../services/auth-service.ts";
import { searchProjects } from "../services/search-service.ts";

/** GET /api/search?q= -> { results } (empty q = most recent projects) */
export async function searchProjectsController(
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

		const query = typeof req.query.q === "string" ? req.query.q : "";
		const user = await findOrCreateUser(req.user);
		const results = await searchProjects(user.id, query);

		res.status(200).json({
			success: true,
			data: { results },
			message: "Search completed successfully!",
		});
	} catch (error: unknown) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		res.status(500).json({
			success: false,
			data: null,
			message: `Failed to search projects: ${errorMessage}!`,
		});
	}
}
