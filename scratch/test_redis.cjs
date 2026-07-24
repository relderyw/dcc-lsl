const IORedis = require('ioredis');

async function test() {
  const url = 'redis://default:yzTFukQ4ODJ3rMoNY3UlPkKzEpNYhp@redis-14290.crce196.sa-east-1-2.ec2.cloud.redislabs.com:14290';
  console.log('Connecting to Redis...');
  const client = new IORedis(url);
  try {
    const res = await client.ping();
    console.log('Ping result:', res);
  } catch (err) {
    console.error('Connection error:', err);
  } finally {
    client.disconnect();
  }
}

test();
