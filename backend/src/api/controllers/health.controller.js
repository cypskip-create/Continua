import { runHealthCheck } from "../../monitoring/healthCheck.js";
export const healthController = {
    async live(_req,res) {
        res.setHeader('Cache-Control','no-store');
        res.status(200).json({status:'alive',revision:process.env.RENDER_GIT_COMMIT??null,runtime:process.version,implementation:'javascript',timestamp:new Date().toISOString()});
    },
    async check(_req, res) {
        const health = await runHealthCheck();
        res.status(health.status === "unhealthy" ? 503 : 200).json(health);
    },
};
