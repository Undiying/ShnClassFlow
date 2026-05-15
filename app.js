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
function groupSessions(sessions) {
  const grouped = {};
  sessions.forEach(s => {
    // Key: Explorer_09:00:00_1 (for recurring Mon) or Explorer_09:00:00_2024-05-13 (for one-off)
    const key = `${s.classType}_${s.time}_${s.isRecurring ? s.dayOfWeek : s.date}`;
    if (!grouped[key]) {
      grouped[key] = { ...s, students: [...(s.students || [])] };
    } else {
      // Merge students uniquely
      const existingIds = new Set(grouped[key].students.map(st => st.id));
      (s.students || []).forEach(st => {
        if (!existingIds.has(st.id)) {
          grouped[key].students.push(st);
        }
      });
      // Merge notes if different
      if (s.notes && s.notes !== grouped[key].notes) {
        grouped[key].notes = grouped[key].notes ? grouped[key].notes + "\n" + s.notes : s.notes;
      }
    }
  });
  return Object.values(grouped);
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
    // Only upsert the active student records (exclude extra fields Supabase doesn't know about)
    const clean = students.map(s => ({
      id: s.id,
      name: s.name,
      age: s.age || null,
      parentName: s.parentName || null,
      parentPhone: s.parentPhone || null,
      parentEmail: s.parentEmail || null,
      notes: s.notes || null,
      createdAt: s.createdAt || new Date().toISOString()
    }));
    const { error } = await sb.from('students').upsert(clean);
    if (error) {
      console.warn('Supabase saveStudents error (falling back to local):', error.message);
      localStorage.setItem('cf_students', JSON.stringify(students));
    } else {
      localStorage.setItem('cf_students', JSON.stringify(students));
    }
  } catch (err) {
    console.error('Supabase saveStudents exception:', err);
    localStorage.setItem('cf_students', JSON.stringify(students));
  }
}

async function deleteStudentById(id) {
  // Remove from local cache
  const raw = localStorage.getItem('cf_students');
  const students = raw ? JSON.parse(raw) : [];
  const updated = students.filter(s => s.id !== id);
  localStorage.setItem('cf_students', JSON.stringify(updated));
  
  if (!sb || SUPABASE_URL.includes('YOUR')) return;
  const { error } = await sb.from('students').delete().eq('id', id);
  if (error) console.warn('Supabase deleteStudentById error:', error.message);
}

async function deleteSessionById(id) {
  // Remove from local cache
  const raw = localStorage.getItem('cf_sessions');
  const sessions = raw ? JSON.parse(raw) : [];
  const updated = sessions.filter(s => s.id !== id);
  localStorage.setItem('cf_sessions', JSON.stringify(updated));

  if (!sb || SUPABASE_URL.includes('YOUR')) return;
  const { error } = await sb.from('sessions').delete().eq('id', id);
  if (error) console.warn('Supabase deleteSessionById error:', error.message);
}

