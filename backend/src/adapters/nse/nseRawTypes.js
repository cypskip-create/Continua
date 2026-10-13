/**
 * Shapes as they'd arrive from an NSE data provider — deliberately NOT the
 * same field names as our standard schema. This is the whole point of the
 * adapter boundary: whatever a real licensed NSE feed's field names/casing/
 * quirks turn out to be, only nseMapper.ts needs to change to match them.
 * Nothing downstream of the adapter ever sees these shapes.
 */
export {};
