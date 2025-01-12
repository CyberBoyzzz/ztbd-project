import { Pool } from 'pg';
import Redis from 'ioredis';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';

dotenv.config({ path: './.env' });

type Comic = {
  id?: number;
  title: string;
  author: string;
  publisher: string;
  year: number;
  genre: string;
  description: string;
};

// Konfiguracja połączenia PostgreSQL
const postgresPool = new Pool({
  host: process.env.DB_HOST_POSTGRES,
  port: Number(process.env.DB_PORT_POSTGRES),
  user: process.env.DB_USER_POSTGRES,
  password: process.env.DB_PASSWORD_POSTGRES,
  database: process.env.DB_NAME_POSTGRES,
});

// Konfiguracja połączenia Redis
const redisClient = new Redis({
  host: process.env.DB_HOST_REDIS,
  port: Number(process.env.DB_PORT_REDIS),
});

// Czyszczenie danych z baz
const clearDatabases = async () => {
  console.log('🧹 Clearing databases...');

  // Czyszczenie danych Postgres
  const client = await postgresPool.connect();
  try {
    await client.query('TRUNCATE TABLE comics RESTART IDENTITY CASCADE');
    console.log('✅ PostgreSQL - wyczyszczony.');
  } catch (error) {
    console.error('❌ Błąd podczas czyszczenia PostgreSQL:', error);
  } finally {
    client.release();
  }

  // Czyszczenie danych Redis
  try {
    await redisClient.flushall();
    console.log('✅ Redis - wyczyszczony.\n');
  } catch (error) {
    console.error('❌ Błąd podczas czyszczenia Redis:', error);
  }
};

const generateDataset = (size: number) => {
  const comics: Comic[] = [];
  for (let i = 0; i < size; i++) {
    comics.push({
      title: faker.lorem.words(3),
      author: faker.person.fullName(),
      publisher: faker.company.name(),
      year: faker.date.past({ years: 50 }).getFullYear(),
      genre: faker.lorem.word(),
      description: faker.lorem.sentence(),
    });
  }
  return comics;
};

// Operacje PostgreSQL
const performPostgresOperations = async (dataset: Comic[]) => {
  console.time('PostgreSQL - Create');
  for (const comic of dataset) {
    const { title, author, publisher, year, genre, description } = comic;

    const client = await postgresPool.connect();
    const result = await client.query(
      'INSERT INTO comics (title, author, publisher, year, genre, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [title, author, publisher, year, genre, description]
    );
    comic.id = result.rows[0].id;
    client.release();
  }
  console.timeEnd('PostgreSQL - Create');

  console.time('PostgreSQL - Read');
  for (const comic of dataset) {
    const client = await postgresPool.connect();
    await client.query('SELECT * FROM comics WHERE title = $1', [comic.title]);
    client.release();
  }
  console.timeEnd('PostgreSQL - Read');

  console.time('PostgreSQL - Update');
  for (const comic of dataset) {
    const newTitle = faker.lorem.words(2);

    const client = await postgresPool.connect();
    await client.query('UPDATE comics SET title = $1 WHERE title = $2', [newTitle, comic.title]);
    client.release();
  }
  console.timeEnd('PostgreSQL - Update');

  console.time('PostgreSQL - Delete');
  for (const comic of dataset) {
    const client = await postgresPool.connect();
    await client.query('DELETE FROM comics WHERE title = $1', [comic.title]);
    client.release();
  }
  console.timeEnd('PostgreSQL - Delete\n');
};

// Operacje Redis
const performRedisOperations = async (dataset: Comic[]) => {
  console.time('Redis - Create');
  for (const comic of dataset) {
    const { title, author, publisher, year, genre, description } = comic;

    const comicId = comic.id || faker.number.int();
    await redisClient.hmset(`comic:${comicId}`, {
      id: comicId.toString(),
      title,
      author,
      publisher,
      year: year.toString(),
      genre,
      description,
      created_at: new Date().toISOString(),
    });
    comic.id = comicId;
  }
  console.timeEnd('Redis - Create');

  console.time('Redis - Read');
  for (const comic of dataset) {
    await redisClient.hgetall(`comic:${comic.id}`);
  }
  console.timeEnd('Redis - Read');

  console.time('Redis - Update');
  for (const comic of dataset) {
    const newTitle = faker.lorem.words(2);
    await redisClient.hset(`comic:${comic.id}`, 'title', newTitle);
  }
  console.timeEnd('Redis - Update');

  console.time('Redis - Delete');
  for (const comic of dataset) {
    await redisClient.del(`comic:${comic.id}`);
  }
  console.timeEnd('Redis - Delete');
};

// Symulacja
const simulate = async () => {
  const datasetSizes = [1000, 10000, 100000];

  for (const size of datasetSizes) {
    console.log(`\n🔹 Uruchamianie symulacji dla rozmiaru danych: ${size}`);

    // Czyszczenie baz przed symulacją
    await clearDatabases();

    // Generowanie zbioru danych
    const dataset = generateDataset(size);

    // Operacje PostgreSQL
    console.log('▶️ Uruchamianie symulacji PostgreSQL...\n');
    await performPostgresOperations(dataset);

    // Operacje Redis
    console.log('▶️ Uruchamianie symulacji Redis...\n');
    await performRedisOperations(dataset);
  }
};

simulate()
  .then(() => {
    console.log('✅ Symulacje zakończone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Wystąpił błąd podczas przeprowadzania symulacji:', error);
    process.exit(1);
  });
