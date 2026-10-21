import { prisma } from "../db/index.ts";
import { isSelfHostActive } from "./infra-service.ts";
import {
	createLiveKitRoom,
	deleteLiveKitRoom,
	generateLiveKitToken,
	getLiveKitIdentity,
	getLiveKitRoomName,
} from "./livekit-service.ts";
import { stopActiveSpaceRecordingSessions } from "./recording-service.ts";
import {
	type PrefixTarget,
	addStoredKey,
	deleteObjects,
	deletePrefixTargets,
	resolvePrefixTarget,
} from "./storage-service.ts";

interface CreateSpaceData {
	title: string;
	description?: string;
	joinCode: string;
	hostId: string;
	hostName: string;
	hostParticipantSessionId: string;
}

interface UpdateSpaceData {
	title?: string;
	description?: string;
}

interface ScheduleSpaceData {
	title: string;
	description?: string;
	joinCode: string;
	scheduledFor: Date;
	invitees?: string[];
	hostId: string;
	hostName: string;
	hostParticipantSessionId: string;
}

const userSpaceSelect = {
	id: true,
	title: true,
	joinCode: true,
	hostId: true,
	status: true,
	scheduledFor: true,
	invitees: true,
	startTime: true,
	endTime: true,
	duration: true,
	createdAt: true,
	host: {
		select: {
			id: true,
			name: true,
			avatar: true,
		},
	},
	_count: {
		select: {
			participants: true,
			recordingSessions: true,
		},
	},
} as const;

export async function verifySpaceHost(
	spaceId: string,
	userId: string,
): Promise<boolean> {
	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		select: { hostId: true },
	});

	return space?.hostId === userId;
}

export async function verifySpaceEndPermission(
	spaceId: string,
	userId?: string,
	participantSessionId?: string,
): Promise<boolean> {
	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		select: { hostId: true },
	});

	if (userId && space?.hostId === userId) {
		return true;
	}

	// A co-host (or host) may end the space. Logged-in users are matched by their
	// userId; guest co-hosts have no account, so they're matched by the session
	// id tied to their active participant record.
	if (!userId && !participantSessionId) {
		return false;
	}

	const participant = await prisma.spaceParticipant.findFirst({
		where: {
			spaceId,
			isActive: true,
			role: { in: ["HOST", "CO_HOST"] },
			...(userId ? { userId } : { participantSessionId }),
		},
		select: { id: true },
	});

	return !!participant;
}

// Detects a Prisma unique-constraint violation (P2002) on the joinCode column.
// This is the race that slips past the isJoinCodeUnique() pre-check: two creates
// generate the same code in the same instant, both pass the read, and the DB
// rejects the second insert. Translating it lets the controller's retry loop
// treat it like any other code collision.
function isJoinCodeConflict(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const { code, meta } = error as {
		code?: string;
		meta?: { target?: unknown };
	};
	if (code !== "P2002") {
		return false;
	}

	const target = meta?.target;
	if (Array.isArray(target)) {
		return target.includes("joinCode");
	}
	if (typeof target === "string") {
		return target.includes("joinCode");
	}
	// No usable target info - assume it's the joinCode constraint and retry.
	return true;
}

// Join codes are stored and generated in uppercase, but users may type them in
// any case. Normalizing every lookup/store keeps "jk5f8" and "JK5F8" equivalent.
function normalizeJoinCode(joinCode: string): string {
	return joinCode.trim().toUpperCase();
}

async function isJoinCodeUnique(joinCode: string): Promise<boolean> {
	const existingSpace = await prisma.space.findUnique({
		where: { joinCode: normalizeJoinCode(joinCode) },
	});

	return !existingSpace;
}

