import { Pool } from 'pg';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config({ path: './.env' });

// Konfiguracja PostgreSQL
const postgresPool = new Pool({
  host: process.env.DB_HOST_POSTGRES,
  port: Number(process.env.DB_PORT_POSTGRES),
  user: process.env.DB_USER_POSTGRES,
  password: process.env.DB_PASSWORD_POSTGRES,
  database: process.env.DB_NAME_POSTGRES,
});

// Konfiguracja Redis
const redisClient = new Redis({
  host: process.env.DB_HOST_REDIS,
  port: Number(process.env.DB_PORT_REDIS),
});

// Funkcja dodająca komiks do bazy PostgreSQL
const addComicToPostgres = async (comicData: {
  title: string;
  author: string;
  publisher: string;
  year: number;
  genre: string;
  description: string;
}) => {
  const { title, author, publisher, year, genre, description } = comicData;

  try {
    const client = await postgresPool.connect();
    const result = await client.query(
      'INSERT INTO comics (title, author, publisher, year, genre, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [title, author, publisher, year, genre, description]
    );
    const comicId = result.rows[0].id;
    console.log(`✅ Dodano komiks do PostgreSQL! ID komiksu: ${comicId}`);
    client.release();
    return comicId;
  } catch (error) {
    console.error('❌ Błąd podczas dodawania komiksu do PostgreSQL:', error);
    throw error;
  }
};

// Funkcja dodająca komiks do Redis
const addComicToRedis = async (
  comicId: number,
  comicData: {
    title: string;
    author: string;
    publisher: string;
    year: number;
    genre: string;
    description: string;
  }
) => {
  const { title, author, publisher, year, genre, description } = comicData;

  try {
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
    console.log(`✅ Dodano komiks do Redis! ID komiksu: ${comicId}`);
  } catch (error) {
    console.error('❌ Błąd podczas dodawania komiksu do Redis:', error);
    throw error;
  }
};

// Funkcja do dodawania komiksu do PostgreSQL i Redis
const addComic = async (comicData: {
  title: string;
  author: string;
  publisher: string;
  year: number;
  genre: string;
  description: string;
}) => {
  try {
    // Dodanie komiksu do PostgreSQL
    const comicId = await addComicToPostgres(comicData);

    // Dodanie komiksu do Redis
    await addComicToRedis(comicId, comicData);

    console.log(
      `✅ Komiks został dodany do PostgreSQL i Redis. ID komiksu: ${comicId}`
    );
  } catch (error) {
    console.error('❌ Błąd podczas dodawania komiksu:', error);
  }
};

// Start serwisu
const startService = async () => {
  console.log('🚀 Uruchamianie serwisu...');

  console.log('🌟 Serwis uruchomiony!');

  const comicData = {
    title: 'Spider-Man: No Way Home',
    author: 'Stan Lee',
    publisher: 'Marvel Comics',
    year: 2021,
    genre: 'Action',
    description: 'A thrilling story of Spider-Man facing a multiverse crisis.',
  };

  addComic(comicData);
};

startService().catch((error) => {
  console.error('❌ Błąd podczas uruchamiania serwisu:', error);
});
