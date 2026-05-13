// ============================================================
//  ClassFlow — app.js
//  Handles auth, state, calendar rendering, booking logic
// ============================================================

// ── Default Data ─────────────────────────────────────────────

const DEFAULT_USERS = [
  { id: 'u0', name: 'Admin', username: 'admin', password: 'sheen', role: 'admin' },
  { id: 'u1', name: 'John Smith', username: 'john', password: 'password', role: 'teacher' },
  { id: 'u2', name: 'Lisa Ray', username: 'lisa', password: 'password', role: 'teacher' },
  { id: 'u3', name: 'Front Desk', username: 'desk', password: 'password', role: 'frontdesk' },
];

// ── State helpers ─────────────────────────────────────────────

function getUsers() {
  const raw = localStorage.getItem('cf_users');
  return raw ? JSON.parse(raw) : DEFAULT_USERS;
}

function saveUsers(users) {
  localStorage.setItem('cf_users', JSON.stringify(users));
}

function getSessions() {
  const raw = localStorage.getItem('cf_sessions');
  return raw ? JSON.parse(raw) : [];
}

function saveSessions(sessions) {
  localStorage.setItem('cf_sessions', JSON.stringify(sessions));
}

function getCurrentUser() {
  const raw = sessionStorage.getItem('cf_current_user');
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(user) {
  sessionStorage.setItem('cf_current_user', JSON.stringify(user));
}

// ── Utility ───────────────────────────────────────────────────

function uid() {
  return 's' + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function dateToStr(d) {
  return d.toISOString().split('T')[0];
}

// ── Page Detection ────────────────────────────────────────────

const isLoginPage = document.getElementById('roleSelect') !== null;
const isDashboard = document.getElementById('calendarGrid') !== null;

// ── LOGIN PAGE ────────────────────────────────────────────────

let selectedRole = null;

if (isLoginPage) {
  // If already logged in, redirect
  if (getCurrentUser()) {
    window.location.href = 'dashboard.html';
  }

  window.selectRole = function (role) {
    selectedRole = role;
    document.getElementById('roleSelect').classList.add('hidden');
    const form = document.getElementById('loginForm');
    form.classList.remove('hidden');
    const badge = document.getElementById('loginRoleLabel');
    const labels = { frontdesk: '🗓️ Front Desk', teacher: '📚 Teacher', admin: '⚙️ Admin' };
    badge.textContent = labels[role];
    badge.className = `role-badge role-${role}`;
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').classList.add('hidden');
    setTimeout(() => document.getElementById('loginUser').focus(), 100);
  };

  window.goBack = function () {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('roleSelect').classList.remove('hidden');
    selectedRole = null;
  };

  window.doLogin = function () {
    const username = document.getElementById('loginUser').value.trim().toLowerCase();
    const password = document.getElementById('loginPass').value;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username && u.password === password && u.role === selectedRole);

    if (user) {
      setCurrentUser(user);
      window.location.href = 'dashboard.html';
    } else {
      document.getElementById('loginError').classList.remove('hidden');
    }
  };

  // Allow Enter key
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && selectedRole) doLogin();
  });
}

// ── DASHBOARD PAGE ────────────────────────────────────────────

