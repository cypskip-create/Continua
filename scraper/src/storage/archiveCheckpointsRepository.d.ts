export declare function archiveCheckpoint(sourceId: string, url: string, year: number): Promise<{
    pages: number[];
    completed_pages: number[];
}>;
/** Call only AFTER the page's documents have been durably enqueued. */
export declare function completeArchivePage(sourceId: string, url: string, year: number, page: number, pages: number[]): Promise<void>;
