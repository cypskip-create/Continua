export function normalizeCorporateAction(action) {
    const details = action.details;
    if (details.type === "dividend" && details.amountPerShare < 0) {
        // Negative dividend amounts are always a mapping bug upstream, never real.
        throw new Error(`Invalid corporate action ${action.id}: negative dividend amount`);
    }
    return action;
}
