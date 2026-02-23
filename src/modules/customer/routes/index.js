import Router from "express";
import {getAllQuotations} from "../controllers/index.js"

const router = Router();

router.get("/get-all-estimates", getAllQuotations)

export default router;