import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { logout } from '../lib/api';
import './Nav.css';

const LINKS = [
  { to: '/verify', label: 'Verify' },
  { to: '/enroll', label: 'Enroll' },
  { to: '/roster', label: 'Roster' },
  { to: '/log', label: 'Access log' }
];

export default function Nav() {
  const { isTeacher, role, username, signOut } = useAuth();

  async function handleSignOut() {
    await logout();
    signOut();
  }

  return (
    <header className="nav">
      <div className="container nav-inner">
        <NavLink to="/" className="nav-brand">
          <span className="nav-brand-mark" />
          Sentry
        </NavLink>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
          {isTeacher && (
            <NavLink to="/config" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Config
            </NavLink>
          )}
        </nav>
        <div className="nav-auth">
          {isTeacher ? (
            <>
              <span className="nav-role">
                {username} · {role}
              </span>
              <button className="btn btn-ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn btn-outline">
              Staff sign in
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
