import Router from "express";
import {sendOtp,verifyOtp} from "../controllers/index.js"
import {sendTestEmail,getEmailSettings,createOrUpdateEmailSettings} from "../controllers/email.controller.js"
import {sendOtpEmail,verifyEmailOtp, forgotPassword, resetPassword} from "../controllers/otp.controller.js"

const router = Router();

router.post("/send-otp",sendOtp)
router.post("/verify-otp",verifyOtp)
router.put("/email-setting",createOrUpdateEmailSettings)
router.get("/email-setting",getEmailSettings)

router.post("/test-email",sendTestEmail)
router.post("/email-otp/send",sendOtpEmail)
router.post("/email-otp/verify",verifyEmailOtp)

router.post("/reset-password", resetPassword)
router.post("/forgot-password", forgotPassword)

export default router;