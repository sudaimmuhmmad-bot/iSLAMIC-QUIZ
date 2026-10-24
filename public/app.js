let authMode='login', currentUser=null, currentQuiz=null;
const $=id=>document.getElementById(id);
async function api(url,opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed');return d}
function showAuth(mode){authMode=mode;$('nameField').hidden=mode!=='register';$('authSubmit').textContent=mode==='register'?'Create account':'Login';$('authMsg').textContent='';}
$('authForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const d=await api('/api/'+(authMode==='register'?'register':'login'),{method:'POST',body:JSON.stringify(Object.fromEntries(f))});currentUser=d.user;await loadHome()}catch(err){$('authMsg').textContent=err.message}};
async function boot(){
  try {
    const d = await api('/api/me');
    if(d.user){
      currentUser = d.user;
      await loadHome();
    } else {
      showAuth('login');
    }
  } catch(e) {
    showAuth('login');
  }
}
 
async function loadHome(){
  $('auth').hidden = true;
  $('quizPanel').hidden = true;
  $('welcomeGift').hidden = false;
  $('certificate').hidden = true;
  $('who').textContent = currentUser.name + ' · ' + currentUser.role;

  if(currentUser.role === 'admin'){
    $('welcomeGift').hidden = true;
    $('dashboard').hidden = true;
    $('admin').hidden = false;
    await loadAdmin();
    return;
  }

  $('admin').hidden = true;
  $('dashboard').hidden = false;
  $('welcomeTitle').textContent = 'Welcome, ' + currentUser.name + '! 🎉';
  $('welcomeText').textContent = 'Welcome to Islamic Quiz. Keep learning and do your best!';

  await Promise.all([
    loadQuizzes(),
    loadResults(),
    loadLeaderboard()
  ]);

  await loadCertificate();
}
                                                                  
async function logout(){await api('/api/logout',{method:'POST',body:'{}'});location.reload()}
async function loadQuizzes(){const d=await api('/api/quizzes');$('quizzes').innerHTML=d.quizzes.length?d.quizzes.map(q=>`<div class="item"><b>${esc(q.title)}</b><p>${esc(q.description||'')}</p><button onclick="startQuiz(${q.id})">Start quiz</button></div>`).join(''):'No quizzes available yet.'}
async function startQuiz(id){try{currentQuiz=await api('/api/quizzes/'+id);$('dashboard').hidden=true;$('quizPanel').hidden=false;$('quizTitle').textContent=currentQuiz.quiz.title;$('quizForm').innerHTML=currentQuiz.questions.map((q,i)=>`<div class="item"><b>${i+1}. ${esc(q.prompt)} (${q.points} point${q.points===1?'':'s'})</b>${q.type==='mcq'?`<div class="options">${q.options.map(o=>`<label><input type="radio" name="q${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>`:`<label>Your answer<textarea name="q${q.id}" rows="3"></textarea></label>`}</div>`).join('')+'<button class="primary">Submit quiz</button>'; $('quizForm').onsubmit=submitQuiz}catch(e){$('globalMsg').textContent=e.message}}
async function submitQuiz(e){e.preventDefault();if(!confirm('Submit this quiz? You cannot submit it again.'))return;const answers={};for(const q of currentQuiz.questions){const el=e.target.elements['q'+q.id];answers[q.id]=q.type==='mcq'?(el?el.value:''):(el?el.value:'')}try{const d=await api('/api/quizzes/'+currentQuiz.quiz.id+'/submit',{method:'POST',body:JSON.stringify({answers})});alert(d.message);await backHome()}catch(err){alert(err.message)}}
async function backHome(){currentQuiz=null;await loadHome()}
async function loadResults(){const d=await api('/api/my-results');$('myResults').innerHTML=d.results.length?d.results.map(r=>`<div class="item"><b>${esc(r.title)}</b><p>${r.published?`Score: ${r.total_score} · Published`:'Result: Under checking / not published'}</p></div>`).join(''):'No submitted quizzes yet.'}
async function loadLeaderboard(){const d=await api('/api/leaderboard');$('leaderboard').innerHTML=d.leaderboard.length?d.leaderboard.map((r,i)=>`<div class="item">#${i+1} <b>${esc(r.name)}</b> — ${esc(r.title)}: ${r.score} marks</div>`).join(''):'No published results yet.'}
async function loadAdmin(){const d=await api('/api/admin/quizzes');$('quizSelect').innerHTML=d.quizzes.map(q=>`<option value="${q.id}">${esc(q.title)}</option>`).join('');await loadSubmissions()}
$('createQuiz').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api('/api/admin/quizzes',{method:'POST',body:JSON.stringify(d)});e.target.reset();$('adminMsg').textContent='Quiz created.';await loadAdmin()}catch(err){$('adminMsg').textContent=err.message}}
$('addQuestion').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.options=d.options?d.options.split(',').map(x=>x.trim()).filter(Boolean):[];d.points=Number(d.points);try{await api('/api/admin/quizzes/'+d.quiz_id+'/questions',{method:'POST',body:JSON.stringify(d)});$('adminMsg').textContent='Question added.';e.target.reset();await loadSubmissions()}catch(err){$('adminMsg').textContent=err.message}}
async function loadSubmissions(){const d=await api('/api/admin/submissions');$('submissions').innerHTML=d.submissions.length?d.submissions.map(s=>`<div class="item"><b>${esc(s.title)} — ${esc(s.name)}</b><p class="muted">${esc(s.email)} · ${esc(s.status)}</p>${s.questions.map(q=>`<div><b>${esc(q.prompt)}</b><p>Student answer: ${esc(s.answers[q.id]||'(blank)')}</p>${q.type==='written'?`<label>Marks (max ${q.points})<input id="mark-${s.id}-${q.id}" type="number" min="0" max="${q.points}" value="0"></label>`:''}</div>`).join('')}<p>MCQ auto score: ${s.auto_score}</p><button onclick="markSubmission(${s.id})">Save marks</button> <button onclick="publishResult(${s.id})">Publish result</button></div>`).join(''):'No submissions yet.'}
async function markSubmission(id){const all=await api('/api/admin/submissions');const s=all.submissions.find(x=>x.id===id);const marks={};for(const q of s.questions)if(q.type==='written')marks[q.id]=Number($('mark-'+id+'-'+q.id).value||0);try{const d=await api('/api/admin/submissions/'+id+'/mark',{method:'POST',body:JSON.stringify({marks})});alert(d.message);await loadSubmissions()}catch(e){alert(e.message)}}
async function publishResult(id){if(!confirm('Publish this result to the student?'))return;try{const d=await api('/api/admin/submissions/'+id+'/publish',{method:'POST',body:'{}'});alert(d.message);await loadSubmissions()}catch(e){alert(e.message)}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
boot();

async function loadCertificate(){
  try {
    const resultsData = await api('/api/my-results');
    const boardData = await api('/api/leaderboard');

    const result = resultsData.results.find(r => r.published);

    if(!result){
      $('certificate').hidden = true;
      $('welcomeText').textContent =
        'Welcome to Islamic Quiz! Your certificate will appear after your result is published.';
      return;
    }

    const entryIndex = boardData.leaderboard.findIndex(r =>
      r.name === currentUser.name &&
      r.title === result.title &&
      Number(r.score) === Number(result.total_score)
    );

    if(entryIndex === -1){
      $('certificate').hidden = true;
      return;
    }

    $('certName').textContent = currentUser.name;
    $('certRank').textContent = '#' + (entryIndex + 1);
    $('certMarks').textContent = result.total_score;

    $('certificate').hidden = false;
    $('welcomeText').textContent = 'Congratulations! Your result is published.';
  } catch(error) {
    $('certificate').hidden = true;
    console.log('Certificate:', error.message);
  }
}

function shareCertificate() {
  const name = document.getElementById('certName').textContent;
  const rank = document.getElementById('certRank').textContent;
  const marks = document.getElementById('certMarks').textContent;
  const text = `🏆 Islamic Quiz Certificate 🏆
Congratulations ${name}!
Rank: ${rank}
Marks: ${marks}
`;

  if (navigator.share) {
    navigator.share({ title: 'Islamic Quiz Certificate', text });
  } else {
    navigator.clipboard.writeText(text)
      .then(() => alert('Certificate text copied!'));
  }
}
