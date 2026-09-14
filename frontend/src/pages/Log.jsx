import { useEffect, useState } from 'react';
import { getAttendance, getAttendanceDates, setAttendanceStatus } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import Toggle from '../components/Toggle';
import './Log.css';

export default function Log() {
  const [dates, setDates] = useState([]);
  const [selected, setSelected] = useState('');
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const { isTeacher } = useAuth();

  useEffect(() => {
    getAttendanceDates()
      .then(setDates)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getAttendance(selected || undefined)
      .then(setRecords)
      .catch((err) => setError(err.message || 'Could not load the access log.'));
  }, [selected]);

  function handleToggle(record, present) {
    const nextStatus = present ? 'present' : 'absent';
    // optimistic update
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, status: nextStatus } : r)));
    setAttendanceStatus(record.id, nextStatus).catch((err) => {
      setError(err.message || 'Could not update attendance.');
      // revert on failure
      setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, status: record.status } : r)));
    });
  }

  return (
    <div className="container form-page">
      <div className="form-page-head roster-head">
        <div>
          <span className="hero-eyebrow">Access log</span>
          <h1>Who's checked in</h1>
          <p>{records ? `${records.length} entr${records.length === 1 ? 'y' : 'ies'}` : 'Loading…'}</p>
        </div>
        {dates.length > 0 && (
          <select className="date-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Most recent</option>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!isTeacher && (
        <div className="alert" style={{ marginBottom: 20 }}>
          Viewing only. <a href="/login">Sign in as teacher or developer</a> to override attendance.
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {records && records.length === 0 && <div className="empty-state">No entries for this date yet.</div>}
        {records && records.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.time}</td>
                  <td style={{ fontFamily: 'var(--font-body)' }}>{r.name}</td>
                  <td>
                    <Toggle
                      checked={r.status !== 'absent'}
                      disabled={!isTeacher}
                      onChange={(present) => handleToggle(r, present)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
