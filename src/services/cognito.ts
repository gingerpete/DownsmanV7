import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  UsernameExistsException,
  NotAuthorizedException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION || 'eu-west-2' });

// Read lazily rather than cached at module load - keeps this testable (env
// vars can be set per-test) and avoids freezing a value from before config
// was ready.
function userPoolId(): string {
  return process.env.COGNITO_USER_POOL_ID!;
}
function clientId(): string {
  return process.env.COGNITO_CLIENT_ID!;
}

export class AuthError extends Error {
  constructor(public code: 'InvalidCredentials' | 'UsernameTaken' | 'UserNotFound', message: string) {
    super(message);
  }
}

export interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export type LoginResult =
  | { kind: 'tokens'; tokens: Tokens }
  | { kind: 'newPasswordRequired'; session: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const res = await client.send(new AdminInitiateAuthCommand({
      UserPoolId: userPoolId(),
      ClientId: clientId(),
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }));

    if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return { kind: 'newPasswordRequired', session: res.Session! };
    }
    return { kind: 'tokens', tokens: tokensFromResult(res.AuthenticationResult) };
  } catch (e) {
    if (e instanceof NotAuthorizedException || e instanceof UserNotFoundException) {
      throw new AuthError('InvalidCredentials', 'Invalid username or password');
    }
    throw e;
  }
}

export async function respondToNewPassword(username: string, newPassword: string, session: string): Promise<Tokens> {
  const res = await client.send(new AdminRespondToAuthChallengeCommand({
    UserPoolId: userPoolId(),
    ClientId: clientId(),
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    Session: session,
    ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
  }));
  return tokensFromResult(res.AuthenticationResult);
}

export async function refresh(refreshToken: string): Promise<Tokens> {
  try {
    const res = await client.send(new AdminInitiateAuthCommand({
      UserPoolId: userPoolId(),
      ClientId: clientId(),
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }));
    return tokensFromResult(res.AuthenticationResult, refreshToken);
  } catch (e) {
    if (e instanceof NotAuthorizedException) {
      throw new AuthError('InvalidCredentials', 'Session expired');
    }
    throw e;
  }
}

export async function register(username: string, password: string, email?: string, mobile?: string): Promise<void> {
  const userAttributes = [
    ...(email ? [{ Name: 'email', Value: email }] : []),
    ...(mobile ? [{ Name: 'custom:mobile', Value: mobile }] : []),
  ];

  try {
    await client.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId(),
      Username: username,
      UserAttributes: userAttributes,
      TemporaryPassword: password,
      MessageAction: 'SUPPRESS',
    }));
  } catch (e) {
    if (e instanceof UsernameExistsException) {
      throw new AuthError('UsernameTaken', 'Username already taken');
    }
    throw e;
  }

  // Immediately promote to a permanent password so registration is usable right
  // away, matching the legacy register-then-login UX (no forced password change,
  // no email confirmation step).
  await client.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId(),
    Username: username,
    Password: password,
    Permanent: true,
  }));
}

export async function adminSetPassword(username: string, newPassword: string, permanent: boolean): Promise<void> {
  await client.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId(),
    Username: username,
    Password: newPassword,
    Permanent: permanent,
  }));
}

export async function adminDeleteUser(username: string): Promise<void> {
  try {
    await client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId(), Username: username }));
  } catch (e) {
    if (e instanceof UserNotFoundException) return;
    throw e;
  }
}

export async function setGroupMembership(username: string, group: string, member: boolean): Promise<void> {
  const Command = member ? AdminAddUserToGroupCommand : AdminRemoveUserFromGroupCommand;
  await client.send(new Command({ UserPoolId: userPoolId(), Username: username, GroupName: group }));
}

export async function isInGroup(username: string, group: string): Promise<boolean> {
  const res = await client.send(new AdminListGroupsForUserCommand({ UserPoolId: userPoolId(), Username: username }));
  return (res.Groups || []).some(g => g.GroupName === group);
}

export interface CognitoUserSummary {
  username: string;
  email?: string;
  mobile?: string;
  admin: boolean;
  breakLock: boolean;
}

// Cognito is the source of truth for who exists post-migration - the legacy
// User table stops being read anywhere in the live app after this point.
export async function listUsers(): Promise<CognitoUserSummary[]> {
  const [allUsernames, adminUsernames, breakLockUsernames] = await Promise.all([
    listAllPages((token) => client.send(new ListUsersCommand({ UserPoolId: userPoolId(), PaginationToken: token }))),
    listUsersInGroup('admin'),
    listUsersInGroup('breakLock'),
  ]);

  return allUsernames.map((u) => {
    const attrs = Object.fromEntries((u.Attributes || []).map(a => [a.Name, a.Value]));
    return {
      username: u.Username!,
      email: attrs.email,
      mobile: attrs['custom:mobile'],
      admin: adminUsernames.has(u.Username!),
      breakLock: breakLockUsernames.has(u.Username!),
    };
  });
}

async function listUsersInGroup(group: string): Promise<Set<string>> {
  const users = await listAllPages((token) =>
    client.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId(), GroupName: group, NextToken: token }))
  );
  return new Set(users.map(u => u.Username!));
}

async function listAllPages<T extends { Users?: unknown[] }>(
  fetchPage: (token?: string) => Promise<T & { PaginationToken?: string; NextToken?: string }>
): Promise<NonNullable<T['Users']>> {
  const items: unknown[] = [];
  let token: string | undefined;
  do {
    const res = await fetchPage(token);
    items.push(...(res.Users || []));
    token = res.PaginationToken || res.NextToken;
  } while (token);
  return items as NonNullable<T['Users']>;
}

// Used to find where to send a team-confirmation email: the session only
// carries the Cognito sub (see lib/authz.ts), not the account's email, so
// this looks it up via Cognito's Filter syntax rather than paging every user.
export async function getEmailBySub(sub: string): Promise<string | undefined> {
  const res = await client.send(new ListUsersCommand({
    UserPoolId: userPoolId(),
    Filter: `sub = "${sub}"`,
    Limit: 1,
  }));
  const attrs = Object.fromEntries((res.Users?.[0]?.Attributes || []).map(a => [a.Name, a.Value]));
  return attrs.email;
}

export async function forgotPassword(username: string): Promise<void> {
  await client.send(new ForgotPasswordCommand({ ClientId: clientId(), Username: username }));
}

export async function confirmForgotPassword(username: string, code: string, newPassword: string): Promise<void> {
  await client.send(new ConfirmForgotPasswordCommand({
    ClientId: clientId(),
    Username: username,
    ConfirmationCode: code,
    Password: newPassword,
  }));
}

function tokensFromResult(result: { IdToken?: string; AccessToken?: string; RefreshToken?: string; ExpiresIn?: number } | undefined, fallbackRefreshToken?: string): Tokens {
  if (!result?.IdToken || !result.AccessToken) {
    throw new Error('Cognito did not return tokens');
  }
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken || fallbackRefreshToken,
    expiresIn: result.ExpiresIn ?? 3600,
  };
}
