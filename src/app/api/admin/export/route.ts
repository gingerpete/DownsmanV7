import { NextRequest, NextResponse } from 'next/server';
import { getAllTeams, getScoutsByOwner } from '@/services/db';
import { getSession } from '@/lib/authz';
import { getEmailBySub } from '@/services/cognito';
import { getEntranceFee } from '@/utils/validation';

// Read-only: builds a CSV from existing data. Never writes, updates, or
// deletes anything - safe to run at any time without risk to sign-up data.
function csvEscape(value: string | number | boolean | undefined): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const teams = await getAllTeams();

  const rows = await Promise.all(teams.map(async (team) => {
    // Best-effort: a missing/failed lookup shouldn't break the whole export,
    // just leave that one row's email blank rather than failing the request.
    const email = await getEmailBySub(team.ownerID).catch(() => undefined);
    const scouts = team.id ? await getScoutsByOwner(team.id).catch(() => []) : [];
    const fee = getEntranceFee(team.hikeClass, scouts);
    const owed = team.paymentRecieved ? 0 : Math.max(0, fee - (team.paymentAmount || 0));

    return [
      team.teamName,
      team.hikeClass,
      team.leaderName,
      email,
      team.activeMobile,
      team.backupMobile,
      team.groupName,
      team.district,
      team.county,
      fee,
      team.paymentAmount || 0,
      team.paymentRecieved ? 'Yes' : 'No',
      owed,
      team.teamSubmitted ? 'Yes' : 'No',
    ];
  }));

  const header = [
    'Team Name', 'Class', 'Leader Name', 'Account Email', 'Active Mobile', 'Backup Mobile',
    'Group', 'District', 'County', 'Entry Fee', 'Amount Paid', 'Paid In Full', 'Amount Owed', 'Submitted',
  ];

  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="downsman-teams-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
