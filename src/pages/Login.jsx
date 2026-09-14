import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login as loginApi } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import './FormPage.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await loginApi(username.trim(), password);
      signIn(data);
      navigate('/config');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container form-page">
      <div className="form-page-head">
        <span className="hero-eyebrow">Staff access</span>
        <h1>Sign in</h1>
        <p>Teacher and developer accounts can override attendance and manage the roster.</p>
      </div>

      <form className="form-side" style={{ maxWidth: 380 }} onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-side-actions">
          <button className="btn btn-amber" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
