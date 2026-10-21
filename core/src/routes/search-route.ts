import express from "express";
import { searchProjectsController } from "../controllers/search-controller.ts";
import { authMiddleware } from "../middlewares/auth-middleware.ts";

const router = express.Router();

router.get("/", authMiddleware, searchProjectsController);

export default router;
