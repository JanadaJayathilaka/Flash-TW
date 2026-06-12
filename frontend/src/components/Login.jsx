import { useState } from 'react';

const PASSWORD = '36fonseka';

export default function Login({ onLoginSuccess }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input === PASSWORD) {
      setError(false);
      onLoginSuccess();
    } else {
      setError(true);
      setInput('');
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-card">
        <button type="button" className="auth-close" onClick={() => setInput('')}>
          <i className="material-icons">close</i>
        </button>

        <div className={`auth-field ${error ? 'error' : ''}`} style={{ position: 'relative' }}>
          <span className="auth-icon">
            <i className="material-icons" style={{ color: '#1565c0' }}>lock</i>
          </span>
          <input
            type="password"
            className="auth-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            placeholder=""
            autoFocus
            id="passcode"
          />
          <label htmlFor="passcode" className="auth-label">Passcode</label>
        </div>

        {error && (
          <div className="auth-error">
            Invalid passcode.
          </div>
        )}

        <div style={{ marginTop: '25px', marginLeft: "20px", marginRight: "10px", }}>
          <button type="submit" className="auth-btn">
            Login
          </button>
        </div>
      </form>
    </div>
  );
}
