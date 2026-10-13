import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
export const sectorsController = {
    async list(_req, res) {
        const sectors = await cache.getOrSet(CacheKeys.sectors(), 300_000, () => securitiesRepository.listSectors());
        res.json({ data: sectors });
    },
};
