// ============================================================
//  ClassFlow — app.js
//  Handles auth, state, calendar rendering, booking logic
// ============================================================

// ── Supabase Configuration ─────────────────────────────────────
const SUPABASE_URL = 'https://rnvpgurtthezmzffdlhi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudnBndXJ0dGhlem16ZmZkbGhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTM4NDMsImV4cCI6MjA5NDIyOTg0M30.WUl_SVepT7uQmR0ObDmkQYNN33Gik2_OnW4RE3b6a74';
const sb = (typeof window.supabase !== 'undefined') ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

if (!sb) {
  console.warn('Supabase client not initialized. Falling back to localStorage.');
} else {
  console.log('Supabase client initialized successfully.');
}




// ── Default Data ─────────────────────────────────────────────

const DEFAULT_USERS = [
  { id: 'u0', name: 'Admin', username: 'admin', password: 'sheen', role: 'admin' },
  { id: 'u1', name: 'John Smith', username: 'john', password: 'password', role: 'teacher' },
  { id: 'u2', name: 'Lisa Ray', username: 'lisa', password: 'password', role: 'teacher' },
  { id: 'u3', name: 'Front Desk', username: 'desk', password: 'password', role: 'frontdesk' },
];

// ── State helpers ─────────────────────────────────────────────

async function getUsers() {
  if (!sb || SUPABASE_URL.includes('YOUR')) {
    const raw = localStorage.getItem('cf_users');
    return raw ? JSON.parse(raw) : DEFAULT_USERS;
  }
  const { data, error } = await sb.from('profiles').select('*');
  return data || DEFAULT_USERS;
}

async function saveUsers(users) {
  if (!sb || SUPABASE_URL.includes('YOUR')) {
    localStorage.setItem('cf_users', JSON.stringify(users));
    return;
  }
  // For Supabase, we typically update individual profiles, but for this refactor:
  const { error } = await sb.from('profiles').upsert(users);
  if (error) console.error('Supabase saveUsers error:', error);
}

async function getSessions() {
  if (!sb || SUPABASE_URL.includes('YOUR')) {
    const raw = localStorage.getItem('cf_sessions');
    return raw ? JSON.parse(raw) : [];
  }
  const { data, error } = await sb.from('sessions').select('*');
  return data || [];
}

