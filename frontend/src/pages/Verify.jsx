import { useState } from 'react';
import CaptureInput from '../components/CaptureInput';
import { recognizeFace } from '../lib/api';
import './FormPage.css';

export default function Verify() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | checking | done | error
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);

  function handleCapture(f, url) {
    setFile(f);
    setPreview(url);
    setStatus('idle');
    setResult(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setStatus('error');
      setMessage('Capture a still or upload a photo to check first.');
      return;
    }
    setStatus('checking');
    try {
      const res = await recognizeFace(file, true);
      setResult(res);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Could not process that image.');
    }
  }

  return (
    <div className="container form-page">
      <div className="form-page-head">
        <span className="hero-eyebrow">Verify</span>
        <h1>Check a face against the roster</h1>
        <p>A confirmed match is written straight into the access log with today's date and time.</p>
      </div>

      <div className="form-grid">
        <div className="card">
          <CaptureInput onCapture={handleCapture} previewUrl={preview} />
        </div>

        <div className="card form-side">
          <button className="btn btn-amber" onClick={handleSubmit} disabled={status === 'checking'}>
            {status === 'checking' ? <span className="spinner" /> : null}
            {status === 'checking' ? 'Checking…' : 'Run verification'}
          </button>

          {status === 'error' && <div className="alert alert-error">{message}</div>}

          {status === 'done' && result && (
            <div className="results">
              {result.faces.length === 0 && (
                <div className="empty-state">No face found in that image.</div>
              )}
              {result.faces.map((f, i) => (
                <div className="result-row" key={i}>
                  <div>
                    <div className="result-name">{f.name}</div>
                    <div className="result-meta">
                      {f.distance !== null ? `distance ${f.distance.toFixed(3)}` : 'no roster to compare against'}
                    </div>
                  </div>
                  {f.name === 'Unknown' ? (
                    <span className="badge badge-unknown">
                      <span className="badge-dot" /> no match
                    </span>
                  ) : (
                    <span className="badge badge-match">
                      <span className="badge-dot" />
                      {result.logged.includes(f.name) ? 'logged' : 'already logged today'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
