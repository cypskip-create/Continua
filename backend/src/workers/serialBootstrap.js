/** Cold-start enrichment must not occupy the entire shared API database pool.
 * Keep every task, preserve ordering and continue after independent failures.
 */
export async function serialBootstrap(tasks, onFailure) {
    for (const task of tasks) {
        try {
            await task.run();
        }
        catch (error) {
            onFailure(task.name, error);
        }
    }
}
