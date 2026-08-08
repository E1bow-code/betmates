import { Link } from 'react-router-dom'

// A tappable entry into CoachGPT (src/pages/CoachGptPage.jsx). `question`
// is optional - when given (a fixture/fight/race page), it's carried as
// router state and CoachGptPage sends it automatically on arrival, so
// asking about what's on screen is one tap instead of opening the chat
// and typing it out. Without a question (e.g. DirectMessagePage.jsx,
// which has no fixture to ask about), it's just a plain jump into the
// ongoing conversation.
export default function CoachGptLink({ question, label = '🧠 Ask CoachGPT' }) {
  return (
    <Link to="/coach" state={{ prefill: question }} className="btn btn-secondary btn-small" aria-label="Ask CoachGPT">
      {label}
    </Link>
  )
}
