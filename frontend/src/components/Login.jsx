import { useState } from 'react';

const PASSWORD = '36fonseka';

export default function Login({ onLoginSuccess }) {
  const [input, setInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        <div className="auth-close" onClick={() => setInput('')}>✕</div>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0a1f44' }}>Flash Sales Sign In</h2>
        </div>

        <div className={`auth-field ${error ? 'error' : ''}`}>
          <span className="auth-icon" style={{ fontSize: '20px' }}>🔒</span>
          <input
            type={showPassword ? 'text' : 'password'}
            className="auth-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            placeholder="Passcode"
            autoFocus
          />
          <span 
            className="auth-eye" 
            onClick={() => setShowPassword(!showPassword)}
            style={{ fontSize: '18px', userSelect: 'none' }}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </span>
        </div>

        {error && (
          <div className="auth-error">
            Incorrect passcode. Try again.
          </div>
        )}

        <button type="submit" className="auth-btn">
          LOGIN
        </button>
      </form>
    </div>
  );
}
