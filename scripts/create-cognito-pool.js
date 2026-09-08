const {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  CreateGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const env = process.argv[2];
if (env !== 'dev' && env !== 'prod') {
  console.error('Usage: node scripts/create-cognito-pool.js <dev|prod>');
  process.exit(1);
}

const REGION = 'eu-north-1';
const POOL_NAME = `Downsman-${env}`;
const CLIENT_NAME = `Downsman-${env}-client`;

const client = new CognitoIdentityProviderClient({ region: REGION });

async function findExistingPool() {
  let nextToken;
  do {
    const res = await client.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: nextToken }));
    const found = (res.UserPools || []).find(p => p.Name === POOL_NAME);
    if (found) return found;
    nextToken = res.NextToken;
  } while (nextToken);
  return null;
}

async function main() {
  const existing = await findExistingPool();
  if (existing) {
    console.log(`Pool "${POOL_NAME}" already exists: ${existing.Id}`);
    console.log('Re-run with a different name or delete it first if you need a fresh pool.');
    return;
  }

  const pool = await client.send(new CreateUserPoolCommand({
    PoolName: POOL_NAME,
    // Username-based sign-in (not email/phone alias) to match the existing app's login-by-username UX.
    AutoVerifiedAttributes: ['email'],
    Schema: [
      { Name: 'email', AttributeDataType: 'String', Required: false, Mutable: true },
      { Name: 'legacyId', AttributeDataType: 'String', Mutable: true, StringAttributeConstraints: { MaxLength: '40' } },
      { Name: 'groupsSynced', AttributeDataType: 'String', Mutable: true, StringAttributeConstraints: { MaxLength: '8' } },
      // Free-form, not the standard phone_number attribute - the legacy app never
      // validated phone format (e.g. "07500110338"), and phone_number enforces E.164.
      { Name: 'mobile', AttributeDataType: 'String', Mutable: true, StringAttributeConstraints: { MaxLength: '30' } },
    ],
    Policies: {
      PasswordPolicy: {
        MinimumLength: 6,
        RequireUppercase: false,
        RequireLowercase: false,
        RequireNumbers: true,
        RequireSymbols: false,
      },
    },
    MfaConfiguration: 'OFF',
    AccountRecoverySetting: {
      RecoveryMechanisms: [{ Priority: 1, Name: 'verified_email' }],
    },
  }));
  const userPoolId = pool.UserPool.Id;
  console.log(`Created user pool "${POOL_NAME}": ${userPoolId}`);

  const appClient = await client.send(new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: CLIENT_NAME,
    GenerateSecret: false,
    ExplicitAuthFlows: ['ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
  }));
  const clientId = appClient.UserPoolClient.ClientId;
  console.log(`Created app client "${CLIENT_NAME}": ${clientId}`);

  await client.send(new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: 'admin',
    Description: 'Users with elevated (admin panel) access',
  }));
  console.log('Created group: admin');

  await client.send(new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: 'breakLock',
    Description: 'Users exempt from the global entries-closed lock',
  }));
  console.log('Created group: breakLock');

  console.log('\n--- Env vars for this pool ---');
  console.log(`COGNITO_USER_POOL_ID=${userPoolId}`);
  console.log(`COGNITO_CLIENT_ID=${clientId}`);
  console.log(`COGNITO_REGION=${REGION}`);
}

main().catch(e => { console.error(e); process.exit(1); });
