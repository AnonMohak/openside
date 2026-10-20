import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth-middleware";
import { findOrCreateUser } from "../services/auth-service";
import {
	DOWNLOAD_FORMATS,
	type DownloadFormat,
	resolveDownloadUrl,
} from "../services/download-service";
import {
	getFinalOutputById,
	getFinalOutputsBySpaceId,
} from "../services/final-output-service";
import { isUserHost } from "../services/participant-service";
import { presignGet } from "../services/storage-service";
import { serializeBigInt } from "../utils/serialize";

// FinalOutput Controllers

/**
 * Resolve a presigned download URL for an output in the requested format.
 * WebM is immediate; mp4/mp3/wav transcode on demand (returns ready:false while
 * the first transcode runs - client polls). Host-only per PRD.
 */
export async function getDownloadUrlController(
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

		const outputId = req.params.outputId as string | undefined;
		const format =
			(req.query.format as string | undefined)?.toLowerCase() || "webm";

		if (!outputId) {
			res.status(400).json({
				success: false,
				data: null,
				message: "Output ID is required!",
			});
			return;
		}

		if (!DOWNLOAD_FORMATS.includes(format as DownloadFormat)) {
			res
				.status(400)
				.json({ success: false, data: null, message: "Unsupported format!" });
			return;
		}

		const output = await getFinalOutputById(outputId);
		if (!output) {
			res
				.status(404)
				.json({ success: false, data: null, message: "Output not found!" });
			return;
		}

		// Host-only download access.
		const user = await findOrCreateUser(req.user);
		if (output.space.hostId !== user.id) {
			res.status(403).json({
				success: false,
				data: null,
				message: "Only the host can download recordings!",
			});
			return;
		}

		if (output.status !== "READY" || !output.masterKey) {
			res.status(409).json({
				success: false,
				data: null,
				message: "Recording is still processing!",
			});
			return;
		}

		// inline → preview playback; otherwise force a download with a friendly name.
		const inline = req.query.disposition === "inline";
		const base =
			output.type === "COMPOSITE"
				? "cloud-mix"
				: output.hasVideo
					? "video-audio"
					: "audio";
		const downloadName = `openside-${base}-${output.id.slice(-6)}.${format}`;

		const result = await resolveDownloadUrl({
			masterKey: output.masterKey,
			hasVideo: output.hasVideo,
			hasAudio: output.hasAudio,
			// Real lossless WAV (from the PCM track) when present; wav/mp3 downloads
			// serve/encode from it instead of extracting from the WebM master.
			audioWavKey: output.audioWavKey,
			format: format as DownloadFormat,
			downloadName: inline ? undefined : downloadName,
		});

		if (result.error) {
			res
				.status(400)
				.json({ success: false, data: null, message: result.error });
			return;
		}

		res.status(result.ready ? 200 : 202).json({
			success: true,
			data: result,
			message: result.ready
				? "Download URL ready!"
				: "Preparing download, try again shortly!",
		});
	} catch (error: unknown) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		res.status(500).json({
			success: false,
			data: null,
			message: `Failed to get download URL: ${errorMessage}!`,
		});
	}
}

export async function getFinalOutputsBySpaceIdController(
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

		const spaceId = req.params.spaceId as string | undefined;

		if (!spaceId) {
			res
				.status(400)
				.json({ success: false, data: null, message: "Space ID is required!" });
			return;
		}

		const user = await findOrCreateUser(req.user);

		// Only host can see all outputs for a space
		const isHost = await isUserHost(spaceId, user.id);
		if (!isHost) {
			res.status(403).json({
				success: false,
				data: null,
				message: "Only the host can view all outputs for a space!",
			});
			return;
		}

		const outputs = await getFinalOutputsBySpaceId(spaceId);

		// Attach a presigned URL for each stored thumbnail so the client can render
		// it instantly (no per-thumbnail round trip). presignGet is local signing,
		// so mapping the whole list is cheap.
		const outputsWithThumbnails = await Promise.all(
			outputs.map(async (output) => ({
				...output,
				thumbnailUrl: output.thumbnailKey
					? await presignGet(output.thumbnailKey)
					: null,
			})),
		);

		res.status(200).json({
			success: true,
			data: {
				outputs: serializeBigInt(outputsWithThumbnails),
				count: outputs.length,
			},
			message: "Final outputs retrieved successfully!",
		});
	} catch (error: unknown) {
		if (error instanceof Error && error.message === "SPACE_NOT_FOUND") {
			res
				.status(404)
				.json({ success: false, data: null, message: "Space not found!" });
			return;
		}

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		res.status(500).json({
			success: false,
			data: null,
			message: `Failed to get final outputs: ${errorMessage}!`,
		});
	}
}
