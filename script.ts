import { Pool } from 'pg';
import Redis from 'ioredis';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartType } from 'chart.js';
import * as fs from 'fs';

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
  console.log('🧹 Czyszczenie danych...');
  const client = await postgresPool.connect();
  try {
    await client.query('TRUNCATE TABLE comics RESTART IDENTITY CASCADE');
    console.log('✅ PostgreSQL - wyczyszczony.');
  } catch (error) {
    console.error('❌ Błąd podczas czyszczenia PostgreSQL:', error);
  } finally {
    client.release();
  }

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

// Mierzenie czasu operacji PostgreSQL
const performPostgresOperations = async (dataset: Comic[]): Promise<number[]> => {
  const times: number[] = [];
  
  console.time('PostgreSQL - Create');
  const startCreate = Date.now();
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
  times.push(Date.now() - startCreate);
  console.timeEnd('PostgreSQL - Create');

  console.time('PostgreSQL - Read');
  const startRead = Date.now();
  for (const comic of dataset) {
    const client = await postgresPool.connect();
    await client.query('SELECT * FROM comics WHERE title = $1', [comic.title]);
    client.release();
  }
  times.push(Date.now() - startRead);
  console.timeEnd('PostgreSQL - Read');

  console.time('PostgreSQL - Update');
  const startUpdate = Date.now();
  for (const comic of dataset) {
    const newTitle = faker.lorem.words(2);
    const client = await postgresPool.connect();
    await client.query('UPDATE comics SET title = $1 WHERE title = $2', [newTitle, comic.title]);
    client.release();
  }
  times.push(Date.now() - startUpdate);
  console.timeEnd('PostgreSQL - Update');

  console.time('PostgreSQL - Delete');
  const startDelete = Date.now();
  for (const comic of dataset) {
    const client = await postgresPool.connect();
    await client.query('DELETE FROM comics WHERE title = $1', [comic.title]);
    client.release();
  }
  times.push(Date.now() - startDelete);
  console.timeEnd('PostgreSQL - Delete');

  return times;
};

// Mierzenie czasu operacji Redis
const performRedisOperations = async (dataset: Comic[]): Promise<number[]> => {
  const times: number[] = [];
  
  console.time('Redis - Create');
  const startCreate = Date.now();
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
  times.push(Date.now() - startCreate);
  console.timeEnd('Redis - Create');

  console.time('Redis - Read');
  const startRead = Date.now();
  for (const comic of dataset) {
    await redisClient.hgetall(`comic:${comic.id}`);
  }
  times.push(Date.now() - startRead);
  console.timeEnd('Redis - Read');

  console.time('Redis - Update');
  const startUpdate = Date.now();
  for (const comic of dataset) {
    const newTitle = faker.lorem.words(2);
    await redisClient.hset(`comic:${comic.id}`, 'title', newTitle);
  }
  times.push(Date.now() - startUpdate);
  console.timeEnd('Redis - Update');

  console.time('Redis - Delete');
  const startDelete = Date.now();
  for (const comic of dataset) {
    await redisClient.del(`comic:${comic.id}`);
  }
  times.push(Date.now() - startDelete);
  console.timeEnd('Redis - Delete');

  return times;
};

// Generowanie wykresu
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600 });

const createChart = async (labels: string[], pgTimes: number[], redisTimes: number[], size: number) => {
  const configuration: { 
    type: ChartType,
    data: { 
      labels: string[], 
      datasets: { label: string; data: number[]; backgroundColor: string }[] 
    }, 
    options: { 
      responsive: boolean; 
      plugins: { 
        title: { 
          display: boolean; 
          text: string; 
        }; 
      }; 
    } 
  } = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'PostgreSQL',
          data: pgTimes,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
        },
        {
          label: 'Redis',
          data: redisTimes,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Porównanie czasów operacji CRUD dla ${size} rekordów`,
        },
      },
    },
  };

  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  const outputPath = `charts/crud_times_${size}.png`;
  fs.writeFileSync(outputPath, image);
  console.log(`✅ Wykres zapisany: ${outputPath}`);
};

// Symulacja
const simulate = async () => {
  const datasetSizes = [100, 1000, 10000];
  fs.mkdirSync('charts', { recursive: true });

  for (const size of datasetSizes) {
    console.log(`\n🔹 Symulacja dla ${size} rekordów...`);

    await clearDatabases();
    const dataset = generateDataset(size);

    console.log('▶️ PostgreSQL...');
    const pgTimes = await performPostgresOperations(dataset);

    console.log('▶️ Redis...');
    const redisTimes = await performRedisOperations(dataset);

    const labels = ['Create', 'Read', 'Update', 'Delete'];
    await createChart(labels, pgTimes, redisTimes, size);
  }
};

simulate()
  .then(() => {
    console.log('✅ Symulacje zakończone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Wystąpił błąd:', error);
    process.exit(1);
  });
