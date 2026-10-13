export declare function safeObjectKey(key: string): string;
export declare function readR2(key: string): Promise<Buffer<ArrayBuffer>>;
export declare function writeR2(key: string, body: Buffer, sha256: string, contentType: string | null): Promise<void>;
