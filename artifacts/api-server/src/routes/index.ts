import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notificationsRouter from "./notifications";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notificationsRouter);
router.use(uploadRouter);

export default router;
