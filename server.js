const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const app = express();
const db = new Database('quiz.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'student'
);
CREATE TABLE IF NOT EXISTS quizzes (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT DEFAULT '',
 is_open INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 quiz_id INTEGER NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('mcq','written')),
 prompt TEXT NOT NULL,
 options_json TEXT,
 correct_answer TEXT,
 points INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
);
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 quiz_id INTEGER NOT NULL,
 user_id INTEGER NOT NULL,
 answers_json TEXT NOT NULL,
 auto_score INTEGER NOT NULL DEFAULT 0,
 manual_score INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending',
 published INTEGER NOT NULL DEFAULT 0,
 submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(quiz_id,user_id),
 FOREIGN KEY(quiz_id) REFERENCES quizzes(id),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);
const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisAdminPassword123!';
if (!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail.toLowerCase())) {
  db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)')
    .run('Administrator', adminEmail.toLowerCase(), bcrypt.hashSync(adminPassword, 12), 'admin');
}

app.use(express.json({limit:'100kb'}));
app.use(express.urlencoded({extended:false}));
app.use(session({
 secret: process.env.SESSION_SECRET || 'dev-only-change-me',
 resave: false, saveUninitialized: false,
 cookie: { httpOnly:true, sameSite:'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname,'public')));

const safeUser = u => ({id:u.id,name:u.name,email:u.email,role:u.role});
function auth(req,res,next){ if(!req.session.user) return res.status(401).json({error:'Please log in.'}); next(); }
function admin(req,res,next){ if(!req.session.user || req.session.user.role!=='admin') return res.status(403).json({error:'Admin access required.'}); next(); }

app.post('/api/register', (req,res)=>{
 const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
 if(name.length<2 || name.length>80 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length<10)
   return res.status(400).json({error:'Enter a name, valid email, and password of at least 10 characters.'});
 try {
   const info=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)')
     .run(name,email,bcrypt.hashSync(password,12),'student');
   const u=db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
   req.session.user=safeUser(u); res.json({user:req.session.user});
 } catch(e){ res.status(409).json({error:'That email is already registered.'}); }
});
app.post('/api/login',(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(!u || !bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:'Email or password is incorrect.'});
 req.session.user=safeUser(u); res.json({user:req.session.user});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({user:req.session.user||null}));

app.get('/api/quizzes',auth,(req,res)=>{
 const quizzes=db.prepare('SELECT id,title,description FROM quizzes WHERE is_open=1 ORDER BY id DESC').all();
 res.json({quizzes});
});
app.get('/api/quizzes/:id',auth,(req,res)=>{
 const q=db.prepare('SELECT * FROM quizzes WHERE id=? AND is_open=1').get(Number(req.params.id));
 if(!q) return res.status(404).json({error:'Quiz not found.'});
 const questions=db.prepare('SELECT id,type,prompt,options_json,points FROM questions WHERE quiz_id=?').all(q.id)
 .map(x=>({id:x.id,type:x.type,prompt:x.prompt,options:x.options_json?JSON.parse(x.options_json):[],points:x.points}));
 res.json({quiz:{id:q.id,title:q.title,description:q.description},questions});
});
app.post('/api/quizzes/:id/submit',auth,(req,res)=>{
 if(req.session.user.role!=='student') return res.status(403).json({error:'Student accounts only.'});
 const quiz=db.prepare('SELECT * FROM quizzes WHERE id=? AND is_open=1').get(Number(req.params.id));
 if(!quiz) return res.status(404).json({error:'Quiz not available.'});
 const existing=db.prepare('SELECT id FROM submissions WHERE quiz_id=? AND user_id=?').get(quiz.id,req.session.user.id);
 if(existing) return res.status(409).json({error:'You have already submitted this quiz.'});
 const questions=db.prepare('SELECT * FROM questions WHERE quiz_id=?').all(quiz.id);
 const submitted=req.body.answers && typeof req.body.answers==='object' ? req.body.answers : {};
 const answers={}; let auto=0;
 for(const q of questions){
   const a=String(submitted[q.id]??'').slice(0,5000); answers[q.id]=a;
   if(q.type==='mcq' && a.trim().toLowerCase()===String(q.correct_answer||'').trim().toLowerCase()) auto+=q.points;
 }
 const written=questions.some(q=>q.type==='written');
 db.prepare(`INSERT INTO submissions(quiz_id,user_id,answers_json,auto_score,manual_score,status,published)
 VALUES(?,?,?,?,?,?,0)`).run(quiz.id,req.session.user.id,JSON.stringify(answers),auto,0,written?'pending':'pending');
 res.json({ok:true,message:'Submitted. Your result will stay pending until an admin checks and publishes it.'});
});
app.get('/api/my-results',auth,(req,res)=>{
 const rows=db.prepare(`SELECT s.id,s.quiz_id,q.title,s.auto_score,s.manual_score,s.status,s.published,s.submitted_at
 FROM submissions s JOIN quizzes q ON q.id=s.quiz_id WHERE s.user_id=? ORDER BY s.id DESC`).all(req.session.user.id);
 res.json({results:rows.map(r=>r.published?{...r,total_score:r.auto_score+r.manual_score}:{
 id:r.id,quiz_id:r.quiz_id,title:r.title,status:r.status,published:0,submitted_at:r.submitted_at})});
});
app.get('/api/leaderboard',auth,(req,res)=>{
 const rows=db.prepare(`SELECT u.name,q.title,s.auto_score+s.manual_score AS score
 FROM submissions s JOIN users u ON u.id=s.user_id JOIN quizzes q ON q.id=s.quiz_id
 WHERE s.published=1 ORDER BY score DESC, s.submitted_at ASC LIMIT 100`).all();
 res.json({leaderboard:rows});
});

// Admin endpoints
app.get('/api/admin/quizzes',admin,(req,res)=>{
 res.json({quizzes:db.prepare('SELECT * FROM quizzes ORDER BY id DESC').all()});
});
app.post('/api/admin/quizzes',admin,(req,res)=>{
 const title=String(req.body.title||'').trim();
 if(!title) return res.status(400).json({error:'Quiz title is required.'});
 const info=db.prepare('INSERT INTO quizzes(title,description,is_open) VALUES(?,?,1)')
 .run(title,String(req.body.description||'')); res.json({id:info.lastInsertRowid});
});
app.post('/api/admin/quizzes/:id/questions',admin,(req,res)=>{
 const quiz=db.prepare('SELECT id FROM quizzes WHERE id=?').get(Number(req.params.id));
 if(!quiz) return res.status(404).json({error:'Quiz not found.'});
 const type=req.body.type==='written'?'written':'mcq', prompt=String(req.body.prompt||'').trim(), points=Math.max(1,Math.min(100,Number(req.body.points)||1));
 if(!prompt) return res.status(400).json({error:'Question text is required.'});
 let options=null, answer=null;
 if(type==='mcq'){
   const raw=Array.isArray(req.body.options)?req.body.options:[];
   options=JSON.stringify(raw.map(x=>String(x).slice(0,200)).filter(Boolean).slice(0,6));
   answer=String(req.body.correct_answer||'').trim();
   if(raw.length<2 || !answer || !raw.map(String).includes(answer)) return res.status(400).json({error:'MCQ needs at least two options and a correct option.'});
 }
 const info=db.prepare('INSERT INTO questions(quiz_id,type,prompt,options_json,correct_answer,points) VALUES(?,?,?,?,?,?)')
 .run(quiz.id,type,prompt,options,answer,points);
 res.json({id:info.lastInsertRowid});
});
app.get('/api/admin/submissions',admin,(req,res)=>{
 const rows=db.prepare(`SELECT s.*,u.name,u.email,q.title FROM submissions s
 JOIN users u ON u.id=s.user_id JOIN quizzes q ON q.id=s.quiz_id ORDER BY s.id DESC`).all();
 res.json({submissions:rows.map(r=>({...r,answers:JSON.parse(r.answers_json),questions:db.prepare('SELECT id,type,prompt,points FROM questions WHERE quiz_id=?').all(r.quiz_id)}))});
});
app.post('/api/admin/submissions/:id/mark',admin,(req,res)=>{
 const s=db.prepare('SELECT * FROM submissions WHERE id=?').get(Number(req.params.id));
 if(!s) return res.status(404).json({error:'Submission not found.'});
 const questions=db.prepare('SELECT * FROM questions WHERE quiz_id=?').all(s.quiz_id);
 let manual=0;
 const marks=req.body.marks && typeof req.body.marks==='object'?req.body.marks:{};
 for(const q of questions) if(q.type==='written') manual+=Math.max(0,Math.min(q.points,Number(marks[q.id])||0));
 db.prepare("UPDATE submissions SET manual_score=?,status='checked',published=0 WHERE id=?").run(manual,s.id);
 res.json({ok:true,message:'Marked. Publish the result when ready.'});
});
app.post('/api/admin/submissions/:id/publish',admin,(req,res)=>{
 const s=db.prepare('SELECT id,status FROM submissions WHERE id=?').get(Number(req.params.id));
 if(!s) return res.status(404).json({error:'Submission not found.'});
 db.prepare("UPDATE submissions SET status='published',published=1 WHERE id=?").run(s.id);
 res.json({ok:true,message:'Result published.'});
});
app.listen(process.env.PORT||3000,()=>console.log(`Islamic Quiz running on http://localhost:${process.env.PORT||3000}`));
