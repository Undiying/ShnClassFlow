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
  const cleanSessions = sessions.map(s => {
    const { type, ...rest } = s;
    if (!rest.date || rest.date === '') rest.date = '2000-01-01'; // Satisfy NOT NULL constraint
    return rest;
  });
  const { error } = await sb.from('sessions').upsert(cleanSessions);
  if (error) console.error('Supabase saveSessions error:', error);
}

async function getStudents() {
  if (!sb || SUPABASE_URL.includes('YOUR')) {
    const raw = localStorage.getItem('cf_students');
    return raw ? JSON.parse(raw) : [];
  }
  try {
    const { data, error } = await sb.from('students').select('*');
    if (error) {
      console.warn('Supabase getStudents error (falling back to local):', error.message);
      const raw = localStorage.getItem('cf_students');
      return raw ? JSON.parse(raw) : [];
    }
    return data || [];
  } catch (err) {
    console.error('Supabase getStudents exception:', err);
    const raw = localStorage.getItem('cf_students');
    return raw ? JSON.parse(raw) : [];
  }
}


async function saveStudents(students) {
  if (!sb || SUPABASE_URL.includes('YOUR')) {
    localStorage.setItem('cf_students', JSON.stringify(students));
    return;
  }
  try {
    const { error } = await sb.from('students').upsert(students);
    if (error) {
      console.warn('Supabase saveStudents error (falling back to local):', error.message);
      localStorage.setItem('cf_students', JSON.stringify(students));
    }
  } catch (err) {
    console.error('Supabase saveStudents exception:', err);
    localStorage.setItem('cf_students', JSON.stringify(students));
  }
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

  // Role-specific UI
  if (user.role === 'teacher') {
    document.getElementById('bookBtn').textContent = '+ Create Time Slot';
    document.getElementById('bookBtn2').textContent = '+ Create Time Slot';
    document.getElementById('viewSub').textContent = 'Manage your weekly recurring time slots';
    document.getElementById('navBookings').innerHTML = '<span class="nav-icon">📚</span> My Time Slots';
  } else {
    document.getElementById('bookBtn').textContent = '+ Book Session';
    document.getElementById('bookBtn2').textContent = '+ Book Session';
    document.getElementById('viewSub').textContent = 'Weekly class schedule';
  }



  // ── Week state ───────────────────────────────────────────

  let currentWeekMonday = getMondayOf(new Date());
  let pendingStudents = [];
  let currentDetailId = null;
  let currentOverviewDay = 1; // Default to Monday to match UI

  window.selectOverviewDay = function(dayIndex) {
    currentOverviewDay = dayIndex;
    document.querySelectorAll('#daySelector .day-btn').forEach(btn => btn.classList.remove('active'));
    // Find the button corresponding to this dayIndex. The buttons are ordered Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0.
    // In our HTML: Mon is index 0, Sun is index 6.
    const btns = document.querySelectorAll('#daySelector .day-btn');
    const mapping = {1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 0:6};
    if (btns[mapping[dayIndex]]) btns[mapping[dayIndex]].classList.add('active');
    
    getSessions().then(renderClassOverview);
  };

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
      if (view === 'bookings') renderBookingsList();
      if (view === 'admin') renderAdminPanel();
      if (view === 'students') renderGlobalStudentsList();
    });
  });

  async function renderGlobalStudentsList() {
    const students = await getStudents();
    const container = document.getElementById('globalStudentList');
    if (!container) return;
    
    if (students.length === 0) {
      container.innerHTML = '<p class="sub">No students registered yet.</p>';
      return;
    }
    
    container.innerHTML = students.map(s => `
      <div class="user-row">
        <div class="user-avatar">${s.name.charAt(0).toUpperCase()}</div>
        <div style="flex:2">
          <div class="user-name">${s.name}</div>
          <div class="user-meta">Age: ${s.age || 'N/A'}</div>
        </div>
        <div style="flex:3;">
          <div class="user-name">${s.parentName || 'No Parent'}</div>
          <div class="user-meta">${s.parentPhone || 'No phone'} · ${s.parentEmail || 'No email'}</div>
        </div>
        <div style="flex:3; color: var(--text-2); font-size: 0.8rem;">
          ${s.notes || 'No notes'}
        </div>
      </div>
    `).join('');

  }

  // ── Student Modal ─────────────────────────────────────────

  window.openStudentModal = function() {
    document.getElementById('newStudentName').value = '';
    document.getElementById('newStudentAge').value = '';
    document.getElementById('newStudentNotes').value = '';
    document.getElementById('studentModalError').classList.add('hidden');
    document.getElementById('studentModal').classList.remove('hidden');
  };

  window.closeStudentModal = function() {
    document.getElementById('studentModal').classList.add('hidden');
  };

  window.saveNewStudent = async function() {
    const name = document.getElementById('newStudentName').value.trim();
    const age = document.getElementById('newStudentAge').value.trim();
    const parentName = document.getElementById('newStudentParent')?.value.trim() || '';
    const parentPhone = document.getElementById('newStudentPhone')?.value.trim() || '';
    const parentEmail = document.getElementById('newStudentEmail')?.value.trim() || '';
    const notes = document.getElementById('newStudentNotes').value.trim();

    if (!name || !parentName) {
      const err = document.getElementById('studentModalError');
      err.textContent = "Please provide both Student Name and Parent Name.";
      err.classList.remove('hidden');
      return;
    }

    const newStudent = {
      id: 'st' + Math.random().toString(36).substr(2, 9),
      name,
      age: age || '',
      parentName,
      parentPhone,
      parentEmail,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };


    const students = await getStudents();
    students.push(newStudent);
    await saveStudents(students);
    
    closeStudentModal();
    renderGlobalStudentsList();
    
    // If the booking modal is open, refresh its dropdown
    if (!document.getElementById('bookingModal').classList.contains('hidden')) {
      populateStudentDropdown('bookingStudentSelect');
    }
    if (!document.getElementById('detailModal').classList.contains('hidden')) {
      populateStudentDropdown('editStudentSelect');
    }
  };



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
      const weekSessions = sessions.filter(s => {
        if (s.isRecurring) {
          return true; // Recurring shows every week
        }
        return s.date >= startStr && s.date <= endStr;
      });

      const today = dateToStr(new Date());

      grid.innerHTML = days.map((d, i) => {
        const ds = dateToStr(d);
        const daySessions = weekSessions
          .filter(s => {
            if (s.isRecurring) {
              return parseInt(s.dayOfWeek) === d.getDay();
            }
            return s.date === ds;
          })
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

      renderClassOverview(sessions);
    });
  }

  function renderClassOverview(allSessions) {
    const container = document.getElementById('classSummaryGrid');
    if (!container) return;

    const types = ['Explorer', 'Junior', 'Intro'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Determine the exact date for the currently selected day in the current week
    const targetDate = new Date(currentWeekMonday);
    const offset = currentOverviewDay === 0 ? 6 : currentOverviewDay - 1;
    targetDate.setDate(targetDate.getDate() + offset);
    const targetDateStr = dateToStr(targetDate);

    container.innerHTML = types.map(type => {
      const typeSessions = allSessions.filter(s => {
        if (s.classType !== type) return false;
        if (s.isRecurring) {
          return parseInt(s.dayOfWeek) === currentOverviewDay;
        }
        return s.date === targetDateStr;
      }).sort((a, b) => a.time.localeCompare(b.time));

      const totalEnrolled = typeSessions.reduce((acc, s) => acc + (s.students?.length || 0), 0);
      const totalSlots = typeSessions.length * 9;

      return `
        <div class="class-type-card">
          <div class="class-type-header">
            <span class="class-type-name">${type}</span>
            <span class="occupancy-text">${totalEnrolled} / ${totalSlots || 0} Total Seats</span>
          </div>
          
          <div class="session-seating-list">
            ${typeSessions.length === 0 
              ? '<p class="sub">No slots scheduled</p>' 
              : typeSessions.map(s => {
                  const enrolled = s.students?.length || 0;
                  const dayName = days[currentOverviewDay];
                  return `
                    <div style="margin-bottom: 16px;">
                      <div class="sub" style="margin-bottom: 6px; display:flex; justify-content:space-between; font-weight:500;">
                        <span>${dayName} @ ${formatTime(s.time)}</span>
                        <span>${enrolled}/9</span>
                      </div>
                      <div class="seating-map">
                        ${Array.from({ length: 9 }).map((_, i) => `
                          <div class="seat ${i < enrolled ? 'filled ' + type : ''}" title="${i < enrolled ? s.students[i].name : 'Empty'}"></div>
                        `).join('')}
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>
      `;
    }).join('');
  }


  function renderSessionCard(s) {
    const enrolled = s.students ? s.students.length : 0;
    const max = s.maxStudents || 10;
    const full = enrolled >= max;
    const endTime = addMinutes(s.time, s.duration);
    const isRecurring = s.isRecurring;

    const typeClass = s.classType || 'Free';

    return `
      <div class="session-card slim ${full ? 'full' : ''} ${isRecurring ? 'recurring' : 'one-off'}" onclick="openDetailModal('${s.id}')">
        <div class="session-type-badge ${typeClass}">${typeClass}</div>
        <div class="session-time" style="margin-top:6px; font-weight:500;">${formatTime(s.time)} – ${formatTime(endTime)}</div>
      </div>
    `;
  }



  // ── Booking Modal ─────────────────────────────────────────

  window.openBookingModal = async function () {
    const isTeacher = user.role === 'teacher';
    pendingStudents = [];
    renderStudentList();
    populateStudentDropdown('bookingStudentSelect');
    
    document.getElementById('bookingError').classList.add('hidden');
    document.getElementById('studentError').classList.add('hidden');

    // Setup modal based on role
    document.getElementById('bookingTitle').textContent = isTeacher ? 'Schedule Time Slot' : 'Book Free Session';

    
    // For teachers, we use Day of Week. For others, specific Date.
    const dateGroup = document.getElementById('dateGroup');
    if (isTeacher) {
      dateGroup.innerHTML = `
        <label>Day of Week</label>
        <select id="sessionDay">
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
          <option value="0">Sunday</option>
        </select>
      `;
    } else {
      dateGroup.innerHTML = `
        <label>Date</label>
        <input type="date" id="sessionDate" />
      `;
      document.getElementById('sessionDate').value = dateToStr(new Date());
    }

    document.getElementById('sessionTime').value = '09:00';
    document.getElementById('sessionDuration').value = '60';
    
    // For teachers, name is pre-set by type
    if (isTeacher) {
      document.getElementById('sessionName').value = 'Explorer';
      document.getElementById('sessionMax').value = '9';
      document.getElementById('sessionMax').disabled = true;
    } else {
      document.getElementById('sessionName').value = '';
      document.getElementById('sessionMax').value = '10';
      document.getElementById('sessionNotes').value = '';
      document.getElementById('sessionMax').disabled = false;
    }

    // Class Type Selector for Teachers
    const nameGroup = document.getElementById('sessionName').parentElement;
    if (isTeacher) {
      nameGroup.innerHTML = `
        <label>Class Level</label>
        <div class="type-selector">
          <button class="type-btn active" onclick="selectClassType('Explorer', this)">Explorer</button>
          <button class="type-btn" onclick="selectClassType('Junior', this)">Junior</button>
          <button class="type-btn" onclick="selectClassType('Intro', this)">Intro</button>
        </div>
        <input type="hidden" id="sessionName" value="Explorer" />
        <input type="hidden" id="classType" value="Explorer" />
      `;
    } else {
      nameGroup.innerHTML = `
        <label>Session Name / Subject</label>
        <input type="text" id="sessionName" placeholder="e.g. Beginner Swimming" />
        <input type="hidden" id="classType" value="Free" />
      `;
    }


    // Duration options for Front Desk (1h/2h only as requested)
    const durationSel = document.getElementById('sessionDuration');
    if (!isTeacher) {
      durationSel.innerHTML = `
        <option value="60">1 Hour Session</option>
        <option value="120">2 Hour Session</option>
      `;
    } else {
      durationSel.innerHTML = `
        <option value="30">30 Min Class</option>
        <option value="60">1 Hour Class</option>
        <option value="90">1.5 Hour Class</option>
        <option value="120">2 Hour Class</option>
      `;
    }

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

  window.populateStudentDropdown = async function(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const students = await getStudents();
    sel.innerHTML = '<option value="">— Select an existing student —</option>' + 
      students.map(s => `<option value='${JSON.stringify({id: s.id, name: s.name, age: s.age})}'>${s.name} (Age: ${s.age || '-'})</option>`).join('');
  };

  window.addStudent = function () {
    const sel = document.getElementById('bookingStudentSelect');
    if (!sel || !sel.value) {
      document.getElementById('studentError').textContent = 'Please select a student from the list.';
      document.getElementById('studentError').classList.remove('hidden');
      return;
    }
    document.getElementById('studentError').classList.add('hidden');

    const sData = JSON.parse(sel.value);
    
    // Prevent duplicates
    if (pendingStudents.find(p => p.id === sData.id)) {
      document.getElementById('studentError').textContent = 'Student is already added to this slot.';
      document.getElementById('studentError').classList.remove('hidden');
      return;
    }

    pendingStudents.push(sData);
    sel.value = '';
    renderStudentList();
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

  window.selectClassType = function (type, btn) {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('sessionName').value = type;
    document.getElementById('classType').value = type;
  };

  window.removeStudent = function (idx) {

    pendingStudents.splice(idx, 1);
    renderStudentList();
  };

  window.saveBooking = async function () {
    const isTeacher = user.role === 'teacher';
    const time = document.getElementById('sessionTime').value;
    const duration = parseInt(document.getElementById('sessionDuration').value);
    const name = document.getElementById('sessionName').value.trim();
    const maxStudents = parseInt(document.getElementById('sessionMax').value);
    const teacherId = document.getElementById('sessionTeacher').value;
    const notes = document.getElementById('sessionNotes').value.trim();

    let date = null;
    let dayOfWeek = null;


    if (isTeacher) {
      dayOfWeek = parseInt(document.getElementById('sessionDay').value);
    } else {
      date = document.getElementById('sessionDate').value;
    }

    const errEl = document.getElementById('bookingError');

    if ((!isTeacher && !date) || !time || !name) {
      errEl.textContent = 'Please fill in all required fields.';
      errEl.classList.remove('hidden');
      return;
    }

    const allUsers = await getUsers();
    const teacherName = teacherId
      ? allUsers.find(u => u.id === teacherId)?.name || ''
      : '';

    const session = {
      id: uid(),
      classType: document.getElementById('classType').value,
      isRecurring: isTeacher,
      dayOfWeek: dayOfWeek,
      date: date,
      time,
      duration,
      name,
      maxStudents: isTeacher ? 9 : maxStudents,
      teacherId,
      teacherName,
      notes,
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


    const canManage = user.role === 'admin' || user.role === 'frontdesk' || user.role === 'teacher';

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
      ${s.notes ? `
        <div class="detail-notes">
          <h4>Admin/Front Desk Notes</h4>
          <p>${s.notes}</p>
        </div>
      ` : ''}
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

    // Reset footer buttons
    document.getElementById('detailCloseBtn').style.display = 'inline-flex';
    document.getElementById('editSessionBtn').style.display = canManage ? 'inline-flex' : 'none';
    document.getElementById('deleteSessionBtn').style.display = canManage ? 'inline-flex' : 'none';
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

    // Initialize pendingStudents with current session students
    pendingStudents = [...(s.students || [])];

    const allUsers = await getUsers();
    const teachers = allUsers.filter(u => u.role === 'teacher');
    const teacherOptions = teachers.map(t => 
      `<option value="${t.id}" ${t.id === s.teacherId ? 'selected' : ''}>${t.name}</option>`
    ).join('');

    const isTeacher = user.role === 'teacher';
    const types = ['Explorer', 'Junior', 'Intro'];
    const typeOptions = isTeacher ? `
      <div class="form-group">
        <label>Class Level</label>
        <div class="type-selector">
          ${types.map(t => `<button class="type-btn ${s.classType === t ? 'active' : ''}" onclick="selectClassTypeEdit('${t}', this)">${t}</button>`).join('')}
        </div>
        <input type="hidden" id="editClassType" value="${s.classType || 'Explorer'}" />
      </div>
    ` : '';

    document.getElementById('detailBody').innerHTML = `
      <div class="edit-form">
        ${typeOptions}
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

        <div class="form-group">
          <label>Admin/Front Desk Notes</label>
          <textarea id="editNotes" rows="2">${s.notes || ''}</textarea>
        </div>
        
        <!-- Students Section in Edit -->

        <div class="form-group">
        <div class="form-group">
          <label>Assign Registered Student</label>
          <div id="editStudentList" class="student-list"></div>
          <div class="add-student-row" style="grid-template-columns: 1fr auto;">
            <select id="editStudentSelect">
              <option value="">— Select an existing student —</option>
            </select>
            <button class="btn-ghost small" onclick="addStudentEdit()">+ Add</button>
          </div>
        </div>


        <div id="editError" class="error-msg hidden"></div>
      </div>
    `;

    renderStudentListEdit();
    populateStudentDropdown('editStudentSelect');


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
    const notes = document.getElementById('editNotes').value.trim();

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

    const isTeacher = user.role === 'teacher';
    const finalDate = (isTeacher || !date) ? null : date;

    // Update session
    sessions[idx] = {
      ...sessions[idx],
      name,
      classType: document.getElementById('editClassType')?.value || sessions[idx].classType,
      date: finalDate,
      time,
      duration,
      maxStudents: isTeacher ? 9 : maxStudents,
      teacherId,

      teacherName,
      notes,
      students: [...pendingStudents]
    };



    saveSessions(sessions);
    
    // Reset modal state and refresh
    openDetailModal(currentDetailId);
    renderCalendar();
    renderBookingsList();
  };

  // ── Student Edit Helpers ────────────────────────────────────

  window.addStudentEdit = function () {
    const sel = document.getElementById('editStudentSelect');
    if (!sel || !sel.value) return;

    const sData = JSON.parse(sel.value);
    
    // Prevent duplicates
    if (pendingStudents.find(p => p.id === sData.id)) return;

    pendingStudents.push(sData);
    sel.value = '';
    renderStudentListEdit();
  };


  window.removeStudentEdit = function (idx) {
    pendingStudents.splice(idx, 1);
    renderStudentListEdit();
  };

  window.selectClassTypeEdit = function (type, btn) {
    document.querySelectorAll('.edit-form .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('editClassType').value = type;
    document.getElementById('editName').value = type;
  };

  function renderStudentListEdit() {

    const container = document.getElementById('editStudentList');
    if (!container) return;
    if (!pendingStudents.length) {
      container.innerHTML = '<div class="no-students">No students added yet</div>';
      return;
    }
    container.innerHTML = pendingStudents.map((s, i) => `
      <div class="student-item">
        <span class="student-name">${s.name}</span>
        <span class="student-age">Age: ${s.age}</span>
        <button class="remove-btn" onclick="removeStudentEdit(${i})">✕</button>
      </div>
    `).join('');
  }

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
