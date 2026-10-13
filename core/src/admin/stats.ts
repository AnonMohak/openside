import { Router } from "express";
import { prisma } from "../db/index.ts";
import { daysAgo } from "./util.ts";

export const statsAdminRoutes = Router();

type DayRow = { d: string; n: bigint };

const perDay = (rows: DayRow[]) =>
	rows.map((r) => ({ _id: r.d, count: Number(r.n) }));

const SELF_HOST = {
	selfHostConfig: { is: { enabled: true, lastValidatedAt: { not: null } } },
};

// Accounts, plans and billing only: nothing about what people record or host.
statsAdminRoutes.get("/stats/overview", async (_req, res) => {
	const now = new Date();
	const d7 = daysAgo(7);
	const d30 = daysAgo(30);
	const today = new Date(now);
	today.setUTCHours(0, 0, 0, 0);
	const proActive = {
		plan: "PRO" as const,
		OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
	};

	const [
		users,
		selfHostUsers,
		proUsers,
		usersToday,
		users7d,
		users30d,
		subsByStatus,
		canceling,
		usersByDay,
	] = await Promise.all([
		prisma.user.count(),
		prisma.user.count({ where: SELF_HOST }),
		prisma.user.count({ where: { AND: [proActive, { NOT: SELF_HOST }] } }),
		prisma.user.count({ where: { createdAt: { gte: today } } }),
		prisma.user.count({ where: { createdAt: { gte: d7 } } }),
		prisma.user.count({ where: { createdAt: { gte: d30 } } }),
		prisma.user.groupBy({
			by: ["subscriptionStatus"],
			where: { polarSubscriptionId: { not: null } },
			_count: { _all: true },
		}),
		prisma.user.count({
			where: { cancelAtPeriodEnd: true, polarSubscriptionId: { not: null } },
		}),
		prisma.$queryRaw<
			DayRow[]
		>`SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, count(*)::bigint AS n FROM "User" WHERE "createdAt" >= ${d30} GROUP BY 1 ORDER BY 1`,
	]);

	res.json({
		totals: {
			users,
			proUsers,
			selfHostUsers,
			demoUsers: Math.max(0, users - proUsers - selfHostUsers),
		},
		growth: { usersToday, users7d, users30d },
		subscriptions: {
			byStatus: Object.fromEntries(
				subsByStatus.map((r) => [
					r.subscriptionStatus ?? "unknown",
					r._count._all,
				]),
			),
			canceling,
		},
		byDay: { users: perDay(usersByDay) },
	});
});
