import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { TeamModel, ScoutModel, SupportModel, LogModel } from '../models/types';

const isDev = process.env.DM_DEV !== 'false';

const client = new DynamoDBClient(
  isDev
    ? { endpoint: 'http://localhost:8000', region: 'eu-west-2' }
    : { region: 'eu-north-1' }
);

const db = DynamoDBDocumentClient.from(client);

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function getTeamsByOwner(ownerID: string): Promise<TeamModel[]> {
  const res = await db.send(new QueryCommand({
    TableName: 'Team',
    KeyConditionExpression: 'ownerID = :o',
    ExpressionAttributeValues: { ':o': ownerID },
  }));
  return (res.Items || []) as TeamModel[];
}

export async function getAllTeams(): Promise<TeamModel[]> {
  const res = await db.send(new ScanCommand({ TableName: 'Team' }));
  return (res.Items || []) as TeamModel[];
}

export async function getTeamById(id: string): Promise<TeamModel | null> {
  const res = await db.send(new ScanCommand({
    TableName: 'Team',
    FilterExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': id },
  }));
  return (res.Items?.[0] as TeamModel) || null;
}

export async function saveTeam(team: TeamModel): Promise<TeamModel> {
  if (!team.id) team.id = uuid();
  await db.send(new PutCommand({ TableName: 'Team', Item: team }));
  return team;
}

export async function deleteTeam(team: TeamModel): Promise<void> {
  // Delete associated scouts and support
  const scouts = await getScoutsByOwner(team.id!);
  for (const s of scouts) await deleteScout(s.ownerID, s.id!);
  const support = await getSupportByOwner(team.id!);
  for (const s of support) await deleteSupport(s.ownerID, s.id!);
  await db.send(new DeleteCommand({ TableName: 'Team', Key: { ownerID: team.ownerID, id: team.id } }));
}

// ─── Scouts ──────────────────────────────────────────────────────────────────

export async function getScoutsByOwner(ownerID: string): Promise<ScoutModel[]> {
  const res = await db.send(new QueryCommand({
    TableName: 'Scouts',
    KeyConditionExpression: 'ownerID = :o',
    ExpressionAttributeValues: { ':o': ownerID },
  }));
  return (res.Items || []) as ScoutModel[];
}

export async function saveScout(scout: ScoutModel): Promise<ScoutModel> {
  if (!scout.id) scout.id = uuid();
  await db.send(new PutCommand({ TableName: 'Scouts', Item: scout }));
  return scout;
}

export async function deleteScout(ownerID: string, id: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: 'Scouts', Key: { ownerID, id } }));
}

// ─── Support ─────────────────────────────────────────────────────────────────

export async function getSupportByOwner(ownerID: string): Promise<SupportModel[]> {
  const res = await db.send(new QueryCommand({
    TableName: 'Support',
    KeyConditionExpression: 'ownerID = :o',
    ExpressionAttributeValues: { ':o': ownerID },
  }));
  return (res.Items || []) as SupportModel[];
}

export async function saveSupport(support: SupportModel): Promise<SupportModel> {
  if (!support.id) support.id = uuid();
  await db.send(new PutCommand({ TableName: 'Support', Item: support }));
  return support;
}

export async function deleteSupport(ownerID: string, id: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: 'Support', Key: { ownerID, id } }));
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export async function logEvent(who: string, what: string): Promise<void> {
  const log: LogModel = { id: uuid(), who, when: new Date().toISOString(), what };
  await db.send(new PutCommand({ TableName: 'Log', Item: { ownerID: 'log', ...log } }));
}
