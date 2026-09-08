// Toggle a user's Cognito 'admin' group membership.
//
// Admin status lives in Cognito, not DynamoDB (see design/auth-and-session.md) - there
// is no "local vs prod DB" distinction here, only which Cognito pool you're targeting
// (Downsman-dev vs Downsman-prod). Repeated runs alternate grant/revoke. Describes the
// change and requires typed confirmation before touching anything, the same bar
// scripts/resetDataYearEnd.sh holds itself to for a mutating operational script.
//
// Usage: node scripts/toggle-admin.js <dev|prod> <username>

const readline = require('readline');
const {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  UserNotFoundException,
} = require('@aws-sdk/client-cognito-identity-provider');

const REGION = 'eu-north-1';
const GROUP = 'admin';

const env = process.argv[2];
const username = process.argv[3];
if ((env !== 'dev' && env !== 'prod') || !username) {
  console.error('Usage: node scripts/toggle-admin.js <dev|prod> <username>');
  process.exit(1);
}

const POOL_NAME = `Downsman-${env}`;
const client = new CognitoIdentityProviderClient({ region: REGION });

// Same lookup-by-name pattern as scripts/create-cognito-pool.js, so this never needs
// a hardcoded pool id that could drift from what's actually deployed.
async function findPoolId() {
  let nextToken;
  do {
    const res = await client.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: nextToken }));
    const found = (res.UserPools || []).find(p => p.Name === POOL_NAME);
    if (found) return found.Id;
    nextToken = res.NextToken;
  } while (nextToken);
  throw new Error(`No Cognito user pool named "${POOL_NAME}" found in ${REGION}. Has it been provisioned? (node scripts/create-cognito-pool.js ${env})`);
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()); }));
}

async function main() {
  const userPoolId = await findPoolId();

  let isAdmin;
  try {
    const res = await client.send(new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: username }));
    isAdmin = (res.Groups || []).some(g => g.GroupName === GROUP);
  } catch (e) {
    if (e instanceof UserNotFoundException) {
      console.error(`User "${username}" not found in pool "${POOL_NAME}" (${userPoolId}).`);
      process.exit(1);
    }
    throw e;
  }

  const willGrant = !isAdmin;

  console.log('');
  console.log(willGrant ? `About to GRANT admin to "${username}"` : `About to REVOKE admin from "${username}"`);
  console.log(`  Environment:   ${env.toUpperCase()}${env === 'prod' ? '  <-- PRODUCTION' : ''}`);
  console.log(`  User pool:     ${POOL_NAME} (${userPoolId})`);
  console.log(`  Current state: ${isAdmin ? 'admin' : 'not admin'}`);
  console.log(`  New state:     ${willGrant ? 'admin' : 'not admin'}`);
  console.log('');

  const answer = await confirm('Type "yes" to proceed: ');
  if (answer !== 'yes') {
    console.log('Aborted - no changes made.');
    return;
  }

  if (willGrant) {
    await client.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: GROUP }));
    console.log(`Done: "${username}" is now an admin.`);
  } else {
    await client.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: GROUP }));
    console.log(`Done: "${username}" is no longer an admin.`);
  }
  console.log('They may need to log out and back in (or wait for the next silent token refresh) to see the change.');
}

main().catch(e => { console.error(e); process.exit(1); });
