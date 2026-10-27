import { prisma } from "../db/index.ts";
import {
	deleteObjects,
	deletePrefixTargets,
	resolvePrefixTarget,
	trackChunkPrefix,
} from "./storage-service.ts";

/**
 * Delete a finished track's raw chunk objects - plus anything uploaded but
 * never registered (a chunk whose register call never landed; the track's
 * folder holds only chunks) - and mark its segments PROCESSED, which also
 * tells a later straggler not to re-stitch the track. Throws if the chunk
 * objects can't be deleted, so the caller can retry.
 */
export async function deleteTrackChunks(recording: {
	id: string;
	segments: { id: string; assetKey: string }[];
}): Promise<void> {
	await deleteObjects(recording.segments.map((seg) => seg.assetKey));
	const firstKey = recording.segments[0]?.assetKey;
	const prefix = firstKey ? trackChunkPrefix(firstKey, recording.id) : null;
	if (prefix) {
		await resolvePrefixTarget(prefix)
			.then((target) => deletePrefixTargets([target]))
			.catch((error) =>
				console.error(
					`[Recording] orphan chunk sweep failed for ${recording.id}:`,
					error,
				),
			);
	}
	await prisma.recordingSegment.updateMany({
		where: { id: { in: recording.segments.map((seg) => seg.id) } },
		data: { status: "PROCESSED" },
	});
}
