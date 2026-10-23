/**
 * SOCKET.IO APP EVENT SERVER
 *
 * PURPOSE:
 * LiveKit owns video, audio, participant state, and media reconnection.
 * Socket.IO remains for app-specific realtime events that are not currently
 * handled by LiveKit, such as recording coordination and upload progress.
 *
 * EVENTS FLOW:
 * - recording-started: the API started a session → all participants start local recording
 * - recording-stopped: the session stopped → all participants stop and finalize
 *
 * Start/stop are published by the server (lib/recording-events) after the
 * authenticated API call commits - clients can't emit them, so a room code alone
 * can't start or stop anyone's recording.
 */

import type { Server as HTTPServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../db/index.ts";
import {
	type RecordingStartedPayload,
	buildRecordingStartedPayload,
	setRecordingEventPublisher,
} from "../lib/recording-events.ts";
import { getSessionIdByShareToken } from "../services/recording-service";

type RecordingCommentEvent = {
	id: string;
	authorName: string;
	body: string;
	timestampMs: number | null;
	parentId: string | null;
	editedAt: Date | null;
	createdAt: Date;
	user: { id: string; avatar: string | null } | null;
};

const recordingCommentsRoom = (sessionId: string) =>
	`recording-comments:${sessionId}`;

// REST controllers publish here only after the comment is committed.
let socketServer: SocketIOServer | null = null;

/** Deliver a newly created comment to every viewer of that shared recording. */
export function emitRecordingCommentCreated(
	sessionId: string,
	comment: RecordingCommentEvent,
) {
	socketServer
		?.to(recordingCommentsRoom(sessionId))
		.emit("recording-comment-created", comment);
}

/** Deliver an edited comment to every viewer of that recording. */
export function emitRecordingCommentUpdated(
	sessionId: string,
	comment: RecordingCommentEvent,
) {
	socketServer
		?.to(recordingCommentsRoom(sessionId))
		.emit("recording-comment-updated", comment);
}

export function initSocket(httpServer: HTTPServer) {
	const io = new SocketIOServer(httpServer, {
		cors: {
			origin: process.env.WEB_URL || "http://localhost:3000",
			methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		},
	});
	socketServer = io;

	setRecordingEventPublisher({
		started(roomId, payload: RecordingStartedPayload) {
			io.to(roomId).emit("recording-started", payload);
		},
		stopped(roomId, sessionId) {
			io.to(roomId).emit("recording-stopped", sessionId);
		},
	});

	io.on("connection", (socket) => {
		/**
		 * EVENT: time:sync
		 * Clock-synchronization handshake. The client sends this with an ack
		 * callback; we immediately answer with the server's wall-clock time.
		 *
		 * The server is the single source of truth for time. Each client pings a
		 * few times, measures the round-trip, and derives how far its own clock is
		 * from ours (NTP-style). Every recording timestamp - start, join,
		 * screen-share, stop - is then expressed in server time, so tracks line up
		 * regardless of how wrong an individual laptop's clock is.
		 */
		socket.on("time:sync", (ack: (serverTime: number) => void) => {
			if (typeof ack === "function") ack(Date.now());
		});

		/**
		 * EVENT: join-room / leave-room
		 * Clients must join a Socket.IO room (keyed by the space join code) so that
		 * recording coordination broadcasts (io.to(roomId)) actually reach them.
		 */
		socket.on("join-room", async (roomId: string) => {
			if (!roomId) return;

			socket.join(roomId);

			// Replay a live session to a (re)joining client from the database - the
			// source of truth - so a stale cache can never restart a stopped take.
			const activeSession = await prisma.space
				.findUnique({
					where: { joinCode: roomId },
					select: {
						recordingSessions: {
							where: { status: "ACTIVE" },
							orderBy: { startedAt: "desc" },
							take: 1,
							select: {
								id: true,
								spaceRecordingSessionId: true,
								startedAt: true,
								videoResolution: true,
								targetFps: true,
								audioSampleRate: true,
								noiseSuppression: true,
								autoGainControl: true,
								echoCancellation: true,
								recordingMode: true,
							},
						},
					},
				})
				.catch((error) => {
					console.error(
						`[Socket] active recording lookup failed for ${roomId}:`,
						error,
					);
					return null;
				});
			const session = activeSession?.recordingSessions[0];
			if (!session) return;

			socket.emit("recording-started", buildRecordingStartedPayload(session));
		});

		socket.on("leave-room", (roomId: string) => {
			if (roomId) socket.leave(roomId);
		});

		/**
		 * The public share token is verified before the socket can subscribe. This
		 * prevents an arbitrary recording id from exposing a comment stream.
		 */
		socket.on(
			"join-recording-comments",
			async (shareToken: string, ack?: (joined: boolean) => void) => {
				if (!shareToken) {
					ack?.(false);
					return;
				}
				const sessionId = await getSessionIdByShareToken(shareToken).catch(
					(error) => {
						console.error("[Socket] shared comment lookup failed:", error);
						return null;
					},
				);
				if (!sessionId) {
					ack?.(false);
					return;
				}
				socket.join(recordingCommentsRoom(sessionId));
				ack?.(true);
			},
		);

		/**
		 * EVENT: recording-upload-progress
		 * A participant's upload progress after a recording stops. Relayed to the
		 * rest of the room so the host can watch everyone's tracks land.
		 */
		socket.on(
			"recording-upload-progress",
			(
				roomId: string,
				data: {
					identity: string;
					sessionId: string;
					progress: number;
					done: boolean;
				},
			) => {
				if (!socket.rooms.has(roomId)) return;
				socket.broadcast.to(roomId).emit("participant-upload-progress", data);
			},
		);
	});

	return io;
}
