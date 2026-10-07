// Row counts for the demo: opportunities per stage, touches per status, totals, latest opportunities.
import { printRows } from './rocketride.mjs';

const STAGE_COUNTS_SQL = `
SELECT s.stage, count(o.id)::int AS opportunities
FROM unnest(ARRAY['new', 'contacted', 'replied', 'meeting_booked', 'lost', 'no_response']) WITH ORDINALITY AS s (stage, ord)
LEFT JOIN opportunities o ON o.stage = s.stage
GROUP BY s.stage, s.ord
ORDER BY s.ord`;

const TOUCH_COUNTS_SQL = `
SELECT direction, status, count(*)::int AS touches
FROM touches
GROUP BY direction, status
ORDER BY direction DESC, status`;

const TOTALS_SQL = `
SELECT
    (SELECT count(*) FROM consultants)::int                                   AS consultants,
    (SELECT count(*) FROM consultants WHERE box_file_id LIKE 'seed-%')::int   AS seed_consultants,
    (SELECT count(*) FROM opportunities)::int                                 AS opportunities,
    (SELECT count(*) FROM opportunities WHERE do_not_contact)::int            AS do_not_contact,
    (SELECT count(*) FROM touches)::int                                       AS touches,
    (SELECT count(*) FROM meetings)::int                                      AS meetings`;

const LATEST_OPPORTUNITIES_SQL = `
SELECT o.id, o.company, o.role_title, o.stage, o.contact_name, c.full_name AS consultant, o.created_at
FROM opportunities o
LEFT JOIN consultants c ON c.id = o.consultant_id
ORDER BY o.id DESC
LIMIT 5`;

export async function fetchTotals(db) {
	return (await db.query(TOTALS_SQL)).rows[0];
}

export async function printStats(db) {
	console.log('\nTotals');
	printRows([await fetchTotals(db)]);
	console.log('Opportunities per stage');
	printRows((await db.query(STAGE_COUNTS_SQL)).rows);
	console.log('Touches per direction and status');
	printRows((await db.query(TOUCH_COUNTS_SQL)).rows);
	console.log('Latest opportunities');
	printRows((await db.query(LATEST_OPPORTUNITIES_SQL)).rows, 40);
}
