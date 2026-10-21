/**
 * Project search for the dashboard's ⌘K menu: the user's meeting projects
 * (spaces they host that have a recording) and their screen recordings.
 *
 * A meeting project matches on its title, any of its takes' titles, or the
 * name of anyone who was in it; a screen recording on its title. Matching is a
 * case-insensitive substring, newest first. An empty query returns the most
 * recent few, for the menu's "Recent projects".
 */

import { prisma } from "../db/index.ts";

export interface ProjectSearchResult {
	id: string;
	kind: "space" | "screen";
	title: string;
	/** Sort key: when the project was created / the recording started. */
	at: string;
	/** Why it matched when the title didn't: a take's title or a person. */
	match: string | null;
}

const MAX_QUERY_LENGTH = 100;
const SEARCH_LIMIT = 20;
const RECENT_LIMIT = 5;
const UNTITLED = "Untitled recording";

export async function searchProjects(
	userId: string,
	rawQuery: string,
): Promise<ProjectSearchResult[]> {
	const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
	const take = query ? SEARCH_LIMIT : RECENT_LIMIT;
	const text = { contains: query, mode: "insensitive" as const };
	const lowerQuery = query.toLowerCase();

	const [spaces, screens] = await Promise.all([
		prisma.space.findMany({
			where: {
				hostId: userId,
				recordingSessions: { some: {} },
				...(query
					? {
							OR: [
								{ title: text },
								{ recordingSessions: { some: { title: text } } },
								{ participants: { some: { displayName: text } } },
							],
						}
					: {}),
			},
			select: {
				id: true,
				title: true,
				createdAt: true,
				// What matched, when it wasn't the title (unused for an empty query).
				recordingSessions: {
					where: { title: text },
					select: { title: true },
					take: 1,
				},
				participants: {
					where: { displayName: text },
					select: { displayName: true },
					take: 1,
				},
			},
			orderBy: { createdAt: "desc" },
			take,
		}),
		prisma.recordingSession.findMany({
			where: {
				source: "SCREEN_RECORDER",
				userId,
				...(query ? { title: text } : {}),
			},
			select: { id: true, title: true, startedAt: true },
			orderBy: { startedAt: "desc" },
			take,
		}),
	]);

	const results: ProjectSearchResult[] = [
		...spaces.map((space) => {
			const title = space.title || UNTITLED;
			let match: string | null = null;
			if (query && !title.toLowerCase().includes(lowerQuery)) {
				const takeTitle = space.recordingSessions[0]?.title;
				const person = space.participants[0]?.displayName;
				match = takeTitle ? takeTitle : person ? `with ${person}` : null;
			}
			return {
				id: space.id,
				kind: "space" as const,
				title,
				at: space.createdAt.toISOString(),
				match,
			};
		}),
		...screens.map((screen) => ({
			id: screen.id,
			kind: "screen" as const,
			title: screen.title || UNTITLED,
			at: screen.startedAt.toISOString(),
			match: null,
		})),
	];

	return results.sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
}