export async function createSpace(data: CreateSpaceData) {
	const { title, description, hostId, hostName, hostParticipantSessionId } =
		data;
	const joinCode = normalizeJoinCode(data.joinCode);

	const isUnique = await isJoinCodeUnique(joinCode);
	if (!isUnique) {
		throw new Error("JOIN_CODE_EXISTS");
	}

	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
	// Pin the room to the host's infra as of now (see infra-service).
	const selfHosted = await isSelfHostActive(hostId);
	const createdSpace = await prisma.space
		.create({
			data: {
				title,
				description,
				joinCode,
				hostId,
				selfHosted,
				status: "LIVE",
				startTime: new Date(),
				expiresAt,
				participants: {
					create: {
						userId: hostId,
						participantSessionId: hostParticipantSessionId,
						displayName: hostName,
						role: "HOST",
						isActive: true,
						isGuest: false,
					},
				},
			},
			include: {
				host: {
					select: {
						id: true,
						name: true,
						email: true,
						avatar: true,
					},
				},
				participants: {
					where: { isActive: true },
					include: {
						user: {
							select: {
								id: true,
								name: true,
								avatar: true,
							},
						},
					},
				},
			},
		})
		.catch((error: unknown) => {
			if (isJoinCodeConflict(error)) {
				throw new Error("JOIN_CODE_EXISTS");
			}
			throw error;
		});

	const livekitRoomName = getLiveKitRoomName(createdSpace.id);
	const hostLiveKitIdentity = getLiveKitIdentity({
		spaceId: createdSpace.id,
		participantSessionId: hostParticipantSessionId,
		userId: hostId,
		isGuest: false,
	});

	await prisma.spaceParticipant.updateMany({
		where: {
			spaceId: createdSpace.id,
			role: "HOST",
		},
		data: {
			livekitIdentity: hostLiveKitIdentity,
			lastConnectedAt: new Date(),
			connectionState: "connected",
		},
	});

	const space = await prisma.space.update({
		where: { id: createdSpace.id },
		data: { livekitRoomName },
		include: {
			host: {
				select: {
					id: true,
					name: true,
					email: true,
					avatar: true,
				},
			},
			participants: {
				where: { isActive: true },
				include: {
					user: {
						select: {
							id: true,
							name: true,
							avatar: true,
						},
					},
				},
			},
		},
	});

	await createLiveKitRoom({
		name: livekitRoomName,
		metadata: {
			spaceId: space.id,
			joinCode: space.joinCode,
			hostId: space.hostId,
		},
	});

	const hostParticipant = space.participants.find(
		(participant) => participant.role === "HOST",
	);

	if (!hostParticipant) {
		return space;
	}

	const livekit = await generateLiveKitToken({
		space,
		participant: hostParticipant,
	});

	return { ...space, livekit };
}

// Idempotent counterpart to createSpace: if a host re-issues "create" for a
// join code they already own and that is still LIVE (e.g. a double-fired/retried
// request after the first one already created the row), return the existing
// space with a fresh host token instead of failing with a duplicate-code error.
export async function resumeHostSpace(
	joinCode: string,
	userId: string,
	participantSessionId: string,
) {
	const existing = await prisma.space.findUnique({
		where: { joinCode: normalizeJoinCode(joinCode) },
		select: { id: true, hostId: true, status: true, livekitRoomName: true },
	});

	// Not ours or not live -> a genuine collision, let the caller treat it as one.
	if (!existing || existing.hostId !== userId || existing.status !== "LIVE") {
		return null;
	}

	const livekitRoomName =
		existing.livekitRoomName || getLiveKitRoomName(existing.id);
	const hostLiveKitIdentity = getLiveKitIdentity({
		spaceId: existing.id,
		participantSessionId,
		userId,
		isGuest: false,
	});

	await prisma.spaceParticipant.updateMany({
		where: { spaceId: existing.id, role: "HOST" },
		data: {
			livekitIdentity: hostLiveKitIdentity,
			isActive: true,
			leftAt: null,
			lastConnectedAt: new Date(),
			connectionState: "connected",
		},
	});

	const space = await prisma.space.update({
		where: { id: existing.id },
		data: { livekitRoomName },
		include: {
			host: {
				select: { id: true, name: true, email: true, avatar: true },
			},
			participants: {
				where: { isActive: true },
				include: {
					user: { select: { id: true, name: true, avatar: true } },
				},
			},
		},
	});

	// createLiveKitRoom already no-ops if the room still exists.
	await createLiveKitRoom({
		name: livekitRoomName,
		metadata: {
			spaceId: space.id,
			joinCode: space.joinCode,
			hostId: space.hostId,
		},
	});

	const hostParticipant = space.participants.find(
		(participant) => participant.role === "HOST",
	);

	if (!hostParticipant) {
		return space;
	}

	const livekit = await generateLiveKitToken({
		space,
		participant: hostParticipant,
	});

	return { ...space, livekit };
}

