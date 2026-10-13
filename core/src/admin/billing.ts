import { Router } from "express";
import { type Prisma, prisma } from "../db/index.ts";
import { hasCursor, keysetPage, keysetWhere, limitOf, str } from "./util.ts";

export const billingAdminRoutes = Router();

// GET /billing/subscribers?q=&status=all|active|canceling|ended&cursor=&limit=
billingAdminRoutes.get("/billing/subscribers", async (req, res) => {
	const q = str(req.query.q);
	const status = str(req.query.status);
	const and: Prisma.UserWhereInput[] = [{ polarSubscriptionId: { not: null } }];
	if (status === "active")
		and.push({
			subscriptionStatus: { in: ["active", "trialing"] },
			cancelAtPeriodEnd: false,
		});
	if (status === "canceling") and.push({ cancelAtPeriodEnd: true });
	if (status === "ended")
		and.push({
			OR: [
				{ subscriptionStatus: null },
				{ subscriptionStatus: { notIn: ["active", "trialing"] } },
			],
		});
	if (q)
		and.push({
			OR: [
				{ name: { contains: q, mode: "insensitive" } },
				{ email: { contains: q, mode: "insensitive" } },
			],
		});
	const where: Prisma.UserWhereInput = { AND: and };
	const limit = limitOf(req);
	const total = hasCursor(req) ? undefined : await prisma.user.count({ where });
	const rows = await prisma.user.findMany({
		where: {
			AND: [where, keysetWhere(req, "createdAt") as Prisma.UserWhereInput],
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: limit + 1,
		select: {
			id: true,
			name: true,
			email: true,
			avatar: true,
			subscriptionStatus: true,
			cancelAtPeriodEnd: true,
			currentPeriodStart: true,
			currentPeriodEnd: true,
			createdAt: true,
		},
	});
	const { page, nextCursor } = keysetPage(rows, limit, (u) => u.createdAt);
	res.json({ total, nextCursor, subscribers: page });
});

// GET /billing/events?cursor=&limit=: processed Polar webhook deliveries (type + time only).
billingAdminRoutes.get("/billing/events", async (req, res) => {
	const limit = limitOf(req);
	const total = hasCursor(req)
		? undefined
		: await prisma.processedWebhookEvent.count();
	const rows = await prisma.processedWebhookEvent.findMany({
		where: keysetWhere(
			req,
			"processedAt",
		) as Prisma.ProcessedWebhookEventWhereInput,
		orderBy: [{ processedAt: "desc" }, { id: "desc" }],
		take: limit + 1,
	});
	const { page, nextCursor } = keysetPage(rows, limit, (e) => e.processedAt);
	res.json({
		total,
		nextCursor,
		events: page.map((e) => ({
			id: e.id,
			type: e.type,
			processedAt: e.processedAt,
		})),
	});
});
