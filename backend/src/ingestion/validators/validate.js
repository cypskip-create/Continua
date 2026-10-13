/** Validates an array of records against a schema, splitting into valid vs.
 *  rejected instead of throwing — one bad record from a feed should never
 *  take down an entire ingestion batch. */
export function validateBatch(schema, records) {
    const valid = [];
    const rejected = [];
    for (const record of records) {
        const result = schema.safeParse(record);
        if (result.success) {
            valid.push(result.data);
        }
        else {
            rejected.push({
                record,
                issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            });
        }
    }
    return { valid, rejected };
}
export function validateOne(schema, record) {
    const result = schema.safeParse(record);
    if (result.success)
        return { data: result.data };
    return { issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
}