// Create a meeting that is planned for the future. Unlike createSpace, this does
// NOT spin up a LiveKit room or mint a host token - the room is provisioned only
// when the first person joins (see joinSpace in participant-service). The
// join code is still generated up front so an invite link works immediately.
export async function scheduleSpace(data: ScheduleSpaceData) {
	const {
		title,
		description,
		scheduledFor,
		invitees,
		hostId,
		hostName,
		hostParticipantSessionId,
	} = data;
	const joinCode = normalizeJoinCode(data.joinCode);

	const isUnique = await isJoinCodeUnique(joinCode);
	if (!isUnique) {
		throw new Error("JOIN_CODE_EXISTS");
	}

	// A scheduled meeting stays joinable for 24h after its planned start, so a
	// late host (or a meeting that slipped) doesn't silently expire too early.
	const expiresAt = new Date(scheduledFor.getTime() + 24 * 60 * 60 * 1000);

	const space = await prisma.space
		.create({
			data: {
				title,
				description,
				joinCode,
				hostId,
				status: "SCHEDULED",
				scheduledFor,
				invitees: invitees ?? [],
				expiresAt,
				participants: {
					create: {
						userId: hostId,
						participantSessionId: hostParticipantSessionId,
						displayName: hostName,
						role: "HOST",
						// Host isn't connected yet - they become active on activation.
						isActive: false,
						isGuest: false,
					},
				},
			},
			include: {
				host: {
					select: { id: true, name: true, email: true, avatar: true },
				},
				participants: {
					include: {
						user: { select: { id: true, name: true, avatar: true } },
					},
				},
			},
		})
		.catch((error: unknown) => {
			if (isJoinCodeConflict(error)) {
				throw new Error("JOIN_CODE_EXISTS");
			}
			throw error;
		});

	return space;
}

export async function updateSpace(spaceId: string, data: UpdateSpaceData) {
	const space = await prisma.space.update({
		where: { id: spaceId },
		data: {
			...(data.title !== undefined && { title: data.title }),
			...(data.description !== undefined && { description: data.description }),
		},
	});

	return space;
}

// Permanently delete a space and everything under it: recording sessions,
// participant recordings, segments, final outputs, participants, the LiveKit
// room, and all associated R2 objects. Host only.
export async function deleteSpace(
	spaceId: string,
	userId: string,
): Promise<{ deleted: true }> {
	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		select: {
			id: true,
			hostId: true,
			livekitRoomName: true,
			recordingSessions: {
				select: {
					id: true,
					participantRecordings: {
						select: {
							mergedFileKey: true,
							thumbnailKey: true,
							segments: { select: { assetKey: true } },
						},
					},
					finalOutputs: {
						select: {
							masterKey: true,
							audioWavKey: true,
							thumbnailKey: true,
						},
					},
				},
			},
		},
	});

	if (!space) {
		throw new Error("SPACE_NOT_FOUND");
	}
	if (space.hostId !== userId) {
		throw new Error("FORBIDDEN");
	}

	// Known keys (masters with their cached download formats), then a sweep of
	// the space's folder for anything the database never knew about.
	const keys = new Set<string>();
	const cached = { withCachedFormats: true };
	for (const session of space.recordingSessions) {
		for (const recording of session.participantRecordings) {
			addStoredKey(keys, recording.mergedFileKey, cached);
			addStoredKey(keys, recording.thumbnailKey);
			for (const segment of recording.segments) {
				addStoredKey(keys, segment.assetKey);
			}
		}
		for (const output of session.finalOutputs) {
			addStoredKey(keys, output.masterKey, cached);
			addStoredKey(keys, output.audioWavKey, cached);
			addStoredKey(keys, output.thumbnailKey);
		}
	}
	// Resolved before the rows go: a self-host session's bucket is looked up
	// from them.
	const targets: PrefixTarget[] = [];
	for (const prefix of [
		`spaces/${spaceId}/`,
		...space.recordingSessions.map(
			(session) => `spaces/${spaceId}/sessions/${session.id}/`,
		),
	]) {
		const target = await resolvePrefixTarget(prefix).catch(() => null);
		if (target) targets.push(target);
	}

	await prisma.$transaction([
		prisma.finalOutput.deleteMany({ where: { spaceId } }),
		prisma.recordingSegment.deleteMany({ where: { spaceId } }),
		prisma.participantRecording.deleteMany({
			where: { recordingSession: { spaceId } },
		}),
		prisma.recordingSession.deleteMany({ where: { spaceId } }),
		prisma.spaceParticipant.deleteMany({ where: { spaceId } }),
		prisma.space.delete({ where: { id: spaceId } }),
	]);

	if (space.livekitRoomName) {
		await deleteLiveKitRoom(space.livekitRoomName).catch(() => {});
	}
	await deleteObjects([...keys]).catch((error) => {
		console.error(
			`[SpaceCleanup] failed to delete R2 objects for ${spaceId}:`,
			error,
		);
	});
	await deletePrefixTargets(targets).catch((error) => {
		console.error(
			`[SpaceCleanup] prefix sweep failed for ${spaceId} (known keys are gone):`,
			error,
		);
	});

	return { deleted: true };
}

