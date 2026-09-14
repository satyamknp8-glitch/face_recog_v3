const BASE = '/api';
const TOKEN_KEY = 'sentry_auth';

function authHeaders() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    const token = raw ? JSON.parse(raw)?.token : null;
    return token ? { 'X-Auth-Token': token } : {};
  } catch {
    return {};
  }
}

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* no JSON body */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function getHealth() {
  return fetch(`${BASE}/health`).then(handle);
}

export function listFaces() {
  return fetch(`${BASE}/faces`).then(handle);
}

export function registerFace(name, file) {
  const form = new FormData();
  form.append('name', name);
  form.append('file', file);
  return fetch(`${BASE}/register`, { method: 'POST', body: form, headers: authHeaders() }).then(handle);
}

export function renameStudent(name, newName) {
  return fetch(`${BASE}/faces/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ new_name: newName })
  }).then(handle);
}

export function deleteStudent(name) {
  return fetch(`${BASE}/faces/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(handle);
}

export function recognizeFace(file, markAttendance = true) {
  const form = new FormData();
  form.append('file', file);
  form.append('mark_attendance', String(markAttendance));
  return fetch(`${BASE}/recognize`, { method: 'POST', body: form }).then(handle);
}

export function getAttendance(date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return fetch(`${BASE}/attendance${qs}`).then(handle);
}

export function getAttendanceDates() {
  return fetch(`${BASE}/attendance/dates`).then(handle);
}

export function setAttendanceStatus(id, status) {
  return fetch(`${BASE}/attendance/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status })
  }).then(handle);
}

export function deleteAttendance(id) {
  return fetch(`${BASE}/attendance/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle);
}

export function login(username, password) {
  return fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(handle);
}

export function logout() {
  return fetch(`${BASE}/logout`, { method: 'POST', headers: authHeaders() }).then(handle).catch(() => {});
}
