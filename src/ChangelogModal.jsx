// src/ChangelogModal.jsx
import ReactMarkdown from 'react-markdown'
import changelog from '../CHANGELOG.md?raw'   // the real file, imported as text

export default function ChangelogModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* stopPropagation so clicking inside the card doesn't close it */}
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>What's new</h3>
          <button className="detail-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body markdown">
          <ReactMarkdown>{changelog}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}