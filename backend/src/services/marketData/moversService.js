import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
export const moversService = {
    async getTopMovers(exchange, limit = 10) {
        // Keep this consistent with live quote cards immediately after a tick.
        // The repository performs two indexed LIMIT queries, so a response
        // cache here costs more in visible staleness than it saves in DB work.
        return pricesRepository.getTopMovers(exchange, limit);
    },
};
