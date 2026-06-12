// ============================================================
//  ClassFlow — app.js
//  Handles auth, state, calendar rendering, booking logic
// ============================================================

// ── Supabase Configuration ─────────────────────────────────────
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
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
    const labels = { frontdesk: '🗓️ Front Desk', teacher: '📚 Teacher', admin: '⚙️ Admin', viewer: '👁️ Viewer', class: '🏫 Classroom' };
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
    const email = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    
    if (!selectedRole) return;

    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        document.getElementById('loginError').textContent = error.message;
        document.getElementById('loginError').classList.remove('hidden');
        return;
      }

      // Login successful, now fetch or create the profile
      let { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single();

      if (!profile) {
        // Migration/New User: Link by email if profile exists with email as username
        const { data: oldProfile } = await sb.from('profiles').select('*').eq('username', email.toLowerCase()).single();
        
        if (oldProfile) {
          // Update the ID to match the Auth ID
          await sb.from('profiles').update({ id: data.user.id }).eq('username', email.toLowerCase());
          profile = { ...oldProfile, id: data.user.id };
        } else {
          // Create new profile for this Auth user
          const newProfile = {
            id: data.user.id,
            name: email.split('@')[0],
            username: email.toLowerCase(),
            role: selectedRole
          };
          await sb.from('profiles').insert(newProfile);
          profile = newProfile;
        }
      }

      if (profile && (profile.role === selectedRole || user?.role === 'admin')) {
        setCurrentUser(profile);
        window.location.href = 'dashboard.html';
      } else {
        document.getElementById('loginError').textContent = 'Account exists but is not assigned the ' + selectedRole + ' role.';
        document.getElementById('loginError').classList.remove('hidden');
        await sb.auth.signOut();
      }
    } catch (err) {
      console.error('Auth error:', err);
      document.getElementById('loginError').textContent = 'An unexpected error occurred.';
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
    user.role === 'frontdesk' ? 'Front Desk' :
    user.role === 'class' ? '🏫 Classroom' :
    user.role.charAt(0).toUpperCase() + user.role.slice(1);
  document.getElementById('sidebarAvatar').textContent = user.name.charAt(0).toUpperCase();

  // Role-specific UI
  if (user.role === 'admin') {
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) navAdmin.style.display = 'flex';
  }

  // Front desk and viewer cannot register students
  if (user.role === 'frontdesk' || user.role === 'viewer' || user.role === 'class') {
    const regBtn = document.getElementById('registerStudentBtn');
    if (regBtn) regBtn.style.display = 'none';
  }

  if (user.role === 'viewer' || user.role === 'class') {
    const b1 = document.getElementById('bookBtn');
    if (b1) b1.style.display = 'none';
    const b2 = document.getElementById('bookBtn2');
    if (b2) b2.style.display = 'none';
    const sub = document.getElementById('viewSub');
    if (sub) sub.textContent = user.role === 'class' ? 'Classroom calendar view' : 'Weekly class schedule (View Only)';
  } else if (user.role === 'teacher') {
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
      if (view === 'infoboard') renderInfoBoard();
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

      const actionButtons = user.role === 'viewer' ? '' : `
            <div style="position: absolute; top: 0; right: 0; display: flex; gap: 4px;">
              <button class="remove-btn" onclick="openEditStudentModal('${s.id}')" title="Edit Student" style="background: var(--surface-3); border: 1px solid var(--border);">✎</button>
              <button class="remove-btn" onclick="openArchiveModal('${s.id}')" title="Archive Student">✕</button>
            </div>
      `;

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
            ${actionButtons}
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



  window.logout = async function () {
    if (sb) await sb.auth.signOut();
    sessionStorage.removeItem('cf_current_user');
    window.location.href = 'index.html';
  };

  // ── Calendar ──────────────────────────────────────────────

  let currentCalendarView = 'week';

  window.setCalendarView = function(view) {
    currentCalendarView = view;
    document.getElementById('viewWeekBtn').classList.toggle('active', view === 'week');
    document.getElementById('viewMonthBtn').classList.toggle('active', view === 'month');
    
    // Switch main label
    const sub = document.getElementById('viewSub');
    if (user.role === 'viewer') {
      sub.textContent = view === 'week' ? 'Weekly class schedule (View Only)' : 'Monthly class schedule (View Only)';
    } else if (user.role === 'teacher') {
      sub.textContent = view === 'week' ? 'Manage your weekly recurring time slots' : 'Manage your monthly schedule';
    } else {
      sub.textContent = view === 'week' ? 'Weekly class schedule' : 'Monthly class schedule';
    }

    renderCalendar();
  };

  window.shiftCalendar = function (dir) {
    if (dir === 0) {
      currentWeekMonday = getMondayOf(new Date());
    } else {
      if (currentCalendarView === 'week') {
        currentWeekMonday.setDate(currentWeekMonday.getDate() + dir * 7);
      } else {
        // Shift by actual calendar month, snapping back to Monday
        let targetMonth = new Date(currentWeekMonday);
        targetMonth.setDate(targetMonth.getDate() + 15); // Move into middle of current view
        targetMonth.setMonth(targetMonth.getMonth() + dir);
        targetMonth.setDate(1); // First day of that new month
        currentWeekMonday = getMondayOf(targetMonth);
      }
    }
    renderCalendar();
  };

  function renderCalendar() {
    getSessions().then(sessions => {
      const grid = document.getElementById('calendarGrid');
      grid.className = `calendar-grid ${currentCalendarView === 'month' ? 'month-view' : ''}`;
      
      const daysToRender = currentCalendarView === 'week' ? 7 : 35; // 5 weeks covers most months

      // Build days
      const days = [];
      for (let i = 0; i < daysToRender; i++) {
        const d = new Date(currentWeekMonday);
        d.setDate(d.getDate() + i);
        days.push(d);
      }

      const startStr = dateToStr(days[0]);
      const endStr = dateToStr(days[days.length - 1]);
      
      if (currentCalendarView === 'week') {
        document.getElementById('weekLabel').textContent = `${formatDate(startStr)} — ${formatDate(endStr)}`;
      } else {
        // For month view, label is the Month and Year of the middle date
        const midDate = days[Math.floor(days.length / 2)];
        document.getElementById('weekLabel').textContent = midDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
      }

      // Filter sessions for this visible range
      const visibleSessions = sessions.filter(s => {
        if (s.isRecurring) return true; // Recurring shows every week
        return s.date >= startStr && s.date <= endStr;
      });

      const today = dateToStr(new Date());

      grid.innerHTML = days.map((d, i) => {
        const ds = dateToStr(d);
        const daySessions = groupSessions(visibleSessions
          .filter(s => {
            if (s.isRecurring) {
              return parseInt(s.dayOfWeek) === d.getDay();
            }
            return s.date === ds;
          }))
          .sort((a, b) => {
            // Free sessions always float to the top regardless of time
            if (a.classType === 'Free' && b.classType !== 'Free') return -1;
            if (b.classType === 'Free' && a.classType !== 'Free') return 1;
            return a.time.localeCompare(b.time);
          });

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
      renderUpcomingFreeSessions(sessions);
    });
  }

  function renderUpcomingFreeSessions(sessions) {
    const container = document.getElementById('upcomingFreePanel');
    if (!container) return;

    const today = dateToStr(new Date());
    const now = new Date();
    // Collect all free sessions this month (one-off) or recurring this week
    const weekStart = dateToStr(currentWeekMonday);
    const weekEnd = new Date(currentWeekMonday);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = dateToStr(weekEnd);

    const freeSessions = sessions.filter(s => {
      if (s.classType !== 'Free') return false;
      if (s.isRecurring) return true; // recurring free sessions show always
      return s.date >= today; // upcoming one-off free sessions
    });

    if (freeSessions.length === 0) {
      container.innerHTML = '';
      return;
    }

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const chips = freeSessions.slice(0, 8).map(s => {
      let label;
      if (s.isRecurring) {
        label = `${days[s.dayOfWeek]} @ ${formatTime(s.time)}`;
      } else {
        label = `${formatDate(s.date)} @ ${formatTime(s.time)}`;
      }
      const enrolled = s.students ? s.students.length : 0;
      return `<span class="upcoming-free-chip" onclick="openDetailModal('${s.id}')" title="Click to view details">🟠 ${label} · ${enrolled} student${enrolled !== 1 ? 's' : ''}</span>`;
    }).join('');

    container.innerHTML = `
      <div class="upcoming-free-header">📅 Free Sessions this week/upcoming</div>
      <div class="upcoming-free-list">${chips}</div>
    `;
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
    const isFreeSession = typeClass === 'Free';

    return `
      <div class="session-card slim ${full ? 'full' : ''} ${isRecurring ? 'recurring' : 'one-off'} ${isFreeSession ? 'free-session' : ''}" onclick="openDetailModal('${s.id}')">
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
    // Include admins and teachers in the teacher/assignee dropdown
    const assignable = allUsers.filter(u => u.role === 'teacher' || u.role === 'admin');
    const teacherOptions = assignable.map(t => `<option value="${t.id}" ${t.id === user.id ? 'selected' : ''}>${t.name}</option>`).join('');

    const body = document.getElementById('bookingModalBody');

    if (isTeacher) {
      body.innerHTML = `
        <div class="form-group">
          <label>Session Type</label>
          <div class="type-selector">
            <button class="type-btn active" onclick="selectClassType('Explorer', this)">Explorer</button>
            <button class="type-btn" onclick="selectClassType('Junior', this)">Junior</button>
            <button class="type-btn" onclick="selectClassType('Intro', this)">Intro</button>
            <button class="type-btn" onclick="selectClassType('Event', this)">Event</button>
          </div>
          <input type="hidden" id="sessionName" value="Explorer" />
          <input type="hidden" id="classType" value="Explorer" />
        </div>
        <div id="eventRecurringToggle" style="display:none">
          <div class="form-group">
            <label>Frequency</label>
            <div class="type-selector">
              <button class="type-btn active" onclick="selectEventFrequency('recurring', this)">Recurring (Weekly)</button>
              <button class="type-btn" onclick="selectEventFrequency('once', this)">One-Off</button>
            </div>
            <input type="hidden" id="eventFrequency" value="recurring" />
          </div>
        </div>
        <div id="scheduleDayRow">
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
        </div>
        <div id="scheduleDateRow" style="display:none">
          <div class="form-row">
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="sessionDate" value="${dateToStr(new Date())}" />
            </div>
            <div class="form-group">
              <label>Start Time</label>
              <input type="time" id="sessionTimeAlt" value="09:00" />
            </div>
          </div>
        </div>
        <div id="durationStandard">
          <div class="form-group">
            <label>Duration</label>
            <select id="sessionDuration">
              <option value="30">30 Min Class</option>
              <option value="60" selected>1 Hour Class</option>
              <option value="90">1.5 Hour Class</option>
              <option value="120">2 Hour Class</option>
            </select>
          </div>
        </div>
        <div id="durationFlexible" style="display:none">
          <div class="form-group">
            <label>Duration (minutes)</label>
            <input type="number" id="sessionDurationCustom" value="60" min="15" max="480" step="15" />
            <p class="sub" style="font-size:0.7rem; margin-top:4px;">Enter any duration in minutes (e.g. 45, 90, 180)</p>
          </div>
        </div>
        <div class="form-group">
          <label>Event Name / Description</label>
          <input type="text" id="eventDescription" placeholder="e.g. Staff Training, Parent Meeting" style="display:none" />
        </div>
        <div class="form-group">
          <label>Assign Teacher(s)</label>
          <select id="sessionTeacher" multiple style="height: 80px; padding: 4px;">${teacherOptions}</select>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="sessionNotes" rows="2" placeholder="e.g. Room change this week"></textarea>
        </div>
      `;
    } else {
      // Front desk / admin booking form — now also supports Events
      body.innerHTML = `
        <div class="form-group">
          <label>Session Type</label>
          <div class="type-selector">
            <button class="type-btn active" onclick="selectAdminClassType('Free', this)">Free Session</button>
            <button class="type-btn" onclick="selectAdminClassType('Event', this)">Event</button>
          </div>
          <input type="hidden" id="classType" value="Free" />
        </div>
        <div id="eventRecurringToggle" style="display:none">
          <div class="form-group">
            <label>Frequency</label>
            <div class="type-selector">
              <button class="type-btn active" onclick="selectEventFrequency('once', this)">One-Off</button>
              <button class="type-btn" onclick="selectEventFrequency('recurring', this)">Recurring (Weekly)</button>
            </div>
            <input type="hidden" id="eventFrequency" value="once" />
          </div>
        </div>
        <div id="scheduleDateRow">
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
        </div>
        <div id="scheduleDayRow" style="display:none">
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
              <input type="time" id="sessionTimeAlt" value="09:00" />
            </div>
          </div>
        </div>
        <div id="durationStandard">
          <div class="form-group">
            <label>Duration</label>
            <select id="sessionDuration">
              <option value="60">1 Hour Session</option>
              <option value="120">2 Hour Session</option>
            </select>
            <input type="hidden" id="sessionName" value="1 Hour Session" />
          </div>
        </div>
        <div id="durationFlexible" style="display:none">
          <div class="form-group">
            <label>Duration (minutes)</label>
            <input type="number" id="sessionDurationCustom" value="60" min="15" max="480" step="15" />
            <p class="sub" style="font-size:0.7rem; margin-top:4px;">Enter any duration in minutes (e.g. 45, 90, 180)</p>
          </div>
        </div>
        <div id="eventDescriptionGroup" style="display:none">
          <div class="form-group">
            <label>Event Name / Description</label>
            <input type="text" id="eventDescription" placeholder="e.g. Staff Training, Parent Meeting" />
          </div>
        </div>
        <div class="form-group">
          <label>Assign Teacher(s)</label>
          <select id="sessionTeacher" multiple style="height: 80px; padding: 4px;">${teacherOptions}</select>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="sessionNotes" rows="2" placeholder="e.g. John will be 10 mins late"></textarea>
        </div>
        <div id="freeSessionStudents">
          <hr style="border:none; border-top:1px solid var(--border); margin:1rem 0;" />
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
            <h4 style="font-size:0.9rem;">Students Attending</h4>
            <button class="btn-ghost small" onclick="addFreeStudent()">+ Add Student</button>
          </div>
          <div id="freeStudentList"></div>
          <p class="sub" style="font-size:0.75rem; margin-top:0.5rem;">Add all students. Students from the same parent can share parent details.</p>
        </div>
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

    const isEvent = type === 'Event';
    // Toggle Event-specific fields
    const evtToggle = document.getElementById('eventRecurringToggle');
    if (evtToggle) evtToggle.style.display = isEvent ? '' : 'none';
    const durStd = document.getElementById('durationStandard');
    if (durStd) durStd.style.display = isEvent ? 'none' : '';
    const durFlex = document.getElementById('durationFlexible');
    if (durFlex) durFlex.style.display = isEvent ? '' : 'none';
    const evtDesc = document.getElementById('eventDescription');
    if (evtDesc) evtDesc.style.display = isEvent ? '' : 'none';

    // If switching to Event, reset frequency to recurring (teacher default)
    if (isEvent) {
      const freqEl = document.getElementById('eventFrequency');
      if (freqEl) freqEl.value = 'recurring';
    }
  };

  window.selectAdminClassType = function (type, btn) {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('classType').value = type;

    const isEvent = type === 'Event';
    const evtToggle = document.getElementById('eventRecurringToggle');
    if (evtToggle) evtToggle.style.display = isEvent ? '' : 'none';
    const durStd = document.getElementById('durationStandard');
    if (durStd) durStd.style.display = isEvent ? 'none' : '';
    const durFlex = document.getElementById('durationFlexible');
    if (durFlex) durFlex.style.display = isEvent ? '' : 'none';
    const evtDescGrp = document.getElementById('eventDescriptionGroup');
    if (evtDescGrp) evtDescGrp.style.display = isEvent ? '' : 'none';
    const freeStudents = document.getElementById('freeSessionStudents');
    if (freeStudents) freeStudents.style.display = isEvent ? 'none' : '';

    // If switching back from Event to Free, ensure date row shows
    if (!isEvent) {
      const dateRow = document.getElementById('scheduleDateRow');
      if (dateRow) dateRow.style.display = '';
      const dayRow = document.getElementById('scheduleDayRow');
      if (dayRow) dayRow.style.display = 'none';
    }
  };

  window.selectEventFrequency = function (freq, btn) {
    const parent = btn.closest('.type-selector');
    parent.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const freqEl = document.getElementById('eventFrequency');
    if (freqEl) freqEl.value = freq;

    const isRecurring = freq === 'recurring';
    const dayRow = document.getElementById('scheduleDayRow');
    const dateRow = document.getElementById('scheduleDateRow');
    if (dayRow) dayRow.style.display = isRecurring ? '' : 'none';
    if (dateRow) dateRow.style.display = isRecurring ? 'none' : '';
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
    const classType = document.getElementById('classType').value;
    const isEvent = classType === 'Event';
    const teacherSelect = document.getElementById('sessionTeacher');
    const teacherIds = teacherSelect ? Array.from(teacherSelect.selectedOptions).map(opt => opt.value).filter(v => v) : [];
    const notes = (document.getElementById('sessionNotes')?.value || '').trim();
    const errEl = document.getElementById('bookingError');

    // Determine frequency: for Events check the toggle; for teachers default recurring; for admin/frontdesk default one-off
    const freqEl = document.getElementById('eventFrequency');
    let isRecurring;
    if (isEvent && freqEl) {
      isRecurring = freqEl.value === 'recurring';
    } else {
      isRecurring = isTeacher;
    }

    // Get time from whichever row is visible
    let time = document.getElementById('sessionTime')?.value || '';
    const timeAlt = document.getElementById('sessionTimeAlt')?.value || '';
    if (!time && timeAlt) time = timeAlt;
    // If recurring shows dayRow with sessionTimeAlt visible, prefer it if primary is hidden
    if (isRecurring && document.getElementById('scheduleDayRow')?.style.display !== 'none') {
      // sessionTime is in dayRow for teacher, sessionTimeAlt in dateRow
      const dayRowTime = document.getElementById('sessionTime')?.value;
      if (dayRowTime) time = dayRowTime;
    }
    if (!isRecurring && document.getElementById('scheduleDateRow')?.style.display !== 'none') {
      const dateRowTime = document.getElementById('sessionTime')?.value || document.getElementById('sessionTimeAlt')?.value;
      if (dateRowTime) time = dateRowTime;
    }

    // Duration: flexible for events, standard otherwise
    let duration;
    if (isEvent) {
      const customDur = document.getElementById('sessionDurationCustom');
      duration = customDur ? parseInt(customDur.value) : 60;
    } else {
      duration = parseInt(document.getElementById('sessionDuration').value);
    }

    // Name: for events use description, for teacher classes use classType, for free sessions use duration label
    let name;
    if (isEvent) {
      const evtDesc = document.getElementById('eventDescription');
      name = evtDesc ? evtDesc.value.trim() : 'Event';
      if (!name) name = 'Event';
    } else {
      name = document.getElementById('sessionName').value.trim();
    }

    let date = null;
    let dayOfWeek = null;

    if (isRecurring) {
      const dayEl = document.getElementById('sessionDay');
      dayOfWeek = dayEl ? parseInt(dayEl.value) : 1;
    } else {
      const dateEl = document.getElementById('sessionDate');
      date = dateEl ? dateEl.value : null;
    }

    if ((!isRecurring && !date) || !time || !name) {
      errEl.textContent = 'Please fill in all required fields.';
      errEl.classList.remove('hidden');
      return;
    }

    const allUsers = await getUsers();
    const teacherName = teacherIds.length > 0
      ? teacherIds.map(id => allUsers.find(u => u.id === id)?.name).filter(n => n).join(', ')
      : '';

    const session = {
      id: uid(),
      classType,
      isRecurring,
      dayOfWeek,
      date,
      time,
      duration,
      name,
      maxStudents: isEvent ? 0 : 8,
      teacherId: teacherIds.join(','),
      teacherIds: teacherIds,
      teacherName,
      notes,
      students: isEvent ? [] : (isTeacher ? [...pendingStudents] : collectFreeStudents()),
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    const sessions = await getSessions();
    
    // Duplicate check for recurring slots
    if (isRecurring) {
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

    const isEvent = s.classType === 'Event';
    const capacityHTML = isEvent ? `
        <div class="detail-item">
          <span class="detail-label">👥 Capacity</span>
          <span>Event (No Students)</span>
        </div>
    ` : `
        <div class="detail-item">
          <span class="detail-label">👥 Capacity</span>
          <span>${enrolled} / ${s.maxStudents} students</span>
        </div>
    `;

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
        ${capacityHTML}
      </div>
      ${s.notes ? `
        <div class="detail-notes">
          <h4>Admin/Front Desk Notes</h4>
          <p>${s.notes}</p>
        </div>
      ` : ''}
      ${isEvent ? '' : `
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
      `}
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
    const assignable = allUsers.filter(u => u.role === 'teacher' || u.role === 'admin');
    const teacherOptions = assignable.map(t => {
      const isSelected = s.teacherIds ? s.teacherIds.includes(t.id) : (s.teacherId && s.teacherId.includes(t.id));
      return `<option value="${t.id}" ${isSelected ? 'selected' : ''}>${t.name}</option>`;
    }).join('');

    const isTeacher = user.role === 'teacher';
    const types = ['Explorer', 'Junior', 'Intro', 'Event'];
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
        ${s.classType === 'Event' ? '' : `
        <div class="form-group">
          <label>Max Students</label>
          <input type="number" id="editMax" value="${s.maxStudents}" min="1" max="50" />
        </div>
        `}
        <div class="form-group">
          <label>Teacher(s)</label>
          <select id="editTeacher" multiple style="height: 80px; padding: 4px;">
            ${teacherOptions}
          </select>
        </div>

        <div class="form-group">
          <label>Admin/Front Desk Notes</label>
          <textarea id="editNotes" rows="2">${s.notes || ''}</textarea>
        </div>
        
        <!-- Students Section in Edit -->
        ${s.classType === 'Event' ? '' : s.classType === 'Free' ? `
        <div id="freeSessionStudentsEdit">
          <hr style="border:none; border-top:1px solid var(--border); margin:1rem 0;" />
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
            <h4 style="font-size:0.9rem;">Students Attending</h4>
            <button class="btn-ghost small" onclick="addFreeStudentEdit()">+ Add Student</button>
          </div>
          <div id="freeStudentListEdit"></div>
        </div>
        ` : `
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
        `}


        <div id="editError" class="error-msg hidden"></div>
      </div>
    `;

    if (s.classType === 'Free') {
      renderFreeStudentListEdit();
    } else if (s.classType !== 'Event') {
      renderStudentListEdit();
      populateStudentDropdown('editStudentSelect');
    }


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
    const maxStudentsEl = document.getElementById('editMax');
    const maxStudents = maxStudentsEl ? parseInt(maxStudentsEl.value) : 8;
    const teacherSelect = document.getElementById('editTeacher');
    const teacherIds = teacherSelect ? Array.from(teacherSelect.selectedOptions).map(opt => opt.value).filter(v => v) : [];
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
    const teacherName = teacherIds.length > 0
      ? teacherIds.map(id => allUsers.find(u => u.id === id)?.name).filter(n => n).join(', ')
      : '';

    const isTeacher = user.role === 'teacher';
    const finalDate = (isTeacher || !date) ? null : date;
    const finalClassType = document.getElementById('editClassType')?.value || sessions[idx].classType;
    const isEvent = finalClassType === 'Event';

    let updatedStudents = [];
    if (isEvent) {
      updatedStudents = [];
    } else if (finalClassType === 'Free') {
      updatedStudents = collectFreeStudentsEdit();
    } else {
      updatedStudents = [...pendingStudents];
    }

    // Update session
    sessions[idx] = {
      ...sessions[idx],
      name,
      classType: finalClassType,
      date: finalDate,
      time,
      duration,
      maxStudents: isTeacher ? 8 : maxStudents,
      teacherId: teacherIds.join(','),
      teacherIds: teacherIds,
      teacherName,
      notes,
      students: updatedStudents
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

  window.addFreeStudentEdit = function() {
    pendingStudents.push({});
    renderFreeStudentListEdit();
  };

  window.removeFreeStudentEdit = function(idx) {
    pendingStudents.splice(idx, 1);
    renderFreeStudentListEdit();
  };

  function renderFreeStudentListEdit() {
    const container = document.getElementById('freeStudentListEdit');
    if (!container) return;
    if (pendingStudents.length === 0) {
      container.innerHTML = '<p class="sub">No students added yet.</p>';
      return;
    }
    container.innerHTML = pendingStudents.map((st, i) => `
      <div class="free-student-entry" style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:1rem; margin-bottom:0.8rem; position:relative;">
        <button class="remove-btn" onclick="removeFreeStudentEdit(${i})" style="position:absolute; top:8px; right:8px;">✕</button>
        <div class="form-row">
          <div class="form-group">
            <label>Student Name</label>
            <input type="text" id="editStName_${i}" value="${st.name || ''}" placeholder="e.g. Liam Smith" />
          </div>
          <div class="form-group">
            <label>Age</label>
            <input type="number" id="editStAge_${i}" value="${st.age || ''}" min="1" max="100" placeholder="e.g. 10" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Parent Name</label>
            <input type="text" id="editStParent_${i}" value="${st.parentName || ''}" placeholder="e.g. Michael Smith" />
          </div>
          <div class="form-group">
            <label>Parent Phone</label>
            <input type="tel" id="editStPhone_${i}" value="${st.parentPhone || ''}" placeholder="e.g. 082 123 4567" />
          </div>
        </div>
        <div class="form-group">
          <label>Parent Email</label>
          <input type="email" id="editStEmail_${i}" value="${st.parentEmail || ''}" placeholder="e.g. michael@example.com" />
        </div>
      </div>
    `).join('');
  }

  function collectFreeStudentsEdit() {
    const results = [];
    const entries = document.querySelectorAll('#freeStudentListEdit .free-student-entry');
    entries.forEach((_, i) => {
      const name = (document.getElementById(`editStName_${i}`)?.value || '').trim();
      if (name) {
        results.push({
          id: pendingStudents[i]?.id || ('fs_' + Math.random().toString(36).substr(2, 6)),
          name,
          age: document.getElementById(`editStAge_${i}`)?.value || '',
          parentName: document.getElementById(`editStParent_${i}`)?.value || '',
          parentPhone: document.getElementById(`editStPhone_${i}`)?.value || '',
          parentEmail: document.getElementById(`editStEmail_${i}`)?.value || ''
        });
      }
    });
    return results;
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
          <div class="user-meta">@${u.username} · ${u.role === 'teacher' ? '📚 Teacher' : u.role === 'viewer' ? '👁️ Viewer' : u.role === 'class' ? '🏫 Classroom' : '🗓️ Front Desk'}</div>
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

    if (password.length < 6) {
      msgEl.textContent = 'Password must be at least 6 characters.';
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

    // Create Supabase Auth account + profile in one step
    if (sb && !SUPABASE_URL.includes('YOUR')) {
      msgEl.textContent = 'Creating account...';
      msgEl.className = 'success-msg';
      msgEl.classList.remove('hidden');

      try {
        // 1. Sign up in Supabase Auth (email = username)
        const { data: authData, error: authError } = await sb.auth.signUp({
          email: username,
          password: password,
          options: { data: { display_name: name } }
        });

        if (authError) {
          msgEl.textContent = 'Auth error: ' + authError.message;
          msgEl.className = 'error-msg';
          return;
        }

        const authUserId = authData.user?.id;
        if (!authUserId) {
          msgEl.textContent = 'Error: Could not get user ID from auth.';
          msgEl.className = 'error-msg';
          return;
        }

        // 2. Insert profile with the Auth UUID
        const { error: profileError } = await sb.from('profiles').insert({
          id: authUserId,
          name: name,
          username: username,
          role: role
        });

        if (profileError) {
          console.error('Profile insert error:', profileError);
          msgEl.textContent = 'Auth account created but profile error: ' + profileError.message;
          msgEl.className = 'error-msg';
          return;
        }

        // 3. Re-authenticate as admin (signUp may have switched the session)
        const currentUser = getCurrentUser();
        if (currentUser && currentUser.username) {
          await sb.auth.signInWithPassword({
            email: currentUser.username,
            password: 'sheen'
          });
        }

      } catch (err) {
        console.error('createUser error:', err);
        msgEl.textContent = 'Unexpected error: ' + err.message;
        msgEl.className = 'error-msg';
        return;
      }
    } else {
      // Fallback for localStorage mode
      users.push({ id: uid(), name, username, password, role });
      await saveUsers(users);
    }

    msgEl.textContent = `✓ Account created for ${name}`;
    msgEl.className = 'success-msg';
    msgEl.classList.remove('hidden');

    document.getElementById('newUserName').value = '';
    document.getElementById('newUsername').value = '';
    document.getElementById('newUserPass').value = '';

    renderAdminPanel();
    setTimeout(() => msgEl.classList.add('hidden'), 5000);
  };

  window.deleteUser = async function (id) {
    if (!confirm('Delete this user?')) return;
    await deleteUserById(id);
    renderAdminPanel();
  };

  // ── Message Board ──────────────────────────────────────────
  async function getMessages() {
    if (!sb || SUPABASE_URL.includes('YOUR')) {
      const raw = localStorage.getItem('cf_messages');
      return raw ? JSON.parse(raw) : [];
    }
    const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: true });
    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
    return data || [];
  }

  async function saveMessage(content) {
    const newMessage = {
      content,
      author_name: user ? user.name : 'Unknown User',
      created_at: new Date().toISOString()
    };
    if (!sb || SUPABASE_URL.includes('YOUR')) {
      const raw = localStorage.getItem('cf_messages');
      const msgs = raw ? JSON.parse(raw) : [];
      msgs.unshift(newMessage);
      localStorage.setItem('cf_messages', JSON.stringify(msgs));
      return;
    }
    const { error } = await sb.from('messages').insert([newMessage]);
    if (error) {
      console.error('Error saving message:', error);
    }
  }

  window.openMessageModal = async function() {
    document.getElementById('messageModal').classList.remove('hidden');
    await renderMessages();
    // Always scroll to bottom (latest messages) when the modal opens
    const listEl = document.getElementById('messageList');
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  };

  window.closeMessageModal = function() {
    document.getElementById('messageModal').classList.add('hidden');
  };

  async function renderMessages() {
    const messages = await getMessages();
    const listEl = document.getElementById('messageList');
    if (!listEl) return;

    // Remember if user was near the bottom before re-render
    const isNearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
    const wasEmpty = listEl.innerHTML.trim() === '';

    listEl.innerHTML = messages.map(msg => {
      const isOwn = user && msg.author_name === user.name;
      const timeStr = new Date(msg.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(msg.created_at).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
      return `
        <div class="message-bubble ${isOwn ? 'own' : ''}">
          <div class="message-meta">
            <span>${msg.author_name}</span>
            <span>${dateStr} @ ${timeStr}</span>
          </div>
          <div class="message-body">${msg.content}</div>
        </div>
      `;
    }).join('');

    // Always scroll to bottom on first open or if user was already at the bottom
    if (wasEmpty || isNearBottom) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  window.postNewMessage = async function() {
    const textEl = document.getElementById('newMessageText');
    if (!textEl) return;
    const content = textEl.value.trim();
    if (!content) return;

    await saveMessage(content);
    textEl.value = '';
    await renderMessages();
    await renderLatestMessage();
  };

  async function renderLatestMessage() {
    const messages = await getMessages();
    const authorEl = document.getElementById('latestMsgAuthor');
    const textEl = document.getElementById('latestMsgText');
    const timeEl = document.getElementById('latestMsgTime');

    if (!authorEl || !textEl || !timeEl) return;

    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      authorEl.textContent = latest.author_name;
      textEl.textContent = latest.content;
      const dateObj = new Date(latest.created_at);
      timeEl.textContent = dateObj.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }) + ' ' + dateObj.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    } else {
      authorEl.textContent = 'System';
      textEl.textContent = 'No messages posted yet. Be the first!';
      timeEl.textContent = '';
    }
  }

  // ── Init ──────────────────────────────────────────────────

  renderLatestMessage();
  renderCalendar();

  // ── INFO BOARD ───────────────────────────────────────────────────

  // Show role-specific Info Board buttons
  const canCreateTopic = user.role === 'teacher' || user.role === 'admin';
  const canAskQuestion = user.role === 'frontdesk' || user.role === 'admin';
  const newTopicBtn = document.getElementById('newTopicBtn');
  const askQuestionBtn = document.getElementById('askQuestionBtn');
  if (newTopicBtn && canCreateTopic) newTopicBtn.style.display = 'inline-flex';
  if (askQuestionBtn && canAskQuestion) askQuestionBtn.style.display = 'inline-flex';

  async function getInfoTopics() {
    // Always read from localStorage first as the primary cache
    const raw = localStorage.getItem('cf_info_topics');
    const localTopics = raw ? JSON.parse(raw) : [];

    if (!sb || SUPABASE_URL.includes('YOUR')) {
      return localTopics;
    }
    try {
      const { data, error } = await sb.from('info_topics').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const remoteTopics = data || [];
      // Merge: local-only items (not yet synced or Supabase-blocked) + remote items
      const remoteIds = new Set(remoteTopics.map(t => t.id));
      const localOnly = localTopics.filter(t => !remoteIds.has(t.id));
      const merged = [...localOnly, ...remoteTopics];
      // Update local cache with merged result
      localStorage.setItem('cf_info_topics', JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn('getInfoTopics Supabase error, using local cache:', e);
      return localTopics;
    }
  }

  async function saveInfoTopic(topic) {
    // Always write to localStorage first
    const raw = localStorage.getItem('cf_info_topics');
    const topics = raw ? JSON.parse(raw) : [];
    const idx = topics.findIndex(t => t.id === topic.id);
    if (idx >= 0) topics[idx] = topic; else topics.unshift(topic);
    localStorage.setItem('cf_info_topics', JSON.stringify(topics));
    // Attempt Supabase sync (non-blocking, failure is OK)
    if (!sb || SUPABASE_URL.includes('YOUR')) return;
    try { await sb.from('info_topics').upsert(topic); } catch (e) { console.warn('saveInfoTopic Supabase sync error (data saved locally):', e); }
  }

  async function getInfoPosts(topicId) {
    // Always read from localStorage first as the primary cache
    const raw = localStorage.getItem(`cf_info_posts_${topicId}`);
    const localPosts = raw ? JSON.parse(raw) : [];

    if (!sb || SUPABASE_URL.includes('YOUR')) {
      return localPosts;
    }
    try {
      const { data, error } = await sb.from('info_posts').select('*').eq('topic_id', topicId).order('created_at', { ascending: true });
      if (error) throw error;
      const remotePosts = data || [];
      // Merge: local-only posts + remote posts
      const remoteIds = new Set(remotePosts.map(p => p.id));
      const localOnly = localPosts.filter(p => !remoteIds.has(p.id));
      const merged = [...remotePosts, ...localOnly].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      // Update local cache
      localStorage.setItem(`cf_info_posts_${topicId}`, JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn('getInfoPosts Supabase error, using local cache:', e);
      return localPosts;
    }
  }

  async function saveInfoPost(post) {
    // Always write to localStorage first
    const raw = localStorage.getItem(`cf_info_posts_${post.topic_id}`);
    const posts = raw ? JSON.parse(raw) : [];
    // Avoid duplicates
    if (!posts.find(p => p.id === post.id)) posts.push(post);
    localStorage.setItem(`cf_info_posts_${post.topic_id}`, JSON.stringify(posts));
    // Attempt Supabase sync (non-blocking, failure is OK)
    if (!sb || SUPABASE_URL.includes('YOUR')) return;
    try { await sb.from('info_posts').insert(post); } catch (e) { console.warn('saveInfoPost Supabase sync error (data saved locally):', e); }
  }

  let currentTopicId = null;

  async function renderInfoBoard() {
    const topics = await getInfoTopics();
    const listEl = document.getElementById('infoBoardTopicList');
    if (!listEl) return;

    if (topics.length === 0) {
      listEl.innerHTML = `
        <div class="topic-list-item ${currentTopicId === 'general' ? 'active' : ''}" onclick="selectTopic('general')">
          <div class="topic-list-title">General Questions</div>
          <div class="topic-list-meta">System &nbsp;·&nbsp; Always open</div>
          <div class="topic-list-desc">Questions without a specific topic</div>
        </div>
        <div class="empty-state">
          <div style="font-size:2rem; margin-bottom:0.5rem;">📋</div>
          <p>No other topics yet.</p>
          ${canCreateTopic ? '<p class="sub">Click "+ New Topic" to get started.</p>' : '<p class="sub">Teachers will add topics here soon.</p>'}
        </div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="topic-list-item ${currentTopicId === 'general' ? 'active' : ''}" onclick="selectTopic('general')">
        <div class="topic-list-title">General Questions</div>
        <div class="topic-list-meta">System &nbsp;·&nbsp; Always open</div>
        <div class="topic-list-desc">Questions without a specific topic</div>
      </div>
    ` + topics.map(t => `
      <div class="topic-list-item ${currentTopicId === t.id ? 'active' : ''}" onclick="selectTopic('${t.id}')">
        <div class="topic-list-title">${t.title}</div>
        <div class="topic-list-meta">${t.author_name || 'Teacher'} &nbsp;·&nbsp; ${new Date(t.created_at).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</div>
        ${t.description ? `<div class="topic-list-desc">${t.description}</div>` : ''}
      </div>
    `).join('');
  }

  window.selectTopic = async function(topicId) {
    currentTopicId = topicId;
    await renderInfoBoard(); // Re-render topic list to update active state

    const topics = await getInfoTopics();
    const topic = topics.find(t => t.id === topicId) || (topicId === 'general' ? { id: 'general', title: 'General Questions', description: 'Questions without a specific topic', author_name: 'System' } : null);
    const posts = await getInfoPosts(topicId);

    const detailEl = document.getElementById('infoBoardDetail');
    if (!detailEl || !topic) return;

    const canPost = canCreateTopic;
    const canAnswer = canCreateTopic;

    const postsHtml = posts.length === 0
      ? '<p class="sub" style="padding: 1rem 0;">No posts or questions yet in this topic.</p>'
      : posts.map(p => {
          const isQuestion = p.is_question;
          const timeStr = new Date(p.created_at).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }) +
                          ' @ ' + new Date(p.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
          const actionButtons = [];
          if (isQuestion && canAnswer) {
            actionButtons.push(`<button class="btn-ghost small" onclick="openAnswerModal('${topicId}', '${p.id}')">✏️ Answer this</button>`);
          }
          if (user.role === 'admin' || user.role === 'teacher') {
            actionButtons.push(`<button class="btn-ghost small" onclick="editPost('${topicId}', '${p.id}')">✏️ Edit</button>`);
            actionButtons.push(`<button class="btn-ghost small" onclick="deletePost('${topicId}', '${p.id}')" style="color:var(--danger)">🗑️ Delete</button>`);
          }
          const actionsHtml = actionButtons.length > 0 ? `<div style="margin-top:8px; display:flex; gap:8px;">${actionButtons.join('')}</div>` : '';

          return `
            <div class="post-bubble ${isQuestion ? 'question' : 'info'}">
              <div class="post-bubble-header">
                ${isQuestion ? '<span class="question-badge">❓ Question</span>' : '<span class="info-badge">📌 Info</span>'}
                <span class="post-meta">${p.author_name || 'Staff'} &nbsp;·&nbsp; ${timeStr}</span>
              </div>
              <div class="post-body">${p.content.replace(/\n/g, '<br>')}</div>
              ${actionsHtml}
            </div>
          `;
        }).join('');

    detailEl.innerHTML = `
      <div class="topic-detail-header">
        <div>
          <h2 class="topic-detail-title">${topic.title}</h2>
          ${topic.description ? `<p class="view-sub">${topic.description}</p>` : ''}
          <p class="sub" style="font-size:11px; margin-top:4px;">Created by ${topic.author_name || 'Teacher'}</p>
        </div>
        <div style="display:flex; gap:8px;">
          ${topic.id !== 'general' && (user.role === 'admin' || user.role === 'teacher') ? `
            <button class="btn-ghost small" onclick="editTopic('${topicId}')">✏️ Edit</button>
            <button class="btn-ghost small" onclick="deleteTopic('${topicId}')" style="color:var(--danger)">🗑️ Delete</button>
          ` : ''}
          ${canPost ? `<button class="btn-ghost small" onclick="openPostModal('${topicId}')">📎 Post Update</button>` : ''}
        </div>
      </div>
      <div class="posts-thread">${postsHtml}</div>
    `;
  };

  window.deleteTopic = async function(topicId) {
    if (!confirm('Are you sure you want to delete this topic and all its posts?')) return;
    
    // Remove from localStorage
    const rawTopics = localStorage.getItem('cf_info_topics');
    if (rawTopics) {
      let topics = JSON.parse(rawTopics);
      topics = topics.filter(t => t.id !== topicId);
      localStorage.setItem('cf_info_topics', JSON.stringify(topics));
    }
    localStorage.removeItem(`cf_info_posts_${topicId}`);

    // Attempt Supabase delete (non-blocking)
    if (sb && !SUPABASE_URL.includes('YOUR')) {
      try {
        await sb.from('info_posts').delete().eq('topic_id', topicId);
        await sb.from('info_topics').delete().eq('id', topicId);
      } catch (e) { console.warn('deleteTopic Supabase error (removed locally):', e); }
    }
    
    if (currentTopicId === topicId) currentTopicId = 'general';
    await renderInfoBoard();
    selectTopic(currentTopicId);
  };

  window.editTopic = async function(topicId) {
    // Read from local cache directly to avoid Supabase-only lookup
    const raw = localStorage.getItem('cf_info_topics');
    const topics = raw ? JSON.parse(raw) : [];
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const newTitle = prompt('Edit Topic Title:', topic.title);
    if (!newTitle) return;
    const newDesc = prompt('Edit Topic Description:', topic.description || '');
    if (newDesc === null) return;

    topic.title = newTitle;
    topic.description = newDesc;
    
    await saveInfoTopic(topic);
    await renderInfoBoard();
    selectTopic(currentTopicId);
  };

  window.deletePost = async function(topicId, postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    // Remove from localStorage first
    const rawPosts = localStorage.getItem(`cf_info_posts_${topicId}`);
    if (rawPosts) {
      let posts = JSON.parse(rawPosts);
      posts = posts.filter(p => p.id !== postId);
      localStorage.setItem(`cf_info_posts_${topicId}`, JSON.stringify(posts));
    }

    // Attempt Supabase delete (non-blocking)
    if (sb && !SUPABASE_URL.includes('YOUR')) {
      try { await sb.from('info_posts').delete().eq('id', postId); }
      catch (e) { console.warn('deletePost Supabase error (removed locally):', e); }
    }

    selectTopic(topicId);
  };

  window.editPost = async function(topicId, postId) {
    // Read from localStorage directly
    const rawPosts = localStorage.getItem(`cf_info_posts_${topicId}`);
    const posts = rawPosts ? JSON.parse(rawPosts) : [];
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const newContent = prompt('Edit content:', post.content);
    if (!newContent) return;

    post.content = newContent;

    // Update localStorage first
    const idx = posts.findIndex(p => p.id === postId);
    if (idx !== -1) posts[idx] = post;
    localStorage.setItem(`cf_info_posts_${topicId}`, JSON.stringify(posts));

    // Attempt Supabase sync (non-blocking)
    if (sb && !SUPABASE_URL.includes('YOUR')) {
      try { await sb.from('info_posts').update({ content: newContent }).eq('id', postId); }
      catch (e) { console.warn('editPost Supabase sync error (saved locally):', e); }
    }

    selectTopic(topicId);
  };

  // ── Topic Modals ─────────────────────────────────────────────────

  window.openNewTopicModal = function() {
    document.getElementById('newTopicTitle').value = '';
    document.getElementById('newTopicDesc').value = '';
    document.getElementById('newTopicError').classList.add('hidden');
    document.getElementById('newTopicModal').classList.remove('hidden');
  };

  window.closeNewTopicModal = function() {
    document.getElementById('newTopicModal').classList.add('hidden');
  };

  window.saveNewTopic = async function() {
    const title = document.getElementById('newTopicTitle').value.trim();
    const desc = document.getElementById('newTopicDesc').value.trim();
    if (!title) {
      document.getElementById('newTopicError').classList.remove('hidden');
      return;
    }
    const topic = {
      id: 'tp_' + Math.random().toString(36).substr(2, 9),
      title,
      description: desc || null,
      author_id: user.id,
      author_name: user.name,
      created_at: new Date().toISOString()
    };
    await saveInfoTopic(topic);
    closeNewTopicModal();
    await renderInfoBoard();
    selectTopic(topic.id);
  };

  let _postTargetTopicId = null;

  window.openPostModal = function(topicId) {
    _postTargetTopicId = topicId;
    document.getElementById('postTopicContent').value = '';
    document.getElementById('postTopicError').classList.add('hidden');
    document.getElementById('postToTopicModal').classList.remove('hidden');
  };

  window.closePostModal = function() {
    document.getElementById('postToTopicModal').classList.add('hidden');
  };

  window.submitTopicPost = async function() {
    const content = document.getElementById('postTopicContent').value.trim();
    if (!content) {
      document.getElementById('postTopicError').classList.remove('hidden');
      return;
    }
    const post = {
      id: 'po_' + Math.random().toString(36).substr(2, 9),
      topic_id: _postTargetTopicId,
      content,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      is_question: false,
      created_at: new Date().toISOString()
    };
    await saveInfoPost(post);
    closePostModal();
    if (currentTopicId === _postTargetTopicId) selectTopic(_postTargetTopicId);
  };

  window.openAskQuestionModal = async function() {
    // Populate topic dropdown
    const topics = await getInfoTopics();
    const sel = document.getElementById('askQuestionTopicSel');
    sel.innerHTML = '<option value="">— Select a topic (Optional) —</option>' +
      topics.map(t => `<option value="${t.id}">${t.title}</option>`).join('');
    document.getElementById('askQuestionContent').value = '';
    document.getElementById('askQuestionError').classList.add('hidden');
    document.getElementById('askQuestionModal').classList.remove('hidden');
  };

  window.closeAskModal = function() {
    document.getElementById('askQuestionModal').classList.add('hidden');
  };

  window.submitQuestion = async function() {
    let topicId = document.getElementById('askQuestionTopicSel').value;
    const content = document.getElementById('askQuestionContent').value.trim();
    if (!content) {
      document.getElementById('askQuestionError').classList.remove('hidden');
      return;
    }
    if (!topicId) {
      topicId = 'general';
    }
    const post = {
      id: 'q_' + Math.random().toString(36).substr(2, 9),
      topic_id: topicId,
      content,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      is_question: true,
      created_at: new Date().toISOString()
    };
    await saveInfoPost(post);
    closeAskModal();
    if (currentTopicId === topicId) selectTopic(topicId);
  };

  // Answer a question — teachers can click "Answer this" to post a reply
  window.openAnswerModal = function(topicId, questionPostId) {
    openPostModal(topicId);
    document.getElementById('postTopicContent').placeholder = 'Type your answer here...';
  };

  // ── Notification Utilities ───────────────────────────────────────
  let _titleBlinkInterval = null;
  const _originalTitle = document.title;

  function playGong() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const mkTone = (freq, endFreq, vol, endVol, dur) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + dur);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(endVol, audioCtx.currentTime + dur);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + dur);
      };
      mkTone(660, 330, 0.6, 0.001, 2.5);
      mkTone(1320, 660, 0.35, 0.001, 0.9);
    } catch (e) {
      console.warn('Could not play gong sound:', e);
    }
  }

  function setFaviconEmoji(emoji) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.font = '26px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 16, 18);
      let link = document.querySelector("link[rel*='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = canvas.toDataURL();
    } catch (e) {}
  }

  function startTabAlert(label) {
    clearInterval(_titleBlinkInterval);
    setFaviconEmoji('🔔');
    let toggle = true;
    _titleBlinkInterval = setInterval(() => {
      document.title = toggle ? `🔔 ${label} | ClassFlow` : _originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  function stopTabAlert() {
    clearInterval(_titleBlinkInterval);
    _titleBlinkInterval = null;
    document.title = _originalTitle;
    setFaviconEmoji('🏫');
  }

  window.addEventListener('focus', stopTabAlert);

  function showBrowserNotification(title, body, onClick) {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body });
      if (onClick) n.onclick = () => { window.focus(); onClick(); };
      return n;
    }
    return null;
  }

  // Request browser notification permission immediately on login
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // ── Message real-time subscription ──────────────────────────────
  if (sb && !SUPABASE_URL.includes('YOUR')) {
    sb.channel('realtime_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new;
          const isFromMe = user && newMsg.author_name === user.name;

          renderLatestMessage();
          const modal = document.getElementById('messageModal');
          if (modal && !modal.classList.contains('hidden')) {
            renderMessages();
          }

          // Only alert for messages from other people
          if (!isFromMe) {
            playGong();
            if (document.hidden || document.visibilityState !== 'visible') {
              startTabAlert(`New message from ${newMsg.author_name}!`);
              showBrowserNotification(
                `💬 New message from ${newMsg.author_name}`,
                newMsg.content,
                () => openMessageModal()
              );
            }
          }
        }
      )
      .subscribe();
  }

  // Polling fallback to keep message board in sync every 8 seconds
  setInterval(() => {
    renderLatestMessage();
    const modal = document.getElementById('messageModal');
    if (modal && !modal.classList.contains('hidden')) {
      renderMessages();
    }
  }, 8000);

  // ── Voice Note PA System ──────────────────────────────────────────
  //
  // How it works (much simpler and more reliable than WebRTC):
  //   Sender  → taps a room button → MediaRecorder captures mic audio
  //           → clicks Send → audio blob converted to base64 data URL
  //           → broadcast via Supabase Realtime to target room's channel
  //   Receiver→ listens on their personal channel (pa_msg_<slug>)
  //           → receives audio data → auto-plays (or shows Play button)
  //
  // No ICE/STUN/TURN, no peer connections, no timing races. Just works.

  let paRecorder = null;
  let paChunks = [];
  let paTargetClass = null;
  let paRecording = false;
  let paRecordingTimer = null;
  let paRecordingSeconds = 0;
  let paReceiverChannel = null;
  let pendingPAData = null;  // holds audio data URL if autoplay is blocked
  let paCurrentAudio = null; // active Audio() object so we can track playback

  // ── Sender Side ─────────────────────────────────────────────────

  window.startPARecording = async function(className) {
    // If already recording for this same room, treat as cancel
    if (paRecording && paTargetClass === className) {
      cancelPARecording();
      return;
    }
    // Cancel any prior recording before starting a new one
    if (paRecording) cancelPARecording();

    paTargetClass = className;
    paChunks = [];
    paRecordingSeconds = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Pick the best supported audio format (smallest/best quality = Opus)
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(m => MediaRecorder.isTypeSupported(m)) || '';

      paRecorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, audioBitsPerSecond: 24000 });
      paRecorder.ondataavailable = e => { if (e.data.size > 0) paChunks.push(e.data); };
      paRecorder.onstop = () => stream.getTracks().forEach(t => t.stop());

      paRecorder.start(100); // collect data chunk every 100ms
      paRecording = true;
      _updateSenderUI();

      // Running timer display
      paRecordingTimer = setInterval(() => {
        paRecordingSeconds++;
        const timerEl = document.getElementById('paRecordingTimer');
        if (timerEl) timerEl.textContent = `🎙 Recording to ${className}… ${paRecordingSeconds}s`;
        if (paRecordingSeconds >= 30) stopAndSendPA(); // hard cap at 30s
      }, 1000);

    } catch (err) {
      console.error('PA mic error:', err);
      alert('Could not access microphone. Please allow microphone access in your browser and try again.');
      paTargetClass = null;
      _updateSenderUI();
    }
  };

  window.stopAndSendPA = async function() {
    if (!paRecorder || paRecorder.state === 'inactive' || !paRecording) return;

    if (paRecordingTimer) { clearInterval(paRecordingTimer); paRecordingTimer = null; }
    paRecording = false;
    const target = paTargetClass;
    paTargetClass = null;
    paRecorder.stop();
    _updateSenderUI();

    // Wait a beat for the final ondataavailable chunk to arrive
    await new Promise(r => setTimeout(r, 250));
    if (paChunks.length === 0) return;

    const statusEl = document.getElementById('intercomStatus');
    if (statusEl) statusEl.textContent = `Sending to ${target}…`;

    try {
      const mimeType = paRecorder.mimeType || 'audio/webm';
      const blob = new Blob(paChunks, { type: mimeType });
      paChunks = [];

      const audioData = await _blobToDataURL(blob);
      const senderName = user.role === 'frontdesk' ? 'Front Desk'
        : user.role === 'admin' ? 'Admin' : user.name;

      const payload = {
        id: 'pa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        from: senderName,
        audioData,
        timestamp: new Date().toISOString()
      };

      const targetSlug = target.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await _broadcastPANote(`pa_msg_${targetSlug}`, payload);

      if (statusEl) {
        statusEl.textContent = `✓ Voice note sent to ${target}!`;
        setTimeout(() => { if (statusEl) statusEl.textContent = 'Ready — tap a room to record'; }, 4000);
      }
    } catch (err) {
      console.error('PA send error:', err);
      const statusEl = document.getElementById('intercomStatus');
      if (statusEl) {
        statusEl.textContent = 'Send failed. Try again.';
        setTimeout(() => { statusEl.textContent = 'Ready — tap a room to record'; }, 4000);
      }
    }
  };

  window.cancelPARecording = function() {
    if (paRecordingTimer) { clearInterval(paRecordingTimer); paRecordingTimer = null; }
    if (paRecorder && paRecorder.state !== 'inactive') paRecorder.stop();
    paRecording = false;
    paChunks = [];
    paTargetClass = null;
    _updateSenderUI();
    const statusEl = document.getElementById('intercomStatus');
    if (statusEl) statusEl.textContent = 'Ready — tap a room to record';
  };

  function _blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function _broadcastPANote(channelName, payload) {
    if (!sb || SUPABASE_URL.includes('YOUR')) {
      console.warn('No Supabase connection — PA voice notes require a live connection.');
      return;
    }
    const ch = sb.channel(channelName, { config: { broadcast: { self: false } } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PA channel subscribe timeout')), 8000);
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error('PA channel error')); }
      });
    });
    await ch.send({ type: 'broadcast', event: 'voice_note', payload });
    // Small delay to let Supabase flush the message before we close the channel
    await new Promise(r => setTimeout(r, 600));
    try { await sb.removeChannel(ch); } catch (e) {}
  }

  function _updateSenderUI() {
    const controls = document.getElementById('paRecordingControls');
    const helpText = document.getElementById('paIntercomHelp');
    const grid = document.getElementById('intercomSenderGrid');

    if (paRecording && paTargetClass) {
      if (controls) controls.style.display = 'block';
      if (helpText) helpText.style.display = 'none';
      if (grid) grid.querySelectorAll('.intercom-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-class') === paTargetClass;
        btn.classList.toggle('active', isActive);
        btn.disabled = !isActive;
        if (isActive) btn.textContent = `🎙 ${paTargetClass}`;
      });
    } else {
      if (controls) controls.style.display = 'none';
      if (helpText) helpText.style.display = 'block';
      if (grid) grid.querySelectorAll('.intercom-btn').forEach(btn => {
        const cls = btn.getAttribute('data-class') || '';
        btn.classList.remove('active');
        btn.disabled = false;
        btn.textContent = `🎙️ ${cls}`;
      });
    }
  }

  async function renderIntercomSender() {
    const grid = document.getElementById('intercomSenderGrid');
    if (!grid) return;

    const allUsers = await getUsers();
    const classrooms = allUsers.filter(u => u.role === 'class');
    const targets = [];

    if (user.role !== 'frontdesk') targets.push({ name: 'Front Desk' });
    classrooms.forEach(c => { if (c.name !== user.name) targets.push({ name: c.name }); });

    if (!targets.length) {
      grid.innerHTML = '<div class="intercom-help" style="grid-column:span 2;text-align:center;font-size:0.78rem;color:var(--text-3);">No classroom terminals registered yet.</div>';
      return;
    }

    grid.innerHTML = targets.map(t => {
      const slug = t.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return `<button class="intercom-btn" data-class="${t.name}" onclick="startPARecording('${t.name}')" id="btnPA_${slug}">🎙️ ${t.name}</button>`;
    }).join('');
  }

  // ── Receiver Side ────────────────────────────────────────────────

  function initPAReceiver() {
    if (user.role !== 'class' && user.role !== 'frontdesk' && user.role !== 'admin') return;
    if (!sb || SUPABASE_URL.includes('YOUR')) return;

    const mySlug = (user.role === 'frontdesk' ? 'Front Desk' : user.name)
      .toLowerCase().replace(/[^a-z0-9]/g, '_');
    const channelName = `pa_msg_${mySlug}`;
    console.log(`PA Receiver listening on: ${channelName}`);

    if (paReceiverChannel) {
      try { sb.removeChannel(paReceiverChannel); } catch (e) {}
      paReceiverChannel = null;
    }

    paReceiverChannel = sb.channel(channelName, { config: { broadcast: { self: false } } });
    paReceiverChannel
      .on('broadcast', { event: 'voice_note' }, ({ payload }) => {
        console.log('Incoming PA voice note from:', payload.from);
        _receivePANote(payload);
      })
      .subscribe(status => {
        console.log(`PA Receiver [${channelName}]: ${status}`);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('PA receiver channel lost — reconnecting in 4s…');
          setTimeout(initPAReceiver, 4000);
        }
      });
  }

  function _receivePANote(payload) {
    pendingPAData = payload.audioData;

    playGong();
    startTabAlert(`📢 PA from ${payload.from}`);
    showBrowserNotification(
      `📢 Voice note from ${payload.from}`,
      'Tap to open and play',
      () => { window.focus(); playPendingPA(); }
    );

    const overlay = document.getElementById('paOverlay');
    const sub = document.getElementById('paOverlaySub');
    const playBtn = document.getElementById('paPlayBtn');
    const visualizer = document.getElementById('paVisualizer');

    if (overlay) overlay.classList.remove('hidden');
    if (sub) sub.textContent = `Voice note from ${payload.from || 'PA System'}`;
    if (playBtn) playBtn.style.display = 'none';
    if (visualizer) visualizer.style.display = 'flex';

    updateReceiverUI(true);

    if (paCurrentAudio) { try { paCurrentAudio.pause(); } catch (e) {} }
    paCurrentAudio = new Audio(payload.audioData);
    paCurrentAudio.onended = () => { pendingPAData = null; cleanupReceiverPA(); };
    paCurrentAudio.onerror = () => {
      if (playBtn) playBtn.style.display = 'inline-flex';
      if (visualizer) visualizer.style.display = 'none';
      if (sub) sub.textContent = `Voice note from ${payload.from} — tap ▶ to play`;
    };
    paCurrentAudio.play().catch(() => {
      console.log('PA autoplay blocked — showing Play button');
      if (playBtn) playBtn.style.display = 'inline-flex';
      if (visualizer) visualizer.style.display = 'none';
      if (sub) sub.textContent = `Voice note from ${payload.from} — tap ▶ to play`;
    });
  }

  window.playPendingPA = function() {
    if (!pendingPAData) return;
    const playBtn = document.getElementById('paPlayBtn');
    const visualizer = document.getElementById('paVisualizer');

    if (playBtn) playBtn.style.display = 'none';
    if (visualizer) visualizer.style.display = 'flex';

    if (paCurrentAudio) { try { paCurrentAudio.pause(); } catch (e) {} }
    paCurrentAudio = new Audio(pendingPAData);
    paCurrentAudio.onended = () => { pendingPAData = null; cleanupReceiverPA(); };
    paCurrentAudio.play().catch(e => console.error('Manual PA play failed:', e));
  };

  function cleanupReceiverPA() {
    stopTabAlert();
    pendingPAData = null;
    if (paCurrentAudio) { try { paCurrentAudio.pause(); } catch (e) {} paCurrentAudio = null; }
    const overlay = document.getElementById('paOverlay');
    if (overlay) overlay.classList.add('hidden');
    const playBtn = document.getElementById('paPlayBtn');
    if (playBtn) playBtn.style.display = 'none';
    updateReceiverUI(false);
  }

  window.hangUpCall = function() { cleanupReceiverPA(); };

  function updateReceiverUI(isReceiving) {
    const dot = document.getElementById('paReceiverPulse');
    const txt = document.getElementById('paReceiverText');
    if (!dot || !txt) return;
    if (isReceiving) {
      dot.className = 'pulse-indicator red';
      txt.textContent = '📢 RECEIVING VOICE NOTE';
      txt.style.color = '#e74c3c';
    } else {
      dot.className = 'pulse-indicator green';
      txt.textContent = 'PA System Active & Listening';
      txt.style.color = '';
    }
  }

  // ── Intercom Init ─────────────────────────────────────────────────

  const intercomWidget = document.getElementById('intercomWidget');
  const intercomSenderControls = document.getElementById('intercomSenderControls');
  const intercomReceiverStatus = document.getElementById('intercomReceiverStatus');

  if (intercomWidget) {
    if (user.role === 'frontdesk' || user.role === 'admin' || user.role === 'class') {
      intercomWidget.style.display = 'block';
      intercomSenderControls.style.display = 'block';
      intercomReceiverStatus.style.display = 'block';
      renderIntercomSender();
      initPAReceiver();
    } else {
      intercomWidget.style.display = 'none';
    }
  }
}

