import Router from "express";
import { getAllQuotations, customerOtpLogin } from "../controllers/index.js"

const router = Router();

router.get("/get-all-estimates", getAllQuotations);

// Customer OTP login — returns JWT
router.post("/otp-login", customerOtpLogin);

export default router;