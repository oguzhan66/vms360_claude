const { MongoClient } = require('mongodb');

let db;
let client;

async function connectDB() {
  const url = (process.env.MONGO_URL || 'mongodb://127.0.0.1:27017').replace('localhost', '127.0.0.1');
  const dbName = process.env.DB_NAME || 'vms360';
  client = new MongoClient(url);
  await client.connect();
  db = client.db(dbName);
  console.log(`MongoDB bağlantısı kuruldu: ${url}/${dbName}`);
  return db;
}

function getDB() {
  if (!db) throw new Error('Veritabanı bağlantısı yok');
  return db;
}

module.exports = { connectDB, getDB };
