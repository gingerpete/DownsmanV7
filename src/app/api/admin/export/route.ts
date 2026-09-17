import { NextRequest, NextResponse } from 'next/server';
import { getAllTeams, getScoutsByOwner, getSupportByOwner } from '@/services/db';
import { getSession } from '@/lib/authz';
import { getEmailBySub } from '@/services/cognito';
import { getEntranceFee } from '@/utils/validation';
import { HIKE_DATE } from '@/models/referenceData';
import { formatDob } from '@/utils/date';
import * as archiverNS from 'archiver';
import zipEncrypted from 'archiver-zip-encrypted';

// @types/archiver@8 only types the class-based API, not the create()/
// registerFormat() factory functions the underlying library (and this
// plugin) actually use at runtime - so this narrow cast is filling a types
// gap, not working around a real runtime issue.
const archiver = archiverNS as unknown as {
  create(format: string, options: unknown): archiverNS.Archiver;
  registerFormat(format: string, module: unknown): void;
};

// Registering twice (e.g. on a warm serverless instance reusing this module)
// throws - safe to ignore, it just means an earlier request already did it.
try {
  archiver.registerFormat('zip-encrypted', zipEncrypted);
} catch {
  // already registered
}

// 'zip20' is the older "ZipCrypto" method - not strong encryption, but it's
// what Windows' own built-in zip tool can open without installing anything
// extra, which matters more here than cryptographic strength: the goal is
// stopping a sensitive file being casually readable if it ends up in the
// wrong inbox, not defending against a determined attacker.
async function zipCsv(csv: string, entryName: string, password: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver.create('zip-encrypted', {
      zlib: { level: 8 },
      encryptionMethod: 'zip20',
      password,
    } as archiverNS.ArchiverOptions);
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.append(csv, { name: entryName });
    archive.finalize();
  });
}

// Read-only: builds a CSV from existing data. Never writes, updates, or
// deletes anything - safe to run at any time without risk to sign-up data.
function csvEscape(value: string | number | boolean | undefined): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function buildSummaryCsv(teams: Awaited<ReturnType<typeof getAllTeams>>) {
  const rows = await Promise.all(teams.map(async (team) => {
    const email = await getEmailBySub(team.ownerID).catch(() => undefined);
    const scouts = team.id ? await getScoutsByOwner(team.id).catch(() => []) : [];
    const fee = getEntranceFee(team.hikeClass, scouts);
    const owed = team.paymentRecieved ? 0 : Math.max(0, fee - (team.paymentAmount || 0));

    return [
      team.teamName, team.hikeClass, team.leaderName, email, team.activeMobile, team.backupMobile,
      team.groupName, team.district, team.county, fee, team.paymentAmount || 0,
      team.paymentRecieved ? 'Yes' : 'No', owed, team.teamSubmitted ? 'Yes' : 'No',
    ];
  }));

  const header = [
    'Team Name', 'Class', 'Leader Name', 'Account Email', 'Active Mobile', 'Backup Mobile',
    'Group', 'District', 'County', 'Entry Fee', 'Amount Paid', 'Paid In Full', 'Amount Owed', 'Submitted',
  ];
  return [header, ...rows];
}

// One row per person (scout or support crew), with team details repeated on
// each so the file is self-contained - e.g. for EDSFAT/checkpoint use on the
// day. Includes medical notes, which is sensitive personal data about
// children: this export should only ever be shared with people who
// genuinely need it for event safety, not circulated the way the payment
// summary export might be.
async function buildFullCsv(teams: Awaited<ReturnType<typeof getAllTeams>>) {
  const rows: (string | number | boolean | undefined)[][] = [];

  for (const team of teams) {
    const email = await getEmailBySub(team.ownerID).catch(() => undefined);
    const scouts = team.id ? await getScoutsByOwner(team.id).catch(() => []) : [];
    const support = team.id ? await getSupportByOwner(team.id).catch(() => []) : [];

    const teamCols = [
      team.teamName, team.hikeClass, team.groupName, team.district, team.county,
      team.activeMobile, team.backupMobile, email,
      team.emergencyContactName, team.emergencyContactMobile, team.emergencyContactLandline, team.emergencyContactEmail,
    ];

    if (scouts.length === 0 && support.length === 0) {
      rows.push([...teamCols, '', '', '', '', '', '', '', '']);
      continue;
    }
    for (const scout of scouts) {
      rows.push([
        ...teamCols,
        scout.leader ? 'Leader' : 'Scout', scout.fullName, formatDob(scout.dobEpoch, HIKE_DATE),
        scout.leader ? 'Yes' : 'No', scout.medicalNotes || '', '', '', '',
      ]);
    }
    for (const s of support) {
      rows.push([...teamCols, 'Support', s.fullName, '', '', '', s.phoneNumber, s.from, s.to]);
    }
  }

  const header = [
    'Team Name', 'Class', 'Group', 'District', 'County', 'Active Mobile', 'Backup Mobile', 'Account Email',
    'Emergency Contact Name', 'Emergency Contact Mobile', 'Emergency Contact Landline', 'Emergency Contact Email',
    'Person Type', 'Person Name', 'Date of Birth', 'Is Leader', 'Medical Notes',
    'Support Phone', 'Support Available From', 'Support Available To',
  ];
  return [header, ...rows];
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const full = req.nextUrl.searchParams.get('full') === 'true';
  const teams = await getAllTeams();
  const table = full ? await buildFullCsv(teams) : await buildSummaryCsv(teams);
  const csv = table.map(row => row.map(csvEscape).join(',')).join('\n');
  const name = full ? 'downsman-full-roster' : 'downsman-teams';
  const date = new Date().toISOString().slice(0, 10);

  const password = process.env.EXPORT_ZIP_PASSWORD;
  if (!password) {
    // Not configured yet - export still works, just unprotected, rather than
    // breaking entirely while EXPORT_ZIP_PASSWORD is being set up.
    console.error('EXPORT_ZIP_PASSWORD not set - exporting unprotected CSV');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}-${date}.csv"`,
      },
    });
  }

  const zip = await zipCsv(csv, `${name}-${date}.csv`, password);
  return new NextResponse(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name}-${date}.zip"`,
    },
  });
}
