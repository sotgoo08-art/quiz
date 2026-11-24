import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import nodePath from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
});

const LETTERS = ['A', 'B', 'C', 'D'];
const GROUP_REGEX = /^M\.SW[A-Z0-9_-]+$/;

function normalizeGroupCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function normalizeOption(val) {
  const s = String(val ?? '').trim().toUpperCase();
  if (LETTERS.includes(s)) return s;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return LETTERS[n];
  if (Number.isInteger(n) && n >= 1 && n <= 4) return LETTERS[n - 1];
  return null;
}

function indexToOption(idx) {
  const n = Number(idx);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? LETTERS[n] : null;
}

function optionToIndex(opt) {
  const idx = LETTERS.indexOf(String(opt || '').toUpperCase());
  return idx >= 0 ? idx : 0;
}

function hashPin(pin) {
  if (!pin) return null;
  const salt = crypto.randomBytes(8).toString('hex');
  const derived = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPin(pin, stored) {
  if (!stored) return true;
  if (!pin) return false;
  const parts = String(stored).split(':');
  if (parts.length !== 2) return stored === String(pin);
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const testBuf = crypto.scryptSync(String(pin), salt, 32);
  return keyBuf.length === testBuf.length && crypto.timingSafeEqual(keyBuf, testBuf);
}

// Багшийн нэвтрэлт (нууц үггүй)
app.post('/api/auth/teacher', (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  if (!fullName) {
    return res.status(400).json({ error: 'Багшийн нэрийг оруулна уу.' });
  }
  res.json({ ok: true, role: 'teacher', fullName });
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected', service: 'mubis-quiz' });
  } catch (err) {
    res.status(200).json({ ok: true, db: 'disconnected', error: err.message, service: 'mubis-quiz' });
  }
});

// Оюутанд зориулсан идэвхтэй асуултууд (зөв хариултыг илгээхгүй)
app.get('/api/questions', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d
       FROM quiz_questions
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );
    const formatted = rows.map((r) => ({
      id: r.id,
      text: r.question_text,
      q: r.question_text,
      options: [r.option_a, r.option_b, r.option_c, r.option_d],
    }));
    res.json(formatted);
  } catch (err) {
    console.error('GET /api/questions error:', err);
    res.status(500).json({ error: 'Асуулт уншихад алдаа гарлаа' });
  }
});

// Багшид зориулсан бүх асуултын жагсаалт
app.get('/api/admin/questions', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, sort_order, is_active
       FROM quiz_questions
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ questions: rows });
  } catch (err) {
    console.error('GET /api/admin/questions error:', err);
    res.status(500).json({ error: 'Асуултын жагсаалт татахад алдаа гарлаа' });
  }
});

