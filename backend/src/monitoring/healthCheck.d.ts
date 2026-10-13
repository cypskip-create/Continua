export interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, {
        ok: boolean;
        detail?: string;
    }>;
    timestamp: string;
}
export declare function runHealthCheck(): Promise<HealthStatus>;
