/** Private structured measurements: distinguish CPU stalls, memory pressure and
 * database pool congestion before deciding which service/language to replace.
 * No document, user, connection-string or payment payload is logged.
 */
export declare function startRuntimeDiagnostics(): () => void;
