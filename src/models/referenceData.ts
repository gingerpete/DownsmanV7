import { LocalDate } from '../utils/date';

export const HIKE_CLASSES = [
  'A-Class',
  'S-Class',
  'S-Class walk',
  'V-Class',
  'E-Class',
  'B-Class',
  'Open, Bignor - Washington',
  'Open, Bignor - Steyning',
  'Open, Plumpton - Itford',
  'Open, Plumpton - Firle',
  'Open, Itford - Eastbourne',
  'Open, Beaver Itford to Bo Peep',
] as const;

// The one class with a different entry fee - see ENTRY_COST / BEAVER_TEAM_FEE below.
export const BEAVER_CLASS = 'Open, Beaver Itford to Bo Peep';

// Sourced from an env var, not hardcoded, because this changes every season and a
// forgotten hardcoded date silently miscalculates every age-based validation rule
// below - see CODE_REVIEW_2026-08-13.md's H4. Read at module load so a missing/
// malformed value fails the build itself (page.tsx statically prerenders and pulls
// this in transitively) rather than validating a live registration season against
// the wrong date.
function parseHikeDate(raw: string | undefined): LocalDate {
  const match = raw && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(
      `NEXT_PUBLIC_DM_HIKE_DATE must be set to this season's hike date in YYYY-MM-DD ` +
      `format (got ${JSON.stringify(raw)}) - see .env.example.`
    );
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export const HIKE_DATE: LocalDate = parseHikeDate(process.env.NEXT_PUBLIC_DM_HIKE_DATE);
// Every entrant pays this, except Beaver teams which pay one flat BEAVER_TEAM_FEE
// per team regardless of team size - see getEntranceFee in utils/validation.ts.
export const ENTRY_COST = 16;
export const BEAVER_TEAM_FEE = 10;
