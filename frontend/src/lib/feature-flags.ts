/**
 * Build-time feature switches.
 *
 * A flag here hides a feature from the UI **only**. Nothing is deleted: the pages, API clients,
 * routes and the entire backend stay in place and keep working, so flipping a flag back to `true` is
 * the whole of the work needed to ship it.
 */

/**
 * Class Tests — live.
 *
 * Set back to `false` to hide the feature behind a placeholder again. The flag alone controls:
 *   - the student list, attempt flow and result pages
 *   - the faculty list, create and detail pages
 *   - the unattempted-test count badge in the navbar
 *
 * The `/api/class-tests` routes are deliberately left mounted and unchanged — the backend has full
 * test coverage for them and disabling it server-side would only mean reverting more later.
 */
export const CLASS_TESTS_ENABLED = true;

/**
 * Labs (DSA Lab, DBMS Lab) — live.
 *
 * Set back to `false` to hide the student and faculty lab pages and the navbar link behind a
 * placeholder. The `/api/labs` routes stay mounted regardless; the DBMS SQL sandbox itself is a
 * separate, backend-only switch (`SQL_SANDBOX_ENABLED`).
 */
export const LABS_ENABLED = true;