async function deleteUserById(id) {
  // Remove from local cache
  const raw = localStorage.getItem('cf_users');
  const users = raw ? JSON.parse(raw) : DEFAULT_USERS;
  const updated = users.filter(u => u.id !== id);
  localStorage.setItem('cf_users', JSON.stringify(updated));

  if (!sb || SUPABASE_URL.includes('YOUR')) return;
  const { error } = await sb.from('profiles').delete().eq('id', id);
  if (error) console.warn('Supabase deleteUserById error:', error.message);
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
  if (user.role === 'admin') {
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) navAdmin.style.display = 'flex';
  }

  // Front desk cannot register students
  if (user.role === 'frontdesk') {
    const regBtn = document.getElementById('registerStudentBtn');
    if (regBtn) regBtn.style.display = 'none';
  }

  if (user.role === 'teacher') {
    document.getElementById('bookBtn').textContent = '+ Create Time Slot';
    document.getElementById('bookBtn2').textContent = '+ Create Time Slot';
    document.getElementById('viewSub').textContent = 'Manage your weekly recurring time slots';
    document.getElementById('navBookings').innerHTML = '<span class="nav-icon">📚</span> My Time Slots';
  } else {
    document.getElementById('bookBtn').textContent = '+ Book Free Session';
    document.getElementById('bookBtn2').textContent = '+ Book Free Session';
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

  let currentStudentCategory = 'Explorer';

  window.selectStudentCategory = function(cat) {
    currentStudentCategory = cat;
    document.querySelectorAll('#studentCategorySelector .day-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === cat);
    });
    renderGlobalStudentsList();
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
    const sessions = await getSessions();
    const container = document.getElementById('globalStudentList');
    if (!container) return;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Only show students who haven't been archived
    const activeStudents = students.filter(s => !s.deletedAt);

    // Map students to their enrolled sessions
    const enrichedStudents = activeStudents.map(s => {
      const studentSessions = sessions.filter(sess => 
        sess.students && sess.students.some(st => st.id === s.id)
      );
      
      const enrollments = studentSessions.map(sess => {
        const dayName = sess.isRecurring ? days[sess.dayOfWeek] : formatDate(sess.date);
        return {
          type: sess.classType,
          display: `${dayName} @ ${formatTime(sess.time)}`
        };
      });

      return { ...s, enrollments };
    });

    // Filter by category
    let filtered;
    if (currentStudentCategory === 'Unassigned') {
      filtered = enrichedStudents.filter(s => s.enrollments.length === 0);
    } else {
      filtered = enrichedStudents.filter(s => 
        s.enrollments.some(e => e.type === currentStudentCategory)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `<p class="sub" style="padding: 2rem; text-align: center;">No students found for "${currentStudentCategory}".</p>`;
      return;
    }

    container.innerHTML = filtered.map(s => {
      const catEnrollments = s.enrollments
        .filter(e => currentStudentCategory === 'Unassigned' ? true : e.type === currentStudentCategory)
        .map(e => e.display)
        .join(', ');

      return `
        <div class="user-row" style="align-items: flex-start; padding: 1.5rem 1.25rem;">
          <div class="user-avatar">${s.name.charAt(0).toUpperCase()}</div>
          <div style="flex:2">
            <div class="user-name" style="font-size: 1rem">${s.name}</div>
            <div class="user-meta">Age: ${s.age || 'N/A'}</div>
            ${catEnrollments ? `<div class="role-badge" style="margin-top:8px; display:inline-block; font-size:10px; background: var(--accent-light); color: var(--accent); border: 1px solid var(--border)">Enrolled: ${catEnrollments}</div>` : ''}
          </div>
          <div style="flex:3;">
            <div class="user-name" style="font-size: 0.9rem; margin-bottom: 2px;">Parent: ${s.parentName || 'No Parent'}</div>
            <div class="user-meta">${s.parentPhone || 'No phone'}</div>
            <div class="user-meta">${s.parentEmail || 'No email'}</div>
          </div>
          <div style="flex:3; color: var(--text-2); font-size: 0.8rem; line-height: 1.4; position: relative; padding-right: 60px;">
            <strong style="display:block; margin-bottom: 2px; color: var(--text-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Notes</strong>
            ${s.notes || 'No notes'}
            <div style="position: absolute; top: 0; right: 0; display: flex; gap: 4px;">
              <button class="remove-btn" onclick="openEditStudentModal('${s.id}')" title="Edit Student" style="background: var(--surface-3); border: 1px solid var(--border);">✎</button>
              <button class="remove-btn" onclick="openArchiveModal('${s.id}')" title="Archive Student">✕</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Student Modal helpers ────────────────────────────────────

  window.selectStudentRegType = function(type, btn) {
    document.querySelectorAll('#studentRegTypeSelector .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('newStudentClassType').value = type;
    populateSlotDropdown(type);
  };

  async function populateSlotDropdown(classType) {
    const sessions = await getSessions();
    const sel = document.getElementById('newStudentSlot');
    if (!sel) return;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let slots = sessions.filter(s => s.classType === classType && s.isRecurring);

    // Teachers only see their own slots
    if (user.role === 'teacher') {
      slots = slots.filter(s => s.teacherId === user.id);
    }

    sel.innerHTML = '<option value="">— Select a time slot —</option>' +
      slots.map(s => `<option value="${s.id}">${days[s.dayOfWeek]} @ ${formatTime(s.time)}</option>`).join('');
  }

  window.openStudentModal = function() {
    document.getElementById('editStudentId').value = '';
    document.getElementById('studentModalTitle').textContent = 'Register New Student';
    document.getElementById('studentSaveBtn').textContent = 'Register Student';
    
    document.getElementById('newStudentName').value = '';
    document.getElementById('newStudentAge').value = '';
    document.getElementById('newStudentNotes').value = '';
    document.getElementById('newStudentParent').value = '';
    document.getElementById('newStudentPhone').value = '';
    document.getElementById('newStudentEmail').value = '';
    document.getElementById('studentModalError').classList.add('hidden');
    // Reset type selector
    document.querySelectorAll('#studentRegTypeSelector .type-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.getElementById('newStudentClassType').value = 'Explorer';
    populateSlotDropdown('Explorer');
    document.getElementById('studentModal').classList.remove('hidden');
  };

  window.openEditStudentModal = async function(id) {
    const students = await getStudents();
    const s = students.find(x => x.id === id);
    if (!s) return;

    document.getElementById('editStudentId').value = id;
    document.getElementById('studentModalTitle').textContent = 'Edit Student Details';
    document.getElementById('studentSaveBtn').textContent = 'Save Changes';

    document.getElementById('newStudentName').value = s.name;
    document.getElementById('newStudentAge').value = s.age || '';
    document.getElementById('newStudentParent').value = s.parentName || '';
    document.getElementById('newStudentPhone').value = s.parentPhone || '';
    document.getElementById('newStudentEmail').value = s.parentEmail || '';
    document.getElementById('newStudentNotes').value = s.notes || '';
    document.getElementById('studentModalError').classList.add('hidden');

    // Find their current recurring class to set type
    const sessions = await getSessions();
    const currentSess = sessions.find(sess => sess.isRecurring && sess.students && sess.students.some(st => st.id === id));
    
    if (currentSess) {
      const type = currentSess.classType;
      document.getElementById('newStudentClassType').value = type;
      document.querySelectorAll('#studentRegTypeSelector .type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === type);
      });
      await populateSlotDropdown(type);
      document.getElementById('newStudentSlot').value = currentSess.id;
    } else {
      // Default to Explorer if not found
      document.querySelectorAll('#studentRegTypeSelector .type-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
      document.getElementById('newStudentClassType').value = 'Explorer';
      await populateSlotDropdown('Explorer');
    }

    document.getElementById('studentModal').classList.remove('hidden');
  };

  window.closeStudentModal = function() {
    document.getElementById('studentModal').classList.add('hidden');
  };

  window.saveNewStudent = async function() {
    const editId = document.getElementById('editStudentId').value;
    const name = document.getElementById('newStudentName').value.trim();
    const age = document.getElementById('newStudentAge').value.trim();
    const parentName = document.getElementById('newStudentParent')?.value.trim() || '';
    const parentPhone = document.getElementById('newStudentPhone')?.value.trim() || '';
    const parentEmail = document.getElementById('newStudentEmail')?.value.trim() || '';
    const notes = document.getElementById('newStudentNotes').value.trim();
    const slotId = document.getElementById('newStudentSlot')?.value || '';

    if (!name || !parentName) {
      const err = document.getElementById('studentModalError');
      err.textContent = 'Please provide both Student Name and Parent Name.';
      err.classList.remove('hidden');
      return;
    }

    const students = await getStudents();
    let studentObj;

    if (editId) {
      const idx = students.findIndex(s => s.id === editId);
      if (idx === -1) return;
      students[idx] = {
        ...students[idx],
        name, 
        age: age || '', 
        parentName, 
        parentPhone, 
        parentEmail, 
        notes: notes || ''
      };
      studentObj = students[idx];
    } else {
      studentObj = {
        id: 'st' + Math.random().toString(36).substr(2, 9),
        name,
        age: age || '',
        parentName,
        parentPhone,
        parentEmail,
        notes: notes || '',
        createdAt: new Date().toISOString()
      };
      students.push(studentObj);
    }

    await saveStudents(students);

    // Assign to selected time slot / Handle transfers
    const sessions = await getSessions();
    
    if (editId) {
      // Update student info in all current sessions, and handle transfer if slot changed
      sessions.forEach(sess => {
        if (sess.students) {
          const sIdx = sess.students.findIndex(st => st.id === editId);
          if (sIdx !== -1) {
            if (slotId && sess.id !== slotId && sess.isRecurring) {
              // Transfer: Remove from old recurring slot
              sess.students.splice(sIdx, 1);
            } else {
              // Just update info
              sess.students[sIdx].name = name;
              sess.students[sIdx].age = age || '';
            }
          }
        }
      });
    }

    if (slotId) {
      const idx = sessions.findIndex(s => s.id === slotId);
      if (idx !== -1) {
        if (!sessions[idx].students) sessions[idx].students = [];
        const alreadyIn = sessions[idx].students.some(st => st.id === studentObj.id);
        if (!alreadyIn) {
          sessions[idx].students.push({ id: studentObj.id, name: studentObj.name, age: studentObj.age });
        }
      }
    }
    
    await saveSessions(sessions);

    closeStudentModal();
    renderGlobalStudentsList();
    renderCalendar();
  };


  let currentStudentToArchive = null;

  window.openArchiveModal = async function(id) {
    const students = await getStudents();
    const student = students.find(s => s.id === id);
    if (!student) return;
    
    currentStudentToArchive = id;
    document.getElementById('archiveStudentPrompt').textContent = `Why is ${student.name} being removed?`;
    document.getElementById('archiveReason').value = '';
    document.getElementById('archiveError').classList.add('hidden');
    document.getElementById('archiveModal').classList.remove('hidden');
  };

  window.closeArchiveModal = function() {
    document.getElementById('archiveModal').classList.add('hidden');
    currentStudentToArchive = null;
  };

  window.confirmArchiveStudent = async function() {
    const reason = document.getElementById('archiveReason').value.trim();
    if (!reason) {
      document.getElementById('archiveError').classList.remove('hidden');
      return;
    }

    // Store archive info in local cache (notes field is updated locally)
    const raw = localStorage.getItem('cf_students');
    const students = raw ? JSON.parse(raw) : [];
    const idx = students.findIndex(s => s.id === currentStudentToArchive);
    if (idx !== -1) {
      // Mark archived locally only — then delete from Supabase
      students[idx].deletedAt = new Date().toISOString();
      students[idx].removalReason = reason;
      students[idx].archivedBy = user.name;
      localStorage.setItem('cf_students', JSON.stringify(students));

      // Permanently delete from Supabase
      await deleteStudentById(currentStudentToArchive);
    }

    closeArchiveModal();
    renderGlobalStudentsList();
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
        const daySessions = groupSessions(weekSessions
          .filter(s => {
            if (s.isRecurring) {
              return parseInt(s.dayOfWeek) === d.getDay();
            }
            return s.date === ds;
          }))
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
      const typeSessions = groupSessions(allSessions.filter(s => {
        if (s.classType !== type) return false;
        if (s.isRecurring) {
          return parseInt(s.dayOfWeek) === currentOverviewDay;
        }
        return s.date === targetDateStr;
      })).sort((a, b) => a.time.localeCompare(b.time));

      const totalEnrolled = typeSessions.reduce((acc, s) => acc + (s.students?.length || 0), 0);
      const totalSlots = typeSessions.length * 8;

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
                        <span>${enrolled}/8</span>
                      </div>
                      <div class="seating-map">
                        ${Array.from({ length: 8 }).map((_, i) => `
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
    const max = s.maxStudents || 8;
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
    pendingFreeStudents = [];

    document.getElementById('bookingError').classList.add('hidden');
    document.getElementById('bookingTitle').textContent = isTeacher ? 'Schedule Time Slot' : 'Book Free Session';

    const allUsers = await getUsers();
    const teachers = allUsers.filter(u => u.role === 'teacher');
    const teacherOptions = '<option value="">— Select teacher —</option>' +
      teachers.map(t => `<option value="${t.id}" ${t.id === user.id ? 'selected' : ''}>${t.name}</option>`).join('');

    const body = document.getElementById('bookingModalBody');

    if (isTeacher) {
      body.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label>Day of Week</label>
            <select id="sessionDay">
              <option value="1">Monday</option><option value="2">Tuesday</option>
              <option value="3">Wednesday</option><option value="4">Thursday</option>
              <option value="5">Friday</option><option value="6">Saturday</option>
              <option value="0">Sunday</option>
            </select>
          </div>
          <div class="form-group">
            <label>Start Time</label>
            <input type="time" id="sessionTime" value="09:00" />
          </div>
        </div>
        <div class="form-group">
          <label>Duration</label>
          <select id="sessionDuration">
            <option value="30">30 Min Class</option>
            <option value="60" selected>1 Hour Class</option>
            <option value="90">1.5 Hour Class</option>
            <option value="120">2 Hour Class</option>
          </select>
        </div>
        <div class="form-group">
          <label>Class Level</label>
          <div class="type-selector">
            <button class="type-btn active" onclick="selectClassType('Explorer', this)">Explorer</button>
            <button class="type-btn" onclick="selectClassType('Junior', this)">Junior</button>
            <button class="type-btn" onclick="selectClassType('Intro', this)">Intro</button>
          </div>
          <input type="hidden" id="sessionName" value="Explorer" />
          <input type="hidden" id="classType" value="Explorer" />
        </div>
        <div class="form-group">
          <label>Assign Teacher</label>
          <select id="sessionTeacher">${teacherOptions}</select>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="sessionNotes" rows="2" placeholder="e.g. Room change this week"></textarea>
        </div>
      `;
    } else {
      // Front desk / admin free session form
      body.innerHTML = `
        <div class="form-row">
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="sessionDate" value="${dateToStr(new Date())}" />
          </div>
          <div class="form-group">
            <label>Start Time</label>
            <input type="time" id="sessionTime" value="09:00" />
          </div>
        </div>
        <div class="form-group">
          <label>Duration (this will be the session name)</label>
          <select id="sessionDuration">
            <option value="60">1 Hour Session</option>
            <option value="120">2 Hour Session</option>
          </select>
          <input type="hidden" id="sessionName" value="1 Hour Session" />
          <input type="hidden" id="classType" value="Free" />
        </div>
        <div class="form-group">
          <label>Assign Teacher</label>
          <select id="sessionTeacher">${teacherOptions}</select>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="sessionNotes" rows="2" placeholder="e.g. John will be 10 mins late"></textarea>
        </div>
        <hr style="border:none; border-top:1px solid var(--border); margin:1rem 0;" />
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
          <h4 style="font-size:0.9rem;">Students Attending</h4>
          <button class="btn-ghost small" onclick="addFreeStudent()">+ Add Student</button>
        </div>
        <div id="freeStudentList"></div>
        <p class="sub" style="font-size:0.75rem; margin-top:0.5rem;">Add all students. Students from the same parent can share parent details.</p>
      `;

      // Sync session name from duration
      document.getElementById('sessionDuration').addEventListener('change', function() {
        document.getElementById('sessionName').value = this.options[this.selectedIndex].text;
      });

      // Add first student row
      addFreeStudent();
    }

    document.getElementById('bookingModal').classList.remove('hidden');
  };

  // Free session student entries
  let pendingFreeStudents = [];

  window.addFreeStudent = function() {
    pendingFreeStudents.push({});
    renderFreeStudentList();
  };

  window.removeFreeStudent = function(idx) {
    pendingFreeStudents.splice(idx, 1);
    renderFreeStudentList();
  };

  function renderFreeStudentList() {
    const container = document.getElementById('freeStudentList');
    if (!container) return;
    if (pendingFreeStudents.length === 0) {
      container.innerHTML = '<p class="sub">No students added yet.</p>';
      return;
    }
    container.innerHTML = pendingFreeStudents.map((_, i) => `
      <div class="free-student-entry" style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:1rem; margin-bottom:0.8rem; position:relative;">
        <button class="remove-btn" onclick="removeFreeStudent(${i})" style="position:absolute; top:8px; right:8px;">✕</button>
        <div class="form-row">
          <div class="form-group">
            <label>Student Name</label>
            <input type="text" id="freeStName_${i}" placeholder="e.g. Liam Smith" />
          </div>
          <div class="form-group">
            <label>Age</label>
            <input type="number" id="freeStAge_${i}" min="1" max="100" placeholder="e.g. 10" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Parent Name</label>
            <input type="text" id="freeStParent_${i}" placeholder="e.g. Michael Smith" ${i > 0 ? 'placeholder="Same as above or different"' : ''} />
          </div>
          <div class="form-group">
            <label>Parent Phone</label>
            <input type="tel" id="freeStPhone_${i}" placeholder="e.g. 082 123 4567" />
          </div>
        </div>
        <div class="form-group">
          <label>Parent Email</label>
          <input type="email" id="freeStEmail_${i}" placeholder="e.g. michael@example.com" />
        </div>
      </div>
    `).join('');
  }



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

  function collectFreeStudents() {
    const results = [];
    const entries = document.querySelectorAll('#freeStudentList .free-student-entry');
    entries.forEach((_, i) => {
      const name = (document.getElementById(`freeStName_${i}`)?.value || '').trim();
      if (name) {
        results.push({
          id: 'fs_' + Math.random().toString(36).substr(2, 6),
          name,
          age: document.getElementById(`freeStAge_${i}`)?.value || '',
          parentName: document.getElementById(`freeStParent_${i}`)?.value || '',
          parentPhone: document.getElementById(`freeStPhone_${i}`)?.value || '',
          parentEmail: document.getElementById(`freeStEmail_${i}`)?.value || ''
        });
      }
    });
    return results;
  }

  window.saveBooking = async function () {
    const isTeacher = user.role === 'teacher';
    const time = document.getElementById('sessionTime').value;
    const duration = parseInt(document.getElementById('sessionDuration').value);
    const name = document.getElementById('sessionName').value.trim();
    const teacherId = document.getElementById('sessionTeacher').value;
    const notes = (document.getElementById('sessionNotes')?.value || '').trim();

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
      maxStudents: isTeacher ? 8 : 8,
      teacherId,
      teacherName,
      notes,
      students: isTeacher ? [...pendingStudents] : collectFreeStudents(),
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };



    const sessions = await getSessions();
    
    // Duplicate check for Teachers (Recurring slots)
    if (isTeacher) {
      const exists = sessions.find(s => 
        s.isRecurring && 
        s.classType === session.classType && 
        s.dayOfWeek === session.dayOfWeek && 
        s.time === session.time
      );
      if (exists) {
        errEl.textContent = 'This time slot already exists. Please edit the existing slot instead.';
        errEl.classList.remove('hidden');
        return;
      }
    }

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
      maxStudents: isTeacher ? 8 : maxStudents,
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
    await deleteSessionById(currentDetailId);
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
    await deleteUserById(id);
    renderAdminPanel();
  };

  // ── Init ──────────────────────────────────────────────────

  renderCalendar();
}