// Багш: Гараар эсвэл олон асуултыг нэг дор нэмэх
app.post('/api/admin/questions/bulk', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const items = Array.isArray(req.body.questions) ? req.body.questions : [];
    const replaceExisting = Boolean(req.body.replaceExisting);

    if (items.length === 0) {
      return res.status(400).json({ error: 'Оруулах асуулт олдсонгүй.' });
    }

    const validated = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const questionText = String(it.question_text ?? it.question ?? it.q ?? it.text ?? '').trim();
      const optionA = String(it.option_a ?? it.a ?? it.options?.[0] ?? '').trim();
      const optionB = String(it.option_b ?? it.b ?? it.options?.[1] ?? '').trim();
      const optionC = String(it.option_c ?? it.c ?? it.options?.[2] ?? '').trim();
      const optionD = String(it.option_d ?? it.d ?? it.options?.[3] ?? '').trim();
      const correctOption = normalizeOption(it.correct_option ?? it.correct ?? it.answer ?? 'A');

      if (!questionText || !optionA || !optionB || !optionC || !optionD) {
        return res.status(400).json({
          error: `${i + 1}-р асуултын текст эсвэл A, B, C, D сонголт дутуу байна.`,
        });
      }
      if (!correctOption) {
        return res.status(400).json({
          error: `${i + 1}-р асуултын зөв хариулт A, B, C, D байх ёстой.`,
        });
      }
      validated.push({ questionText, optionA, optionB, optionC, optionD, correctOption });
    }

    await conn.beginTransaction();

    if (replaceExisting) {
      await conn.query('DELETE FROM quiz_questions');
    }

    const [[{ maxOrder }]] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM quiz_questions'
    );
    let orderCounter = Number(maxOrder || 0);

    for (const v of validated) {
      orderCounter += 10;
      await conn.query(
        `INSERT INTO quiz_questions
          (question_text, option_a, option_b, option_c, option_d, correct_option, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [v.questionText, v.optionA, v.optionB, v.optionC, v.optionD, v.correctOption, orderCounter]
      );
    }

    await conn.commit();
    res.json({ ok: true, insertedCount: validated.length });
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/admin/questions/bulk error:', err);
    res.status(500).json({ error: 'Асуулт хадгалахад алдаа гарлаа' });
  } finally {
    conn.release();
  }
});

// Багш: SQL скриптээр бэлэн тест оруулах (зөвхөн SELECT / INSERT / UPDATE / DELETE зөвшөөрнө)
app.post('/api/admin/questions/sql', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const rawSql = String(req.body.sql || '').trim();
    if (!rawSql) {
      return res.status(400).json({ error: 'SQL команд оруулна уу.' });
    }

    const statements = rawSql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.replace(/--.*$/gm, '').trim().length === false);

    const cleanStatements = rawSql
      .split(';')
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter(Boolean);

    if (cleanStatements.length === 0) {
      return res.status(400).json({ error: 'Ажиллах SQL илэрхийлэл олдсонгүй.' });
    }

    const allowedPrefix = /^(INSERT\s+INTO\s+`?quiz_questions`?|UPDATE\s+`?quiz_questions`?|DELETE\s+FROM\s+`?quiz_questions`?|SELECT\s+)/i;
    for (const stmt of cleanStatements) {
      if (!allowedPrefix.test(stmt)) {
        return res.status(400).json({
          error: 'Аюулгүй байдлын үүднээс зөвхөн quiz_questions хүснэгт дээрх INSERT / UPDATE / DELETE / SELECT командыг ажиллуулна.',
        });
      }
    }

    await conn.beginTransaction();
    let affectedTotal = 0;
    for (const stmt of cleanStatements) {
      const [result] = await conn.query(stmt);
      if (typeof result?.affectedRows === 'number') {
        affectedTotal += result.affectedRows;
      }
    }
    await conn.commit();

    res.json({
      ok: true,
      executedStatements: cleanStatements.length,
      affectedRows: affectedTotal,
    });
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/admin/questions/sql error:', err);
    res.status(400).json({ error: `SQL алдаа: ${err.message}` });
  } finally {
    conn.release();
  }
});

// Багш: Нэг асуулт устгах
app.delete('/api/admin/questions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Буруу ID' });
    await pool.query('DELETE FROM quiz_questions WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/questions/:id error:', err);
    res.status(500).json({ error: 'Асуулт устгахад алдаа гарлаа' });
  }
});

// Оюутан нэвтрэх + Ирц + Сесс + Оролдлого эхлүүлэх
app.post('/api/quiz/start', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const fullName = String(req.body.fullName || '').trim();
    const className = normalizeGroupCode(req.body.className);
    const rawUsername = String(req.body.username || '').trim();
    const pin = req.body.pin ? String(req.body.pin).trim() : '';

    if (!fullName) {
      return res.status(400).json({ error: 'Оюутны овог нэрийг оруулна уу.' });
    }
    if (!GROUP_REGEX.test(className)) {
      return res.status(400).json({ error: 'Бүлгийн код заавал M.SW...-ээр эхлэх ёстой (жишээ: M.SW206).' });
    }

    const username =
      rawUsername ||
      `stu_${crypto.createHash('md5').update(`${fullName}_${className}`).digest('hex').slice(0, 10)}`;

    await conn.beginTransaction();

    let studentId;
    const [existing] = await conn.query(
      'SELECT id, full_name, class_name, pin_hash FROM quiz_students WHERE username = ? LIMIT 1',
      [username]
    );

    if (existing.length > 0) {
      const stu = existing[0];
      if (!verifyPin(pin, stu.pin_hash)) {
        await conn.rollback();
        return res.status(401).json({ error: 'PIN код таарахгүй байна.' });
      }
      studentId = stu.id;
      await conn.query(
        `UPDATE quiz_students
         SET full_name = ?,
             class_name = ?
         WHERE id = ?`,
        [fullName, className, studentId]
      );
    } else {
      const [insStu] = await conn.query(
        `INSERT INTO quiz_students (full_name, class_name, username, pin_hash)
         VALUES (?, ?, ?, ?)`,
        [fullName, className, username, pin ? hashPin(pin) : null]
      );
      studentId = insStu.insertId;
    }

    const deviceInfo = String(req.headers['user-agent'] || 'Web').slice(0, 190);
    await conn.query(
      `INSERT INTO quiz_attendance (student_id, attendance_date, status, check_in_at, note)
       VALUES (?, CURDATE(), 'present', NOW(), ?)
       ON DUPLICATE KEY UPDATE
         status = IF(status = 'absent', 'present', status),
         check_in_at = COALESCE(check_in_at, NOW()),
         note = VALUES(note)`,
      [studentId, `3D Quiz (${deviceInfo.slice(0, 80)})`]
    );

    const [insSess] = await conn.query(
      `INSERT INTO quiz_sessions (student_id, login_at, last_seen_at, device)
       VALUES (?, NOW(), NOW(), ?)`,
      [studentId, deviceInfo]
    );
    const sessionId = insSess.insertId;

    const [[{ cnt }]] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM quiz_questions WHERE is_active = 1'
    );

    const [insAtt] = await conn.query(
      `INSERT INTO quiz_attempts (student_id, session_id, started_at, total_questions, score)
       VALUES (?, ?, NOW(), ?, 0)`,
      [studentId, sessionId, Number(cnt || 0)]
    );
    const attemptId = insAtt.insertId;

    await conn.commit();

    res.json({
      studentId,
      sessionId,
      attemptId,
      student: { id: studentId, fullName, className, username },
      totalQuestions: Number(cnt || 0),
    });
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/quiz/start error:', err);
    res.status(500).json({ error: 'Шалгалт эхлүүлэхэд алдаа гарлаа' });
  } finally {
    conn.release();
  }
});

// Хариулт шалгаж хадгалах
app.post('/api/quiz/answer', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const attemptId = Number(req.body.attemptId);
    const questionId = Number(req.body.questionId);
    const chosenOption =
      req.body.chosenOption && LETTERS.includes(String(req.body.chosenOption).toUpperCase())
        ? String(req.body.chosenOption).toUpperCase()
        : indexToOption(req.body.optionIndex);

    if (!attemptId || !questionId || !chosenOption) {
      return res.status(400).json({ error: 'attemptId, questionId, сонголт шаардлагатай.' });
    }

    await conn.beginTransaction();

    const [[qRow]] = await conn.query(
      'SELECT id, correct_option FROM quiz_questions WHERE id = ? LIMIT 1',
      [questionId]
    );
    if (!qRow) {
      await conn.rollback();
      return res.status(404).json({ error: 'Асуулт олдсонгүй.' });
    }

    const [[attRow]] = await conn.query(
      'SELECT id, session_id FROM quiz_attempts WHERE id = ? LIMIT 1',
      [attemptId]
    );
    if (!attRow) {
      await conn.rollback();
      return res.status(404).json({ error: 'Оролдлого олдсонгүй.' });
    }

    const isCorrect = qRow.correct_option === chosenOption ? 1 : 0;

    await conn.query(
      `INSERT INTO quiz_answers (attempt_id, question_id, chosen_option, is_correct, answered_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         chosen_option = VALUES(chosen_option),
         is_correct = VALUES(is_correct),
         answered_at = NOW()`,
      [attemptId, questionId, chosenOption, isCorrect]
    );

    const [[{ sumScore }]] = await conn.query(
      'SELECT COALESCE(SUM(is_correct), 0) AS sumScore FROM quiz_answers WHERE attempt_id = ?',
      [attemptId]
    );

    await conn.query(
      'UPDATE quiz_attempts SET score = ? WHERE id = ?',
      [Number(sumScore), attemptId]
    );

    if (attRow.session_id) {
      await conn.query(
        'UPDATE quiz_sessions SET last_seen_at = NOW() WHERE id = ?',
        [attRow.session_id]
      );
    }

    await conn.commit();

    res.json({
      ok: isCorrect === 1,
      isCorrect: isCorrect === 1,
      chosenOption,
      correctOption: qRow.correct_option,
      correctIndex: optionToIndex(qRow.correct_option),
      score: Number(sumScore),
    });
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/quiz/answer error:', err);
    res.status(500).json({ error: 'Хариулт хадгалахад алдаа гарлаа' });
  } finally {
    conn.release();
  }
});

// Тест дуусгах
app.post('/api/quiz/finish', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const attemptId = Number(req.body.attemptId);
    const sessionId = req.body.sessionId ? Number(req.body.sessionId) : null;

    if (!attemptId) {
      return res.status(400).json({ error: 'attemptId шаардлагатай.' });
    }

    await conn.beginTransaction();

    const [[{ sumScore }]] = await conn.query(
      'SELECT COALESCE(SUM(is_correct), 0) AS sumScore FROM quiz_answers WHERE attempt_id = ?',
      [attemptId]
    );

    await conn.query(
      `UPDATE quiz_attempts
       SET finished_at = COALESCE(finished_at, NOW()),
           score = ?,
           duration_seconds = GREATEST(1, TIMESTAMPDIFF(SECOND, started_at, COALESCE(finished_at, NOW())))
       WHERE id = ?`,
      [Number(sumScore), attemptId]
    );

    const [[att]] = await conn.query(
      'SELECT score, total_questions, duration_seconds, session_id FROM quiz_attempts WHERE id = ?',
      [attemptId]
    );

    const activeSessId = sessionId || att?.session_id;
    if (activeSessId) {
      await conn.query(
        `UPDATE quiz_sessions
         SET last_seen_at = NOW(),
             logout_at = COALESCE(logout_at, NOW())
         WHERE id = ?`,
        [activeSessId]
      );
    }

    await conn.commit();

    res.json({
      ok: true,
      score: Number(att?.score ?? sumScore),
      totalQuestions: Number(att?.total_questions ?? 0),
      durationSeconds: Number(att?.duration_seconds ?? 0),
    });
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/quiz/finish error:', err);
    res.status(500).json({ error: 'Тест дуусгахад алдаа гарлаа' });
  } finally {
    conn.release();
  }
});

// Багшийн дашбоард мэдээлэл
app.get('/api/admin/overview', async (_req, res) => {
  try {
    const [[summary]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM quiz_students) AS totalStudents,
        (SELECT COUNT(*) FROM quiz_attendance WHERE attendance_date = CURDATE() AND status IN ('present','late')) AS presentToday,
        (SELECT COUNT(*) FROM quiz_attempts) AS totalAttempts,
        (SELECT ROUND(AVG(score), 2) FROM quiz_attempts WHERE finished_at IS NOT NULL) AS avgScore
    `);

    const [rows] = await pool.query(`
      SELECT
        s.id AS student_id,
        s.full_name,
        s.class_name,
        s.username,
        COALESCE(att.status, 'absent') AS attendance_status,
        att.check_in_at,
        a.id AS attempt_id,
        a.score,
        a.total_questions,
        a.duration_seconds,
        a.started_at,
        a.finished_at
      FROM quiz_students s
      LEFT JOIN quiz_attendance att
        ON att.student_id = s.id AND att.attendance_date = CURDATE()
      LEFT JOIN quiz_attempts a
        ON a.student_id = s.id
        AND a.id = (
          SELECT a2.id FROM quiz_attempts a2
          WHERE a2.student_id = s.id
          ORDER BY a2.started_at DESC, a2.id DESC
          LIMIT 1
        )
      ORDER BY COALESCE(a.score, -1) DESC, s.full_name ASC
    `);

    res.json({ summary, rows });
  } catch (err) {
    console.error('GET /api/admin/overview error:', err);
    res.status(500).json({ error: 'Дашбоардын өгөгдөл татахад алдаа гарлаа' });
  }
});

// ===== Frontend (Vite build: dist) =====
const serverDir = nodePath.dirname(fileURLToPath(import.meta.url));
const distDir = nodePath.join(serverDir, '..', 'dist');
app.use(express.static(distDir));
app.get('/', (_req, res) => res.sendFile(nodePath.join(distDir, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API сервер http://localhost:${PORT} дээр ажиллаж байна`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
