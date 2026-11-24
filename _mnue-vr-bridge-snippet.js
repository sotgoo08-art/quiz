// MNUE VR талын код руу хуулж ашиглах жишээ (https://mnue-vr.onrender.com)
export function openMubisQuiz({ playerName, roomName, classCode, quizUrl = 'https://ТАНЫ-QUIZ-ХАЯГ' }) {
  const url = new URL(quizUrl);
  if (playerName) url.searchParams.set('fullName', playerName);
  if (classCode) {
    url.searchParams.set('className', classCode);
  } else if (roomName) {
    url.searchParams.set('room', roomName);
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'MUBIS_QUIZ_FINISHED') return;
  console.log('Quiz дууссан үр дүн:', data);
});