export async function endSpace(spaceId: string) {
	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		select: { startTime: true, status: true, livekitRoomName: true },
	});

	if (!space) {
		throw new Error("SPACE_NOT_FOUND");
	}

	// Idempotent: ending an already-ended space is a no-op success. A second/late
	// end request (e.g. from the optimistic client flow, or two co-hosts ending at
	// once) should not 400 - the goal (space ended) is already achieved. Still try
	// to delete the LiveKit room in case it lingered; that call is a no-op if gone.
	if (space.status !== "LIVE") {
		await deleteLiveKitRoom(space.livekitRoomName);
		// Backstop: an earlier end path may have orphaned an ACTIVE session.
		await stopActiveSpaceRecordingSessions(spaceId);
		return getSpaceById(spaceId);
	}

	// Stop any in-flight recording BEFORE the space flips to ENDED, so the
	// session can't outlive the space and keep accruing metered usage.
	await stopActiveSpaceRecordingSessions(spaceId);

	const endTime = new Date();
	const duration = space.startTime
		? endTime.getTime() - space.startTime.getTime()
		: 0;

	const [updatedSpace] = await prisma.$transaction([
		prisma.space.update({
			where: { id: spaceId },
			data: {
				endTime,
				duration,
				status: "ENDED",
				endedReason: "HOST_ENDED",
			},
			include: {
				host: {
					select: {
						id: true,
						name: true,
						email: true,
						avatar: true,
					},
				},
				participants: {
					include: {
						user: {
							select: {
								id: true,
								name: true,
								avatar: true,
							},
						},
					},
				},
			},
		}),
		prisma.spaceParticipant.updateMany({
			where: {
				spaceId,
				isActive: true,
			},
			data: {
				isActive: false,
				leftAt: endTime,
			},
		}),
	]);

	await deleteLiveKitRoom(space.livekitRoomName);

	return updatedSpace;
}

export async function getSpaceById(spaceId: string) {
	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		include: {
			host: {
				select: {
					id: true,
					name: true,
					email: true,
					avatar: true,
				},
			},
			participants: {
				where: { isActive: true },
				include: {
					user: {
						select: {
							id: true,
							name: true,
							avatar: true,
						},
					},
				},
			},
			_count: {
				select: {
					recordingSessions: true,
				},
			},
		},
	});

	return space;
}

/**
 * Self-heal: a space whose `expiresAt` has passed but is still marked LIVE (or
 * SCHEDULED - a planned meeting nobody ever started) is stale. Flip it to ENDED
 * so the status we report everywhere (records, join, pre-join existence checks)
 * reflects reality instead of a meeting that looks live/upcoming but can't be
 * joined. Idempotent and guarded on the original status so concurrent callers
 * can't double-end. Returns the effective status.
 */
