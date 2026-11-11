import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const app = express();
app.use(cors());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'quiz_db',
  charset: 'utf8mb4',
});

app.get('/api/questions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM questions ORDER BY RAND() LIMIT 5');
    res.json(rows.map(r => ({
      id: r.id,
      text: r.question,
      options: [r.option_a, r.option_b, r.option_c, r.option_d],
      correct: r.correct_index,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, '0.0.0.0', () => console.log('API: http://localhost:' + port));