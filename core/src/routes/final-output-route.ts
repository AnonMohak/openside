import express from "express";
import {
	getDownloadUrlController,
	getFinalOutputsBySpaceIdController,
} from "../controllers/final-output-controller";
import { authMiddleware } from "../middlewares/auth-middleware";

const router = express.Router();

router.get(
	"/space/:spaceId",
	authMiddleware,
	getFinalOutputsBySpaceIdController,
);
router.get("/:outputId/download", authMiddleware, getDownloadUrlController);

export default router;
