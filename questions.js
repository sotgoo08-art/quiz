// MySQL-ees (/api/questions) sanamsargui 5 asuult avna
const res = await fetch('/api/questions');
if (!res.ok) throw new Error('Asuult achaalahad aldaa: ' + res.status);
const rows = await res.json();

export const questions = rows.map((r) => ({
    "q": r.text,
    "options": r.options,
    "correct": r.correct,
}));
