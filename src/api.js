export async function fetchQuestions() {
  const res = await fetch('/api/questions');
  if (!res.ok) throw new Error('API error ' + res.status);
  return await res.json(); // [{ id, text, options:[A,B,C,D], correct }]
}
