const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');

const env = process.argv[2];
if (env !== 'dev' && env !== 'prod') {
  console.error('Usage: node scripts/create-tables.js <dev|prod>');
  process.exit(1);
}

// dev uses the local Docker DynamoDB container from start-local.sh; prod uses
// real AWS DynamoDB in your configured account/region (via `aws configure`).
const client = env === 'dev'
  ? new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'eu-west-2' })
  : new DynamoDBClient({ region: 'eu-north-1' });

const tables = [
  {
    TableName: 'Team',
    KeySchema: [
      { AttributeName: 'ownerID', KeyType: 'HASH' },
      { AttributeName: 'id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'ownerID', AttributeType: 'S' },
      { AttributeName: 'id', AttributeType: 'S' },
    ],
  },
  {
    TableName: 'Scouts',
    KeySchema: [
      { AttributeName: 'ownerID', KeyType: 'HASH' },
      { AttributeName: 'id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'ownerID', AttributeType: 'S' },
      { AttributeName: 'id', AttributeType: 'S' },
    ],
  },
  {
    TableName: 'Support',
    KeySchema: [
      { AttributeName: 'ownerID', KeyType: 'HASH' },
      { AttributeName: 'id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'ownerID', AttributeType: 'S' },
      { AttributeName: 'id', AttributeType: 'S' },
    ],
  },
  {
    TableName: 'Log',
    KeySchema: [
      { AttributeName: 'ownerID', KeyType: 'HASH' },
      { AttributeName: 'id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'ownerID', AttributeType: 'S' },
      { AttributeName: 'id', AttributeType: 'S' },
    ],
  },
];

async function createTables() {
  for (const table of tables) {
    try {
      await client.send(new CreateTableCommand({
        ...table,
        BillingMode: 'PAY_PER_REQUEST',
      }));
      console.log(`Created: ${table.TableName}`);
    } catch (e) {
      if (e.name === 'ResourceInUseException') {
        console.log(`Already exists: ${table.TableName}`);
      } else {
        console.error(`Error creating ${table.TableName}:`, e.message);
      }
    }
  }
}

createTables();