if (isDashboard) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
  }

  // Populate sidebar
  document.getElementById('sidebarName').textContent = user.name;
  document.getElementById('sidebarRole').textContent =
    user.role === 'frontdesk' ? 'Front Desk' : user.role.charAt(0).toUpperCase() + user.role.slice(1);
  document.getElementById('sidebarAvatar').textContent = user.name.charAt(0).toUpperCase();

  // Show admin nav if admin
  if (user.role === 'admin') {
    document.getElementById('navAdmin').style.display = 'flex';
  }

  // Teachers can't book
  if (user.role === 'teacher') {
    const b1 = document.getElementById('bookBtn');
    const b2 = document.getElementById('bookBtn2');
    if (b1) b1.style.display = 'none';
    if (b2) b2.style.display = 'none';
  }

  // ── Week state ───────────────────────────────────────────

  let currentWeekMonday = getMondayOf(new Date());
  let pendingStudents = [];
  let currentDetailId = null;

  // ── Navigation ────────────────────────────────────────────

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');
      if (view === 'bookings') renderBookingsList();
      if (view === 'admin') renderAdminPanel();
    });
  });

  window.logout = function () {
    sessionStorage.removeItem('cf_current_user');
    window.location.href = 'index.html';
  };

  // ── Calendar ──────────────────────────────────────────────

  window.shiftWeek = function (dir) {
    if (dir === 0) {
      currentWeekMonday = getMondayOf(new Date());
    } else {
      currentWeekMonday.setDate(currentWeekMonday.getDate() + dir * 7);
    }
    renderCalendar();
  };

  function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const sessions = getSessions();

    // Build 7 days
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekMonday);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const startStr = dateToStr(days[0]);
    const endStr = dateToStr(days[6]);
    document.getElementById('weekLabel').textContent =
      `${formatDate(startStr)} — ${formatDate(endStr)}`;

    // Filter sessions for this week
    const weekSessions = sessions.filter(s => s.date >= startStr && s.date <= endStr);

    const today = dateToStr(new Date());

    grid.innerHTML = days.map(d => {
      const ds = dateToStr(d);
      const daySessions = weekSessions
        .filter(s => s.date === ds)
        .sort((a, b) => a.time.localeCompare(b.time));

      const isToday = ds === today;
      const isPast = ds < today;

      return `
        <div class="cal-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}">
          <div class="cal-day-header">
            <span class="cal-weekday">${d.toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
            <span class="cal-date ${isToday ? 'today-dot' : ''}">${d.getDate()}</span>
          </div>
          <div class="cal-sessions">
            ${daySessions.length === 0
              ? `<div class="cal-empty">No classes</div>`
              : daySessions.map(s => renderSessionCard(s)).join('')
            }
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSessionCard(s) {
    const enrolled = s.students ? s.students.length : 0;
    const max = s.maxStudents || 10;
    const pct = Math.round((enrolled / max) * 100);
    const full = enrolled >= max;
    const endTime = addMinutes(s.time, s.duration);

    return `
      <div class="session-card ${full ? 'full' : ''}" onclick="openDetailModal('${s.id}')">
        <div class="session-name">${s.name}</div>
        <div class="session-time">${formatTime(s.time)} – ${formatTime(endTime)}</div>
        <div class="session-teacher">${s.teacherName || 'No teacher assigned'}</div>
        <div class="session-capacity">
          <div class="capacity-bar">
            <div class="capacity-fill" style="width:${Math.min(pct,100)}%"></div>
          </div>
          <span class="capacity-label ${full ? 'capacity-full' : ''}">${enrolled}/${max} ${full ? '· FULL' : ''}</span>
        </div>
      </div>
    `;
  }

  // ── Booking Modal ─────────────────────────────────────────

  window.openBookingModal = function () {
    if (user.role === 'teacher') return;
    pendingStudents = [];
    renderStudentList();
    document.getElementById('bookingError').classList.add('hidden');
    document.getElementById('studentError').classList.add('hidden');

    // Set default date to today
    document.getElementById('sessionDate').value = dateToStr(new Date());
    document.getElementById('sessionTime').value = '09:00';
    document.getElementById('sessionDuration').value = '60';
    document.getElementById('sessionName').value = '';
    document.getElementById('sessionMax').value = '10';

    // Reset duration toggle
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.toggle-btn[data-val="60"]').classList.add('active');

    // Populate teachers
    const teacherSel = document.getElementById('sessionTeacher');
    const teachers = getUsers().filter(u => u.role === 'teacher');
    teacherSel.innerHTML = '<option value="">— Select teacher —</option>' +
      teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    document.getElementById('bookingModal').classList.remove('hidden');
  };

  window.closeBookingModal = function () {
    document.getElementById('bookingModal').classList.add('hidden');
  };

  window.selectDuration = function (btn) {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('sessionDuration').value = btn.dataset.val;
  };

  window.addStudent = function () {
    const nameEl = document.getElementById('studentName');
    const ageEl = document.getElementById('studentAge');
    const name = nameEl.value.trim();
    const age = ageEl.value.trim();

    if (!name) {
      document.getElementById('studentError').classList.remove('hidden');
      return;
    }
    document.getElementById('studentError').classList.add('hidden');

    pendingStudents.push({ name, age: age || '—' });
    nameEl.value = '';
    ageEl.value = '';
    renderStudentList();
    nameEl.focus();
  };

  function renderStudentList() {
    const container = document.getElementById('studentList');
    if (!pendingStudents.length) {
      container.innerHTML = '<div class="no-students">No students added yet</div>';
      return;
    }
    container.innerHTML = pendingStudents.map((s, i) => `
      <div class="student-item">
        <span class="student-name">${s.name}</span>
        <span class="student-age">Age: ${s.age}</span>
        <button class="remove-btn" onclick="removeStudent(${i})">✕</button>
      </div>
    `).join('');
  }

  window.removeStudent = function (idx) {
    pendingStudents.splice(idx, 1);
    renderStudentList();
  };

  window.saveBooking = function () {
    const date = document.getElementById('sessionDate').value;
    const time = document.getElementById('sessionTime').value;
    const duration = parseInt(document.getElementById('sessionDuration').value);
    const name = document.getElementById('sessionName').value.trim();
    const maxStudents = parseInt(document.getElementById('sessionMax').value);
    const teacherId = document.getElementById('sessionTeacher').value;

    const errEl = document.getElementById('bookingError');

    if (!date || !time || !name) {
      errEl.textContent = 'Please fill in date, time, and session name.';
      errEl.classList.remove('hidden');
      return;
    }

    const teacherName = teacherId
      ? getUsers().find(u => u.id === teacherId)?.name || ''
      : '';

    const session = {
      id: uid(),
      date,
      time,
      duration,
      name,
      maxStudents,
      teacherId,
      teacherName,
      students: [...pendingStudents],
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    const sessions = getSessions();
    sessions.push(session);
    saveSessions(sessions);

    closeBookingModal();
    renderCalendar();
  };

  // ── Detail Modal ──────────────────────────────────────────

  window.openDetailModal = function (id) {
    const sessions = getSessions();
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    currentDetailId = id;

    document.getElementById('detailTitle').textContent = s.name;
    const endTime = addMinutes(s.time, s.duration);
    const enrolled = s.students ? s.students.length : 0;

    const canDelete = user.role === 'admin' || user.role === 'frontdesk';

    document.getElementById('detailBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">📅 Date</span>
          <span>${formatDate(s.date)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">🕐 Time</span>
          <span>${formatTime(s.time)} – ${formatTime(endTime)} (${s.duration} min)</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">👤 Teacher</span>
          <span>${s.teacherName || 'Not assigned'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">👥 Capacity</span>
          <span>${enrolled} / ${s.maxStudents} students</span>
        </div>
      </div>
      <div class="detail-students">
        <h4>Students (${enrolled})</h4>
        ${enrolled === 0
          ? '<p class="sub">No students registered.</p>'
          : `<div class="student-table">
              <div class="student-table-header">
                <span>Name</span><span>Age</span>
              </div>
              ${s.students.map((st, i) => `
                <div class="student-table-row">
                  <span>${i + 1}. ${st.name}</span><span>${st.age}</span>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    `;

    const deleteBtn = document.querySelector('.btn-danger');
    if (deleteBtn) deleteBtn.style.display = canDelete ? 'inline-flex' : 'none';

    document.getElementById('detailModal').classList.remove('hidden');
  };

  window.closeDetailModal = function () {
    document.getElementById('detailModal').classList.add('hidden');
    currentDetailId = null;
  };

  window.deleteCurrentSession = function () {
    if (!currentDetailId) return;
    if (!confirm('Are you sure you want to delete this session?')) return;
    const sessions = getSessions().filter(s => s.id !== currentDetailId);
    saveSessions(sessions);
    closeDetailModal();
    renderCalendar();
    renderBookingsList();
  };

  // ── Bookings List ─────────────────────────────────────────

  function renderBookingsList() {
    const sessions = getSessions().sort((a, b) => {
      const da = a.date + a.time;
      const db = b.date + b.time;
      return da.localeCompare(db);
    });

    const container = document.getElementById('bookingsList');
    if (!sessions.length) {
      container.innerHTML = '<div class="empty-state">No sessions booked yet.</div>';
      return;
    }

    container.innerHTML = sessions.map(s => {
      const enrolled = s.students ? s.students.length : 0;
      const endTime = addMinutes(s.time, s.duration);
      return `
        <div class="booking-row" onclick="openDetailModal('${s.id}')">
          <div class="booking-main">
            <div class="booking-name">${s.name}</div>
            <div class="booking-meta">${formatDate(s.date)} &nbsp;·&nbsp; ${formatTime(s.time)} – ${formatTime(endTime)}</div>
          </div>
          <div class="booking-teacher">${s.teacherName || 'No teacher'}</div>
          <div class="booking-capacity">${enrolled} / ${s.maxStudents}</div>
          <div class="booking-arrow">→</div>
        </div>
      `;
    }).join('');
  }

  // ── Admin Panel ───────────────────────────────────────────

  function renderAdminPanel() {
    const users = getUsers().filter(u => u.role !== 'admin');
    const container = document.getElementById('userList');
    if (!users.length) {
      container.innerHTML = '<div class="sub">No users yet.</div>';
      return;
    }
    container.innerHTML = users.map(u => `
      <div class="user-row">
        <div class="user-avatar">${u.name.charAt(0)}</div>
        <div>
          <div class="user-name">${u.name}</div>
          <div class="user-meta">@${u.username} · ${u.role === 'teacher' ? '📚 Teacher' : '🗓️ Front Desk'}</div>
        </div>
        <button class="remove-btn" onclick="deleteUser('${u.id}')">✕</button>
      </div>
    `).join('');
  }

  window.createUser = function () {
    const name = document.getElementById('newUserName').value.trim();
    const username = document.getElementById('newUsername').value.trim().toLowerCase();
    const password = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;
    const msgEl = document.getElementById('adminMsg');

    if (!name || !username || !password) {
      msgEl.textContent = 'Please fill in all fields.';
      msgEl.className = 'error-msg';
      msgEl.classList.remove('hidden');
      return;
    }

    const users = getUsers();
    if (users.find(u => u.username.toLowerCase() === username)) {
      msgEl.textContent = 'Username already taken.';
      msgEl.className = 'error-msg';
      msgEl.classList.remove('hidden');
      return;
    }

    users.push({ id: uid(), name, username, password, role });
    saveUsers(users);

    msgEl.textContent = `✓ Account created for ${name}`;
    msgEl.className = 'success-msg';
    msgEl.classList.remove('hidden');

    document.getElementById('newUserName').value = '';
    document.getElementById('newUsername').value = '';
    document.getElementById('newUserPass').value = '';

    renderAdminPanel();
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  };

  window.deleteUser = function (id) {
    if (!confirm('Delete this user?')) return;
    const users = getUsers().filter(u => u.id !== id);
    saveUsers(users);
    renderAdminPanel();
  };

  // ── Init ──────────────────────────────────────────────────

  renderCalendar();
}
