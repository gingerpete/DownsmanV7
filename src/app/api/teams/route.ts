import { NextRequest, NextResponse } from 'next/server';
import { getTeamsByOwner, saveTeam, deleteTeam, getAllTeams, getTeamById, getScoutsByOwner, getSupportByOwner } from '@/services/db';
import { getSession } from '@/lib/authz';
import { validateTeam } from '@/utils/validation';

export async function GET(req: NextRequest) {
  const session = getSession(req);
  const all = req.nextUrl.searchParams.get('all');

  if (all === 'true') {
    if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const teams = await getAllTeams();
    return NextResponse.json(teams);
  }

  const teams = await getTeamsByOwner(session.ownerId);
  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  const team = await req.json();

  // Fetch-and-verify, same pattern as DELETE below: an admin can edit any
  // existing team, but the edit must never silently transfer ownership to the
  // admin's own account - the original registrant has to stay the owner, or
  // the team would vanish from their own "my teams" list.
  const existing = team.id ? await getTeamById(team.id) : null;
  if (existing && existing.ownerID !== session.ownerId) {
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    team.ownerID = existing.ownerID;
  } else {
    // A malicious ownerID here can't touch another user's row: writes always
    // land in the caller's own partition, matching the Team table's key schema
    // ({ownerID, id}) - see DEPLOYMENT.md / scripts/create-tables.js.
    team.ownerID = session.ownerId;
  }

  // TeamDialog.tsx already runs this client-side before submitting, but the
  // client-side check is only a UX convenience - nothing stops a direct API call
  // from setting teamSubmitted:true unvalidated, so it's re-checked here too. See
  // CODE_REVIEW_2026-08-13.md's H1.
  if (team.teamSubmitted) {
    const [scouts, support] = await Promise.all([
      getScoutsByOwner(team.id ?? ''),
      getSupportByOwner(team.id ?? ''),
    ]);
    const errors = validateTeam(team, scouts, support);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }
  }

  const saved = await saveTeam(team);
  return NextResponse.json(saved);
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req);
  const { id } = await req.json();
  // Fetch-and-verify rather than trusting the client-supplied team, because
  // deleteTeam() cascades to that team's Scouts/Support by id regardless of
  // who's asking - the ownership check has to happen before that cascade runs.
  const existing = id ? await getTeamById(id) : null;
  if (!existing || (!session.isAdmin && existing.ownerID !== session.ownerId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await deleteTeam(existing);
  return NextResponse.json({ ok: true });
}
