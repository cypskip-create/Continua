export interface HealthStatus {
    status: "ok" | "degraded";
    database: "ok" | "unreachable";
    timestamp: string;
}
export declare function checkHealth(): Promise<HealthStatus>;
