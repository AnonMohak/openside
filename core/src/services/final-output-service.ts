import { prisma } from "../db/index.ts";

// FinalOutput Operations

export async function getFinalOutputById(outputId: string) {
	const output = await prisma.finalOutput.findUnique({
		where: { id: outputId },
		include: {
			recordingSession: {
				select: {
					id: true,
					spaceRecordingSessionId: true,
					status: true,
					startedAt: true,
					stoppedAt: true,
				},
			},
			space: {
				select: {
					id: true,
					title: true,
					hostId: true,
				},
			},
			sourceRecording: {
				select: {
					id: true,
					type: true,
					isScreenShare: true,
					participantId: true,
				},
			},
		},
	});

	return output;
}

export async function getFinalOutputsBySpaceId(spaceId: string) {
	// Verify space exists
	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		select: { id: true },
	});

	if (!space) {
		throw new Error("SPACE_NOT_FOUND");
	}

	const outputs = await prisma.finalOutput.findMany({
		where: { spaceId },
		include: {
			recordingSession: {
				select: {
					id: true,
					title: true,
					spaceRecordingSessionId: true,
					startedAt: true,
					stoppedAt: true,
				},
			},
			sourceRecording: {
				select: {
					id: true,
					type: true,
					isScreenShare: true,
					participant: {
						select: {
							id: true,
							displayName: true,
							role: true,
							user: { select: { name: true, avatar: true } },
						},
					},
				},
			},
		},
		orderBy: { createdAt: "desc" },
	});

	return outputs;
}
