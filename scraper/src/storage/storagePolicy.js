/** Render is compute only: persistent evidence must be private R2. */
export function assertDurableStorage(environment, driver) {
    if (['true','1','yes'].includes(String(environment.R2_DUAL_WRITE ?? '').toLowerCase()) || driver === 'supabase') {
        throw new Error('Supabase file writes are disabled; use private R2 with R2_DUAL_WRITE=false');
    }
    const render = environment.RENDER === 'true' || Boolean(environment.RENDER_SERVICE_ID);
    if ((render || environment.NODE_ENV === 'production') && driver !== 'r2') {
        throw new Error('Production/Render evidence storage must use private R2; local storage is disabled');
    }
}
