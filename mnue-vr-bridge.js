export function openQuizFromMnueVr({ playerName, roomName, className, quizUrl = 'https://quiz-1-qdt9.onrender.com/' }) {
  const targetUrl = new URL(quizUrl);

  if (playerName) targetUrl.searchParams.set('fullName', playerName);
  if (className) {
    targetUrl.searchParams.set('className', className);
  } else if (roomName) {
    targetUrl.searchParams.set('room', roomName);
  }

  window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer');
}
