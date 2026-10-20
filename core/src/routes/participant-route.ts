import express from "express";
import {
	joinSpaceController,
	kickParticipantController,
	renameSelfController,
	stopParticipantTrackController,
	updateRoleController,
} from "../controllers/participant-controller";
import {
	authMiddleware,
	optionalAuthMiddleware,
} from "../middlewares/auth-middleware";
import { sensitiveLimiter } from "../lib/rate-limit";

const router = express.Router();

router.post(
	"/:spaceId/join",
	sensitiveLimiter,
	optionalAuthMiddleware,
	joinSpaceController,
);
router.patch("/:spaceId/name", optionalAuthMiddleware, renameSelfController);
router.patch(
	"/:spaceId/participant/:participantId/role",
	authMiddleware,
	updateRoleController,
);
router.post(
	"/:spaceId/participant/:participantId/kick",
	authMiddleware,
	kickParticipantController,
);
router.post(
	"/:spaceId/participant/:participantId/stop-track",
	authMiddleware,
	stopParticipantTrackController,
);

export default router;
