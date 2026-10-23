# Islamic Quiz Website starter

Features included:
- Student registration and login (passwords hashed with bcrypt)
- Student dashboard and available quizzes
- MCQ auto-marking plus written-answer manual marking
- Results hidden until an admin publishes them
- Published results and leaderboard
- Admin can create quizzes and add MCQ or written questions

## Run locally
1. Install Node.js (LTS).
2. In this folder run `npm install`.
3. Copy `.env.example` to `.env`.
4. Change `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Important before public launch
This is a starter project, not yet production-hardened. The default session store is in-memory; use a persistent session store for deployment. Add rate limiting, CSRF protection, HTTPS, secure secret management, backups, and hosting/database monitoring before public use. Do not publish the default admin credentials. Set a strong unique admin password and `NODE_ENV=production` behind HTTPS. Add a timer/server-side deadlines, quiz editing/closing, and tests if required.
