# ClassFlow — Class Management System

A web-based class management system for scheduling, bookings, and student tracking.

## Getting Started

Push this folder to GitHub, then connect your repo to [Netlify](https://netlify.com) for instant hosting.

## Default Login

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `sheen` |
| Teacher (demo) | `john` | `password` |
| Front Desk (demo) | `desk` | `password` |

## Features

### Front Desk
- Weekly calendar view of all sessions
- See date, time, enrolled students, and max capacity per session
- Book free sessions (1 hour or 2 hour)
- Assign teachers to sessions
- Add students with names and ages
- Click any session to view full details
- Delete sessions

### Admin
- All Front Desk features
- Create user accounts for teachers and front desk staff
- Delete user accounts

### Teacher *(coming soon)*
- View their assigned sessions

## File Structure

```
├── index.html        # Login / role selection
├── dashboard.html    # Main dashboard (calendar, bookings, admin)
├── app.js            # All application logic
├── style.css         # Styling
├── netlify.toml      # Netlify routing config
└── README.md
```

## Data Storage

All data (sessions, users) is stored in the browser's `localStorage`. No backend required.

## Roadmap
- Teacher dashboard view
- Edit existing sessions
- Email/notification reminders
- Export schedule to PDF
- Backend database (Supabase / Firebase)