export async function ensureSpaceFreshness(space: {
	id: string;
	status: string;
	expiresAt: Date | null;
	startTime?: Date | null;
	livekitRoomName?: string | null;
}): Promise<string> {
	const isStaleable = space.status === "LIVE" || space.status === "SCHEDULED";
	if (!isStaleable) return space.status;
	if (!space.expiresAt || space.expiresAt.getTime() > Date.now()) {
		return space.status;
	}

	const endTime = new Date();
	const duration = space.startTime
		? endTime.getTime() - space.startTime.getTime()
		: 0;

	// Best-effort teardown of any lingering LiveKit room (no-op if already gone).
	await deleteLiveKitRoom(space.livekitRoomName ?? null);

	// An expired space can still have an in-flight recording - stop it before
	// the space flips to ENDED so it can't keep accruing metered usage.
	await stopActiveSpaceRecordingSessions(space.id);

	await prisma.$transaction([
		prisma.space.updateMany({
			// Guarded above: only LIVE/SCHEDULED rows reach here.
			where: { id: space.id, status: space.status as "LIVE" | "SCHEDULED" },
			data: { status: "ENDED", endTime, duration, endedReason: "EXPIRED" },
		}),
		prisma.spaceParticipant.updateMany({
			where: { spaceId: space.id, isActive: true },
			data: { isActive: false, leftAt: endTime },
		}),
	]);

	return "ENDED";
}

export async function getSpaceByJoinCode(joinCode: string) {
	const space = await prisma.space.findUnique({
		where: { joinCode: normalizeJoinCode(joinCode) },
		select: {
			id: true,
			title: true,
			description: true,
			status: true,
			scheduledFor: true,
			startTime: true,
			expiresAt: true,
			livekitRoomName: true,
			host: {
				select: {
					id: true,
					name: true,
					avatar: true,
				},
			},
		},
	});

	if (!space) return null;

	// Correct a stale LIVE/SCHEDULED row before reporting it, so callers (and the
	// user's records) never see an expired meeting as "live" or "upcoming".
	const status = await ensureSpaceFreshness(space);

	return {
		id: space.id,
		title: space.title,
		description: space.description,
		status,
		scheduledFor: space.scheduledFor,
		startTime: space.startTime,
		host: space.host,
	};
}

export async function isUserParticipant(
	spaceId: string,
	userId: string,
): Promise<boolean> {
	const participant = await prisma.spaceParticipant.findFirst({
		where: {
			spaceId,
			userId,
		},
	});

	return !!participant;
}

export async function getUserSpaces(
	userId: string,
	filter?: "hosted" | "participated" | "all",
) {
	const filterType = filter || "all";

	if (filterType === "hosted") {
		// Spaces where user is the host
		return await prisma.space.findMany({
			where: { hostId: userId },
			select: userSpaceSelect,
			orderBy: { createdAt: "desc" },
		});
	}

	if (filterType === "participated") {
		// Spaces where user participated (not as host)
		const participations = await prisma.spaceParticipant.findMany({
			where: {
				userId,
				space: {
					hostId: { not: userId },
				},
			},
			select: {
				role: true,
				joinedAt: true,
				space: {
					select: userSpaceSelect,
				},
			},
			orderBy: { joinedAt: "desc" },
		});

		return participations.map((p) => ({
			...p.space,
			participantRole: p.role,
			participantJoinedAt: p.joinedAt,
		}));
	}

	// All spaces (hosted + participated + scheduled ones you're invited to)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	});
	const [hostedSpaces, participatedSpaces, invitedSpaces] = await Promise.all([
		prisma.space.findMany({
			where: { hostId: userId },
			select: userSpaceSelect,
		}),
		prisma.spaceParticipant.findMany({
			where: {
				userId,
				space: {
					hostId: { not: userId },
				},
			},
			select: {
				role: true,
				joinedAt: true,
				space: {
					select: userSpaceSelect,
				},
			},
		}),
		// Invitees are stored lowercased at schedule time. Only upcoming
		// sessions - once it's run, it shows up via participation if they joined.
		user
			? prisma.space.findMany({
					where: {
						status: "SCHEDULED",
						hostId: { not: userId },
						invitees: { has: user.email.toLowerCase() },
					},
					select: userSpaceSelect,
				})
			: Promise.resolve([]),
	]);

	const hosted = hostedSpaces.map((s) => ({
		...s,
		userRole: "HOST" as const,
	}));

	const participated = participatedSpaces.map((p) => ({
		...p.space,
		userRole: p.role,
		participantJoinedAt: p.joinedAt,
	}));

	const seen = new Set([...hosted, ...participated].map((s) => s.id));
	const invited = invitedSpaces
		.filter((s) => !seen.has(s.id))
		.map((s) => ({ ...s, userRole: "INVITED" as const }));

	// Combine and sort by createdAt
	return [...hosted, ...participated, ...invited].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}