async function saveSessions(sessions) {
  if (!sb || SUPABASE_URL.includes('YOUR')) {
    localStorage.setItem('cf_sessions', JSON.stringify(sessions));
    return;
  }
  const { error } = await sb.from('sessions').upsert(sessions);
  if (error) console.error('Supabase saveSessions error:', error);
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

  window.doLogin = async function () {
    console.log('Login attempt started...');
    try {
      const username = document.getElementById('loginUser').value.trim().toLowerCase();
      const password = document.getElementById('loginPass').value;
      
      if (!selectedRole) {
        console.error('No role selected');
        return;
      }

      console.log(`Fetching users for role: ${selectedRole}...`);
      const users = await getUsers();
      console.log('Users fetched:', users.length);

      const user = users.find(u => u.username.toLowerCase() === username && u.password === password && u.role === selectedRole);

      if (user) {
        console.log('Login successful for:', user.name);
        setCurrentUser(user);
        window.location.href = 'dashboard.html';
      } else {
        console.warn('Login failed: Invalid credentials');
        document.getElementById('loginError').classList.remove('hidden');
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('An error occurred during login. Please check the console.');
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

  // Teachers CAN book sessions now
  /*
  if (user.role === 'teacher') {
    const b1 = document.getElementById('bookBtn');
    const b2 = document.getElementById('bookBtn2');
    if (b1) b1.style.display = 'none';
    if (b2) b2.style.display = 'none';
  }
  */

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
    getSessions().then(sessions => {
      const grid = document.getElementById('calendarGrid');
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
    });
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

  window.openBookingModal = async function () {
    // Teachers are allowed to book now
    // if (user.role === 'teacher') return;
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
    const allUsers = await getUsers();
    const teachers = allUsers.filter(u => u.role === 'teacher');
    teacherSel.innerHTML = '<option value="">— Select teacher —</option>' +
      teachers.map(t => `<option value="${t.id}" ${t.id === user.id ? 'selected' : ''}>${t.name}</option>`).join('');

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

  window.saveBooking = async function () {
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

    const allUsers = await getUsers();
    const teacherName = teacherId
      ? allUsers.find(u => u.id === teacherId)?.name || ''
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

    const sessions = await getSessions();
    sessions.push(session);
    await saveSessions(sessions);

    closeBookingModal();
    renderCalendar();
  };

  // ── Detail Modal ──────────────────────────────────────────

  window.openDetailModal = async function (id) {
    const sessions = await getSessions();
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

    const canDelete = user.role === 'admin' || user.role === 'frontdesk';

    // Reset footer buttons
    document.getElementById('detailCloseBtn').style.display = 'inline-flex';
    document.getElementById('editSessionBtn').style.display = canDelete ? 'inline-flex' : 'none';
    document.getElementById('deleteSessionBtn').style.display = canDelete ? 'inline-flex' : 'none';
    document.getElementById('editCancelBtn').style.display = 'none';
    document.getElementById('saveEditBtn').style.display = 'none';

    document.getElementById('detailModal').classList.remove('hidden');
  };

  window.cancelEdit = function () {
    if (currentDetailId) openDetailModal(currentDetailId);
  };

  window.editCurrentSession = async function () {
    const sessions = await getSessions();
    const s = sessions.find(x => x.id === currentDetailId);
    if (!s) return;

    const allUsers = await getUsers();
    const teachers = allUsers.filter(u => u.role === 'teacher');
    const teacherOptions = teachers.map(t => 
      `<option value="${t.id}" ${t.id === s.teacherId ? 'selected' : ''}>${t.name}</option>`
    ).join('');

    document.getElementById('detailBody').innerHTML = `
      <div class="edit-form">
        <div class="form-group">
          <label>Session Name</label>
          <input type="text" id="editName" value="${s.name}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="editDate" value="${s.date}" />
          </div>
          <div class="form-group">
            <label>Time</label>
            <input type="time" id="editTime" value="${s.time}" />
          </div>
        </div>
        <div class="form-group">
          <label>Duration</label>
          <select id="editDuration">
            <option value="60" ${s.duration === 60 ? 'selected' : ''}>1 Hour</option>
            <option value="120" ${s.duration === 120 ? 'selected' : ''}>2 Hours</option>
          </select>
        </div>
        <div class="form-group">
          <label>Max Students</label>
          <input type="number" id="editMax" value="${s.maxStudents}" min="1" max="50" />
        </div>
        <div class="form-group">
          <label>Teacher</label>
          <select id="editTeacher">
            <option value="">— Select teacher —</option>
            ${teacherOptions}
          </select>
        </div>
        <div id="editError" class="error-msg hidden"></div>
      </div>
    `;

    // Swap footer buttons
    document.getElementById('detailCloseBtn').style.display = 'none';
    document.getElementById('editSessionBtn').style.display = 'none';
    document.getElementById('deleteSessionBtn').style.display = 'none';
    document.getElementById('editCancelBtn').style.display = 'inline-flex';
    document.getElementById('saveEditBtn').style.display = 'inline-flex';
  };

  window.saveSessionEdit = async function () {
    const name = document.getElementById('editName').value.trim();
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    const duration = parseInt(document.getElementById('editDuration').value);
    const maxStudents = parseInt(document.getElementById('editMax').value);
    const teacherId = document.getElementById('editTeacher').value;

    const errEl = document.getElementById('editError');

    if (!name || !date || !time) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.classList.remove('hidden');
      return;
    }

    const sessions = await getSessions();
    const idx = sessions.findIndex(s => s.id === currentDetailId);
    if (idx === -1) return;

    const allUsers = await getUsers();
    const teacherName = teacherId
      ? allUsers.find(u => u.id === teacherId)?.name || ''
      : '';

    // Update session
    sessions[idx] = {
      ...sessions[idx],
      name,
      date,
      time,
      duration,
      maxStudents,
      teacherId,
      teacherName
    };

    saveSessions(sessions);
    
    // Reset modal state and refresh
    openDetailModal(currentDetailId);
    renderCalendar();
    renderBookingsList();
  };

  window.closeDetailModal = function () {
    document.getElementById('detailModal').classList.add('hidden');
    currentDetailId = null;
  };

  window.deleteCurrentSession = async function () {
    if (!currentDetailId) return;
    if (!confirm('Are you sure you want to delete this session?')) return;
    const allSessions = await getSessions();
    const sessions = allSessions.filter(s => s.id !== currentDetailId);
    await saveSessions(sessions);
    closeDetailModal();
    renderCalendar();
    renderBookingsList();
  };

  // ── Bookings List ─────────────────────────────────────────

  async function renderBookingsList() {
    const allSessions = await getSessions();
    const sessions = allSessions.sort((a, b) => {
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

  async function renderAdminPanel() {
    const allUsers = await getUsers();
    const users = allUsers.filter(u => u.role !== 'admin');
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

  window.createUser = async function () {
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

    const users = await getUsers();
    if (users.find(u => u.username.toLowerCase() === username)) {
      msgEl.textContent = 'Username already taken.';
      msgEl.className = 'error-msg';
      msgEl.classList.remove('hidden');
      return;
    }

    users.push({ id: uid(), name, username, password, role });
    await saveUsers(users);

    msgEl.textContent = `✓ Account created for ${name}`;
    msgEl.className = 'success-msg';
    msgEl.classList.remove('hidden');

    document.getElementById('newUserName').value = '';
    document.getElementById('newUsername').value = '';
    document.getElementById('newUserPass').value = '';

    renderAdminPanel();
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  };

  window.deleteUser = async function (id) {
    if (!confirm('Delete this user?')) return;
    const allUsers = await getUsers();
    const users = allUsers.filter(u => u.id !== id);
    await saveUsers(users);
    renderAdminPanel();
  };

  // ── Init ──────────────────────────────────────────────────

  renderCalendar();
}
