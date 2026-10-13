import type { Request } from "express";

const MAX_LIMIT = 50;

export function limitOf(req: Request, fallback = 30): number {
	const n = Number.parseInt(String(req.query.limit), 10);
	return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 1), MAX_LIMIT);
}

export function hasCursor(req: Request): boolean {
	return typeof req.query.cursor === "string" && req.query.cursor !== "";
}

export function str(value: unknown, max = 100): string {
	return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Keyset cursor "<ISO date>_<id>"; ids may contain underscores, dates never do. */
export function parseKeyset(req: Request): { date: Date; id: string } | null {
	const raw = req.query.cursor;
	if (typeof raw !== "string") return null;
	const i = raw.indexOf("_");
	if (i < 0) return null;
	const date = new Date(raw.slice(0, i));
	const id = raw.slice(i + 1);
	return Number.isNaN(date.getTime()) || !id ? null : { date, id };
}

/** Prisma `where` fragment for "older than the cursor", newest-first ordering on (field, id). */
export function keysetWhere(
	req: Request,
	field: string,
): Record<string, unknown> {
	const k = parseKeyset(req);
	if (!k) return {};
	return {
		OR: [{ [field]: { lt: k.date } }, { [field]: k.date, id: { lt: k.id } }],
	};
}

/** Trim the extra row fetched for look-ahead and build the next cursor. */
export function keysetPage<T extends { id: string }>(
	rows: T[],
	limit: number,
	dateOf: (row: T) => Date,
): { page: T[]; nextCursor: string | null } {
	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const last = page[page.length - 1];
	return {
		page,
		nextCursor:
			hasMore && last ? `${dateOf(last).toISOString()}_${last.id}` : null,
	};
}

export function offsetOf(req: Request): number {
	const n = Number.parseInt(String(req.query.cursor), 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export const num = (v: bigint | number | null | undefined) =>
	v == null ? 0 : Number(v);

export const toSeconds = (ms: Date | null, since: Date) =>
	ms ? Math.max(0, Math.round((ms.getTime() - since.getTime()) / 1000)) : null;
