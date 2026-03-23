import { Db, MongoClient } from 'mongodb';
import { env } from '../../config/env';

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

const getClient = async (): Promise<MongoClient> => {
  if (client) {
    return client;
  }

  if (!connectPromise) {
    const mongoClient = new MongoClient(env.mongo.uri);
    connectPromise = mongoClient.connect().then((connectedClient) => {
      client = connectedClient;
      return connectedClient;
    });
  }

  return connectPromise;
};

export const getMongoDb = async (): Promise<Db> => {
  const mongoClient = await getClient();
  return mongoClient.db(env.mongo.databaseName);
};
