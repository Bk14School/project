/* ================================================================
   ระบบบริหารโครงการงบประมาณ — โรงเรียนบ้านคลอง 14  v4
================================================================ */

const SL={pending:'รอตรวจสอบ',reviewing:'กำลังตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ'};
const SC={pending:'#F59E0B',reviewing:'#3B82F6',approved:'#22C55E',rejected:'#EF4444'};
const RL={admin:'ผู้บริหาร',finance:'ฝ่ายงบประมาณ',teacher:'ครู/อาจารย์'};
const RC={admin:'#8B5CF6',finance:'#3B82F6',teacher:'#22C55E'};

let ME=null, PROJECTS=[], STATUS_F='all';
let budgetRows=[], stepRows=[], evalRows=[], signerRows=[];

/* ---- Cache layer ---- */
const CACHE={}, CACHE_TTL=60000; // 60 วินาที
function cacheGet(k){ const v=CACHE[k]; return v&&Date.now()-v.ts<CACHE_TTL?v.data:null; }
function cacheSet(k,data){ CACHE[k]={data,ts:Date.now()}; }
function cacheClear(){ Object.keys(CACHE).forEach(k=>delete CACHE[k]); }

/* ================================================================ BOOT */
const GUEST_EMAIL = 'admin@school.ac.th'; // email สาธารณะสำหรับดูข้อมูล

document.addEventListener('DOMContentLoaded', async()=>{
  document.getElementById('bud-year').textContent = new Date().getFullYear()+543;
  initNav();
  // ลองโหลด session
  const saved = localStorage.getItem('school_user_email');
  if(saved){ await tryLogin(saved, true); }
  else { enterGuest(); }
});

/* -------- Auth helpers -------- */
async function tryLogin(email, silent=false){
  if(!silent){
    const btn=document.getElementById('btn-login-submit');
    btn.disabled=true; btn.textContent='กำลังตรวจสอบ...';
  }
  const r = await apiRaw('getMe',{userEmail:email});
  if(!silent){
    const btn=document.getElementById('btn-login-submit');
    btn.disabled=false; btn.textContent='เข้าสู่ระบบ';
  }
  if(r && r.ok){
    ME=r.user; USER_EMAIL=email;
    localStorage.setItem('school_user_email', email);
    applyUser();
    closeLogin();
    nav('dashboard');
  } else {
    localStorage.removeItem('school_user_email');
    ME=null; USER_EMAIL='';
    if(!silent){
      showLoginErr('⚠️ ไม่พบอีเมลนี้ในระบบ กรุณาตรวจสอบอีกครั้ง');
    } else { enterGuest(); }
  }
}

function applyUser(){
  document.getElementById('sb-avatar').textContent = ME.name?ME.name[0]:'?';
  document.getElementById('sb-name').textContent   = ME.name;
  document.getElementById('sb-role').textContent   = RL[ME.role]||ME.role;
  document.querySelectorAll('.teacher-only').forEach(el=>el.classList.toggle('hidden', ME.role!=='teacher'));
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden', ME.role!=='admin'));
  document.querySelectorAll('.finance-only').forEach(el=>el.classList.toggle('hidden', ME.role!=='finance'&&ME.role!=='admin'));
  document.getElementById('sb-login-area').innerHTML=
    `<button class="btn-login btn-logout" onclick="doLogout()">🚪 ออกจากระบบ</button>`;
}

function enterGuest(){
  ME=null; USER_EMAIL='';
  document.getElementById('sb-avatar').textContent='?';
  document.getElementById('sb-name').textContent='ผู้เยี่ยมชม';
  document.getElementById('sb-role').textContent='ยังไม่ได้เข้าสู่ระบบ';
  document.querySelectorAll('.teacher-only').forEach(el=>el.classList.add('hidden'));
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.add('hidden'));
  document.querySelectorAll('.finance-only').forEach(el=>el.classList.add('hidden'));
  document.getElementById('sb-login-area').innerHTML=
    `<button class="btn-login" onclick="openLogin()">🔑 เข้าสู่ระบบ</button>`;
  nav('dashboard');
}

function doLogout(){
  localStorage.removeItem('school_user_email');
  enterGuest();
  toast('ออกจากระบบแล้ว');
}

function openLogin(){
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('login-err').classList.add('hidden');
  document.getElementById('login-email').value='';
  setTimeout(()=>document.getElementById('login-email').focus(),80);
}
function closeLogin(){
  document.getElementById('login-modal').classList.add('hidden');
}
function showLoginErr(msg){
  const el=document.getElementById('login-err');
  el.textContent=msg; el.classList.remove('hidden');
}
function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  if(!email){showLoginErr('กรุณากรอกอีเมล');return;}
  tryLogin(email);
}
document.addEventListener('click',e=>{
  if(e.target===document.getElementById('login-modal')) closeLogin();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!document.getElementById('login-modal').classList.contains('hidden')) doLogin();
  if(e.key==='Escape') closeLogin();
});

/* ================================================================ MOBILE SIDEBAR */
function openSidebar(){ document.getElementById('sidebar').classList.add('open'); document.getElementById('sb-overlay').classList.add('show'); }
function closeSidebar(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('sb-overlay').classList.remove('show'); }

/* ================================================================ NAV */
function initNav(){
  document.getElementById('nav').addEventListener('click',e=>{
    const a=e.target.closest('.nav-item'); if(a) nav(a.dataset.page);
  });
  document.getElementById('status-tabs').addEventListener('click',e=>{
    const t=e.target.closest('.tab'); if(!t) return;
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active'); STATUS_F=t.dataset.s; renderProjects();
  });
  let _debounce;
  document.getElementById('search').addEventListener('input',()=>{ clearTimeout(_debounce); _debounce=setTimeout(renderProjects,220); });
}

const PAGE_TITLES={'dashboard':'ภาพรวม','projects':'โครงการ','form':'เสนอโครงการ','detail':'รายละเอียด','users':'ผู้ใช้งาน','budget-config':'กำหนดงบ','log':'ประวัติ'};

function nav(page,props={}){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.remove('hidden');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('mobile-title').textContent = PAGE_TITLES[page]||'';
  window.scrollTo(0,0);
  closeSidebar();
  if(page==='dashboard')     loadDashboard();
  if(page==='projects')      loadProjects();
  if(page==='form')          initForm(props);
  if(page==='detail')        loadDetail(props.id);
  if(page==='users')         loadUsers();
  if(page==='budget-config') loadBudgetConfig();
  if(page==='log')           loadLog();
}

/* ================================================================ DASHBOARD */
async function loadDashboard(){
  const isFinance = ME && (ME.role==='finance'||ME.role==='admin');
  document.getElementById('greet').textContent     = ME ? `สวัสดี, ${ME.name} 👋` : 'ภาพรวมระบบงบประมาณ';
  document.getElementById('dash-desc').textContent = isFinance ? 'รายการที่ต้องดำเนินการและภาพรวมงบประมาณ' : 'สรุปโครงการและงบประมาณประจำปี';

  // skeleton KPIs
  ['kpi-count','kpi-req','kpi-appr','kpi-spent'].forEach(id=>{
    document.getElementById(id).querySelector('.kpi-n').innerHTML='<span class="skel skel-num"></span>';
  });

  const email = ME ? ME.email : GUEST_EMAIL;
  const ckey  = 'dash_'+email;

  // ---- fetch ทั้งหมดพร้อมกัน ----
  let dashRes = cacheGet(ckey);
  let cfgRes  = cacheGet('cfg');
  const needFetch = !dashRes || !cfgRes;

  const fetches = [
    needFetch ? apiRaw('getDashboard',{userEmail:email}) : Promise.resolve(dashRes),
    needFetch ? apiRaw('getBudgetConfig',{userEmail:email}) : Promise.resolve(cfgRes),
    (isFinance || (ME && ME.role==='teacher')) ? apiRaw('getProjects',{userEmail:email}) : Promise.resolve(null),
    (isFinance || (ME && ME.role==='teacher')) ? apiRaw('getExpenseRequests',{userEmail:email}) : Promise.resolve(null),
    isFinance ? apiRaw('getPendingDocs',{userEmail:email}) : Promise.resolve(null),
  ];
  const [dr, cr, pr, er, docsRes] = await Promise.all(fetches);

  if(needFetch){
    if(dr.ok) cacheSet(ckey, dr);
    if(cr.ok) cacheSet('cfg', cr);
  }
  dashRes = dr; cfgRes = cr;
  if(!dashRes.ok) return;
  const d = dashRes.dashboard;

  // ---- Teacher Panel ----
  const teacherPanel = document.getElementById('teacher-panel');
  if(ME && ME.role==='teacher' && pr && pr.ok){
    teacherPanel.style.display = 'block';
    renderTeacherPanel(pr.projects, er?.requests||[]);
  } else {
    teacherPanel.style.display = 'none';
  }

  // ---- Finance Action Panel ----
  const panel = document.getElementById('finance-panel');
  if(isFinance && pr && pr.ok){
    panel.style.display = 'block';
    renderFinancePanel(pr.projects, er?.requests||[], docsRes?.pending_docs||[]);
  } else {
    panel.style.display = 'none';
  }

  // ---- Budget Banner ----
  const totalBudget = cfgRes.ok ? Number(cfgRes.config.total_budget||0) : 0;
  const banner = document.getElementById('budget-banner');
  if(totalBudget > 0){
    banner.style.display = 'block';
    const remain   = totalBudget - d.totalAppr;
    const apprPct  = Math.min(Math.round(d.totalAppr  / totalBudget * 100), 100);
    const spentPct = Math.min(Math.round(d.totalSpent / totalBudget * 100), 100);
    document.getElementById('bb-total').textContent  = fmt(totalBudget) + ' บาท';
    document.getElementById('bb-appr').textContent   = fmt(d.totalAppr)  + ' บาท';
    document.getElementById('bb-spent').textContent  = fmt(d.totalSpent) + ' บาท';
    document.getElementById('bb-remain').textContent = fmt(remain) + ' บาท';
    document.getElementById('bb-appr-pct').textContent  = apprPct;
    document.getElementById('bb-spent-pct').textContent = spentPct;
    document.getElementById('bb-bar-appr').style.width  = apprPct  + '%';
    document.getElementById('bb-bar-spent').style.width = spentPct + '%';
    document.getElementById('bb-remain').style.color = remain < 0 ? '#EF4444' : remain < totalBudget*0.1 ? '#F59E0B' : '#22C55E';
  } else {
    banner.style.display = 'none';
  }

  // ---- KPIs ----
  document.getElementById('kpi-count').querySelector('.kpi-n').textContent = d.count;
  document.getElementById('kpi-req').querySelector('.kpi-n').textContent   = fmt(d.totalReq);
  document.getElementById('kpi-appr').querySelector('.kpi-n').textContent  = fmt(d.totalAppr);
  document.getElementById('kpi-spent').querySelector('.kpi-n').textContent = fmt(d.totalSpent);

  // ---- Status rows ----
  const tot = d.count||1;
  document.getElementById('dash-status').innerHTML =
    Object.entries(d.byStatus).map(([s,c])=>`
      <div class="s-row">
        <div class="s-dot" style="background:${SC[s]}"></div>
        <div class="s-label">${SL[s]}</div>
        <div class="s-count">${c}</div>
        <div class="s-bar-wrap"><div class="s-bar" style="width:${Math.round(c/tot*100)}%;background:${SC[s]}"></div></div>
      </div>`).join('');

  // ---- Dept bars ----
  const depts = Object.entries(d.byDept||{}).sort((a,b)=>b[1].requested-a[1].requested).slice(0,6);
  const tr = d.totalReq||1;
  document.getElementById('dash-dept').innerHTML = depts.length
    ? depts.map(([dn,dd])=>`<div class="dept-row"><div class="dept-head"><span class="dept-name">${esc(dn)}</span><span class="dept-amt">${fmt(dd.requested)} บาท</span></div><div class="mini-bar"><div class="mini-fill" style="width:${Math.round(dd.requested/tr*100)}%"></div></div></div>`).join('')
    : '<div style="color:#7C8FA8;font-size:13px">ยังไม่มีข้อมูล</div>';

  drawStatusChart(d.byStatus, d.count);
  drawBudgetChart(d, totalBudget);
  drawDeptChart(d.byDept);
}

/* -------- Finance Action Panel -------- */
function renderFinancePanel(projects, expRequests, pendingDocs){
  const pending   = projects.filter(p=>p.status==='pending');
  const reviewing = projects.filter(p=>p.status==='reviewing');
  const approved  = projects.filter(p=>p.status==='approved');
  const pendingExp= expRequests.filter(r=>r.status==='pending');
  const overdueDocs = (pendingDocs||[]).filter(d=>d.overdue);

  // Action KPI cards
  document.getElementById('action-kpis').innerHTML=`
    <div class="action-kpi urgent" onclick="scrollToList('list-pending-proj')">
      <div class="action-kpi-n">${pending.length+reviewing.length}</div>
      <div class="action-kpi-l">⏳ รอพิจารณา</div>
    </div>
    <div class="action-kpi warn" onclick="scrollToList('list-exp-requests')">
      <div class="action-kpi-n">${pendingExp.length}</div>
      <div class="action-kpi-l">💸 รออนุมัติเบิก</div>
    </div>
    <div class="action-kpi ${overdueDocs.length?'urgent':'ok'}" onclick="scrollToList('list-pending-docs')">
      <div class="action-kpi-n">${(pendingDocs||[]).length}</div>
      <div class="action-kpi-l">📎 รอหลักฐาน${overdueDocs.length?` (${overdueDocs.length} เกินกำหนด)`:''}</div>
    </div>
    <div class="action-kpi ok">
      <div class="action-kpi-n">${approved.length}</div>
      <div class="action-kpi-l">✅ อนุมัติแล้ว</div>
    </div>`;

  document.getElementById('badge-pending').textContent   = pending.length+reviewing.length+' รายการ';
  document.getElementById('badge-exp-req').textContent   = pendingExp.length+' รายการ';
  document.getElementById('badge-approved').textContent  = approved.length+' โครงการ';

  // --- โครงการรอพิจารณา ---
  const pendingList = [...pending,...reviewing].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  document.getElementById('list-pending-proj').innerHTML = pendingList.length
    ? pendingList.map(p=>`
      <div class="action-item" onclick="nav('detail',{id:'${p.project_id}'})">
        <div class="action-item-left">
          <span class="badge badge-${p.status}">${SL[p.status]}</span>
          <div class="action-item-name">${esc(p.title)}</div>
          <div class="action-item-sub">${esc(p.dept)} · ${esc(p.owner_name)} · ${fdate(p.created_at)}</div>
        </div>
        <div class="action-item-right">
          <div class="action-item-amt">${fmt(p.budget_requested)}</div>
          <div class="action-item-unit">บาท</div>
          <div class="action-item-arrow">→</div>
        </div>
      </div>`).join('')
    : '<div class="empty" style="padding:20px 0;font-size:13px">✅ ไม่มีโครงการรอพิจารณา</div>';

  // --- คำขอเบิกรออนุมัติ ---
  document.getElementById('list-exp-requests').innerHTML = pendingExp.length
    ? pendingExp.map(r=>`
      <div class="action-item exp-action" onclick="nav('detail',{id:'${r.project_id}'})">
        <div class="action-item-left">
          <div class="action-item-name">${esc(r.item)}</div>
          <div class="action-item-sub">
            โครงการ <b>${esc(r.project_id)}</b> · ${esc(r.requested_name||r.requested_by)} · ${fdate(r.created_at)}
          </div>
          ${r.note?`<div class="action-item-note">${esc(r.note)}</div>`:''}
        </div>
        <div class="action-item-right">
          <div class="action-item-amt" style="color:#F59E0B">${fmt(r.amount)}</div>
          <div class="action-item-unit">บาท</div>
          <div class="action-item-arrow">→</div>
        </div>
      </div>`).join('')
    : '<div class="empty" style="padding:20px 0;font-size:13px">✅ ไม่มีคำขอรออนุมัติ</div>';

  // --- โครงการอนุมัติแล้ว ติดตามงบ ---
  const approvedSorted = [...approved].sort((a,b)=>Number(b.budget_approved)-Number(a.budget_approved));
  document.getElementById('list-approved-proj').innerHTML = approvedSorted.length
    ? `<div style="overflow-x:auto"><table class="data-table">
        <thead><tr>
          <th>ชื่อโครงการ</th><th>หน่วยงาน</th>
          <th class="right">งบอนุมัติ</th><th class="right">เบิกจ่ายแล้ว</th>
          <th class="right">คงเหลือ</th><th>ความคืบหน้า</th><th></th>
        </tr></thead>
        <tbody>${approvedSorted.map(p=>{
          const spent = Number(p.spent||0);
          const appr  = Number(p.budget_approved||0);
          const rem   = appr - spent;
          const pct   = appr>0 ? Math.min(Math.round(spent/appr*100),100) : 0;
          const barColor = pct>90?'#EF4444':pct>70?'#F59E0B':'#22C55E';
          return `<tr style="cursor:pointer" onclick="nav('detail',{id:'${p.project_id}'})">
            <td><div style="font-weight:600;font-size:13px">${esc(p.title)}</div></td>
            <td style="font-size:12px;color:#7C8FA8">${esc(p.dept)}</td>
            <td class="right" style="font-weight:700">${fmt(appr)}</td>
            <td class="right" style="color:#F59E0B;font-weight:700">${fmt(spent)}</td>
            <td class="right" style="color:${rem<0?'#EF4444':'#22C55E'};font-weight:700">${fmt(rem)}</td>
            <td style="min-width:100px">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="flex:1;height:6px;background:#EEF0F4;border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px"></div>
                </div>
                <span style="font-size:11px;color:#7C8FA8;white-space:nowrap">${pct}%</span>
              </div>
            </td>
            <td style="color:#3B82F6;font-size:12px;font-weight:600">ดูรายละเอียด →</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`
    : '<div style="color:#7C8FA8;font-size:13px;padding:8px 0">ยังไม่มีโครงการที่อนุมัติ</div>';

  // --- รายการรอหลักฐาน ---
  const today = new Date().toISOString().slice(0,10);
  const docsEl = document.getElementById('list-pending-docs');
  if(docsEl){
    const docs = pendingDocs||[];
    docsEl.innerHTML = docs.length
      ? docs.sort((a,b)=>a.doc_deadline>b.doc_deadline?1:-1).map(r=>{
          const overdue = r.doc_deadline && r.doc_deadline < today;
          return `<div class="action-item ${overdue?'exp-action':''}" onclick="nav('detail',{id:'${r.project_id}'})">
            <div class="action-item-left">
              <div class="action-item-name">${esc(r.item)}</div>
              <div class="action-item-sub">
                ${esc(r.project_id)} · ${esc(r.requested_name||r.requested_by)}
                · ครบกำหนด <b style="color:${overdue?'#EF4444':'#F59E0B'}">${fdate(r.doc_deadline)}</b>
                ${overdue?'<b style="color:#EF4444"> ⚠️ เกินกำหนด</b>':''}
              </div>
              ${r.doc_file_url?`<a href="${esc(r.doc_file_url)}" target="_blank" class="file-link" onclick="event.stopPropagation()">📎 ดูหลักฐานที่ส่งแล้ว</a>`:''}
            </div>
            <div class="action-item-right">
              <div class="action-item-amt">${fmt(r.amount)}</div>
              <div class="action-item-unit">บาท</div>
              <div class="action-item-arrow">→</div>
            </div>
          </div>`;
        }).join('')
      : '<div class="empty" style="padding:16px 0;font-size:13px">✅ ไม่มีรายการรอหลักฐาน</div>';
  }
}

function scrollToList(id){
  document.getElementById(id)?.scrollIntoView({behavior:'smooth', block:'start'});
}

/* -------- Teacher Dashboard -------- */
function renderTeacherPanel(projects, expRequests){
  const myProj   = projects; // already filtered by GAS for teacher
  const pending  = myProj.filter(p=>p.status==='pending');
  const approved = myProj.filter(p=>p.status==='approved');
  const reviewing= myProj.filter(p=>p.status==='reviewing');
  const rejected = myProj.filter(p=>p.status==='rejected');
  const myExpReq = expRequests || [];
  const pendingExp = myExpReq.filter(r=>r.status==='pending');

  // Action banner — สิ่งที่ต้องทำ
  const bannerEl = document.getElementById('teacher-action-banner');
  const actions = [];
  if(approved.length) actions.push(`✅ คุณมี <b>${approved.length}</b> โครงการที่อนุมัติแล้ว — สามารถยื่นคำขอเบิกจ่ายได้`);
  if(reviewing.length) actions.push(`🔍 <b>${reviewing.length}</b> โครงการกำลังถูกตรวจสอบ`);
  if(pendingExp.length) actions.push(`⏳ คำขอเบิก <b>${pendingExp.length}</b> รายการรอฝ่ายงบอนุมัติ`);
  if(rejected.length) actions.push(`❌ <b>${rejected.length}</b> โครงการไม่ผ่านการอนุมัติ`);

  const today2 = new Date().toISOString().slice(0,10);
  const docsNeeded  = myExpReq.filter(r=>r.doc_status==='pending');
  const overdueDoc  = docsNeeded.filter(r=>r.doc_deadline&&r.doc_deadline<today2);
  if(overdueDoc.length)  actions.push(`🚨 มี <b>${overdueDoc.length}</b> รายการเกินกำหนดส่งหลักฐาน — กรุณาส่งด่วน!`);
  else if(docsNeeded.length) actions.push(`📎 ต้องส่งหลักฐาน <b>${docsNeeded.length}</b> รายการ กดที่โครงการเพื่ออัปโหลด`);

  if(actions.length){
    bannerEl.style.display='block';
    bannerEl.innerHTML=`<div class="teacher-banner">
      ${actions.map(a=>`<div class="teacher-banner-item">${a}</div>`).join('')}
    </div>`;
  } else {
    bannerEl.style.display='none';
  }

  // KPI ครู
  document.getElementById('teacher-kpis').innerHTML=`
    <div class="t-kpi" style="--c:#8B5CF6"><div class="t-kpi-n">${myProj.length}</div><div class="t-kpi-l">โครงการทั้งหมด</div></div>
    <div class="t-kpi" style="--c:#F59E0B"><div class="t-kpi-n">${pending.length+reviewing.length}</div><div class="t-kpi-l">รอพิจารณา</div></div>
    <div class="t-kpi" style="--c:#22C55E" onclick="nav('projects')" style="cursor:pointer"><div class="t-kpi-n">${approved.length}</div><div class="t-kpi-l">อนุมัติแล้ว</div></div>
    <div class="t-kpi" style="--c:#F59E0B"><div class="t-kpi-n">${pendingExp.length}</div><div class="t-kpi-l">รอเบิกจ่าย</div></div>`;

  // รายการโครงการของฉัน
  const sorted = [...myProj].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  document.getElementById('teacher-proj-list').innerHTML = sorted.length
    ? sorted.map(p=>{
        const spent = Number(p.spent||0);
        const appr  = Number(p.budget_approved||0);
        const pct   = appr>0 ? Math.min(Math.round(spent/appr*100),100) : 0;
        const nextAction = {
          pending:   '⏳ รอฝ่ายงบตรวจสอบ',
          reviewing: '🔍 กำลังถูกตรวจสอบ',
          approved:  '💸 กดยื่นคำขอเบิกในหน้ารายละเอียด',
          rejected:  '❌ ไม่ผ่านการอนุมัติ'
        }[p.status]||'';
        return `<div class="teacher-proj-item" onclick="nav('detail',{id:'${p.project_id}'})">
          <div class="teacher-proj-left">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="badge badge-${p.status}">${SL[p.status]}</span>
              <span style="font-size:11px;color:#7C8FA8">${esc(p.dept)}</span>
            </div>
            <div class="teacher-proj-name">${esc(p.title)}</div>
            <div class="teacher-proj-action">${nextAction}</div>
            ${p.status==='approved'&&appr>0?`<div class="teacher-prog">
              <div class="teacher-prog-bar"><div style="width:${pct}%;height:100%;background:${pct>90?'#EF4444':pct>70?'#F59E0B':'#22C55E'};border-radius:99px"></div></div>
              <span style="font-size:11px;color:#7C8FA8">${fmt(spent)}/${fmt(appr)} บาท (${pct}%)</span>
            </div>`:''}
          </div>
          <div class="teacher-proj-right">
            <div style="font-size:15px;font-weight:800;color:#1C2333">${fmt(p.budget_requested)}</div>
            <div style="font-size:10px;color:#9CA3AF">บาท</div>
            <div style="font-size:13px;color:#9CA3AF;margin-top:4px">→</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty" style="padding:20px 0">
        <div class="empty-icon">📂</div>
        ยังไม่มีโครงการ
        <br><button class="btn-prim" style="margin-top:12px" onclick="nav('form')">+ เสนอโครงการแรก</button>
      </div>`;

  // คำขอเบิกจ่ายล่าสุด
  const REQ_LABEL = {pending:'⏳ รอพิจารณา', approved:'✅ อนุมัติ', rejected:'❌ ปฏิเสธ'};
  document.getElementById('teacher-exp-list').innerHTML = myExpReq.length
    ? myExpReq.slice(-8).reverse().map(r=>`
        <div class="teacher-exp-item">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1C2333">${esc(r.item)}</div>
            <div style="font-size:11px;color:#9CA3AF">${esc(r.project_id)} · ${fdate(r.created_at)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:14px;font-weight:700">${fmt(r.amount)} บาท</div>
            <div style="font-size:11px;margin-top:2px">${REQ_LABEL[r.status]||r.status}</div>
          </div>
        </div>`).join('')
    : '<div style="font-size:13px;color:#9CA3AF;padding:8px 0">ยังไม่มีคำขอเบิกจ่าย</div>';
}

/* ================================================================ COPY PROJECT */
async function copyProject(pid){
  if(!confirm('คัดลอกโครงการนี้เพื่อสร้างโครงการใหม่?')) return;
  const email = ME ? ME.email : GUEST_EMAIL;
  const r = await apiRaw('getProject',{id:pid, userEmail:email});
  if(!r.ok){ toast('โหลดข้อมูลไม่ได้','error'); return; }
  const p = r.project;
  // ล้าง id และข้อมูลที่ไม่ควรคัดลอก
  const copy = {...p,
    project_id: '',
    status: '',
    budget_approved: '',
    created_at: '',
    note: '',
    title: `(สำเนา) ${p.title||''}`
  };
  toast('เปิดฟอร์มพร้อมข้อมูลที่คัดลอก');
  nav('form', {project: copy});
}

function drawStatusChart(byStatus, total){
  const canvas=document.getElementById('chart-status');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  if(window._chartStatus) window._chartStatus.destroy();
  const labels=Object.keys(byStatus).map(s=>SL[s]);
  const values=Object.values(byStatus);
  const colors=Object.keys(byStatus).map(s=>SC[s]);
  window._chartStatus = new Chart(ctx,{
    type:'doughnut',
    data:{labels, datasets:[{data:values, backgroundColor:colors, borderWidth:2, borderColor:'#fff'}]},
    options:{
      responsive:true, maintainAspectRatio:false,
      cutout:'65%',
      plugins:{
        legend:{position:'right', labels:{font:{family:'Sarabun',size:12}, padding:12, boxWidth:12}},
        tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} โครงการ`}}
      }
    }
  });
}

function drawBudgetChart(d, totalBudget){
  const canvas=document.getElementById('chart-budget');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  if(window._chartBudget) window._chartBudget.destroy();
  const labels=['งบที่ขอ','งบที่อนุมัติ','เบิกจ่ายแล้ว'];
  const values=[d.totalReq, d.totalAppr, d.totalSpent];
  const colors=['#8B5CF6','#22C55E','#F59E0B'];
  if(totalBudget>0){ labels.push('วงเงินทั้งหมด'); values.push(totalBudget); colors.push('#3B82F6'); }
  window._chartBudget = new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'บาท',
        data:values,
        backgroundColor:colors,
        borderRadius:8, borderSkipped:false,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>`${fmt(ctx.raw)} บาท`}}},
      scales:{
        y:{ticks:{callback:v=>v>=1e6?(v/1e6).toFixed(1)+'ล.':fmt(v), font:{family:'Sarabun',size:11}}, grid:{color:'#EEF0F4'}},
        x:{ticks:{font:{family:'Sarabun',size:12}}, grid:{display:false}}
      }
    }
  });
}

function drawDeptChart(byDept){
  const canvas=document.getElementById('chart-dept');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  if(window._chartDept) window._chartDept.destroy();
  const sorted=Object.entries(byDept||{}).sort((a,b)=>b[1].requested-a[1].requested).slice(0,8);
  if(!sorted.length) return;
  const COLORS=['#3B82F6','#8B5CF6','#22C55E','#F59E0B','#EF4444','#06B6D4','#EC4899','#14B8A6'];
  // ชื่อย่อ dept
  const shorten=s=>s.replace('กลุ่มสาระ','').replace('งาน','').trim().slice(0,14);
  window._chartDept = new Chart(ctx,{
    type:'bar',
    data:{
      labels: sorted.map(([k])=>shorten(k)),
      datasets:[{
        label:'งบที่ขอ (บาท)',
        data: sorted.map(([,v])=>v.requested),
        backgroundColor: sorted.map((_,i)=>COLORS[i%COLORS.length]),
        borderRadius:6, borderSkipped:false,
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>`${fmt(ctx.raw)} บาท`}}},
      scales:{
        x:{ticks:{callback:v=>v>=1e6?fmt(v/1e6)+'ล.':fmt(v), font:{family:'Sarabun',size:10}}, grid:{color:'#EEF0F4'}},
        y:{ticks:{font:{family:'Sarabun',size:11}}, grid:{display:false}}
      }
    }
  });
}

/* ================================================================ PROJECTS */
async function loadProjects(){
  document.getElementById('proj-list').innerHTML=skeletonCards(4);
  const email = ME ? ME.email : GUEST_EMAIL;
  const ckey = 'proj_'+email;
  let cached = cacheGet(ckey);
  if(!cached){
    cached = await apiRaw('getProjects',{userEmail:email});
    if(cached.ok) cacheSet(ckey, cached);
  }
  const r = cached;
  if(!r.ok){document.getElementById('proj-list').innerHTML=`<div class="empty"><div class="empty-icon">⚠️</div>${r.message}</div>`;return;}
  PROJECTS=r.projects;
  document.getElementById('proj-count').textContent=`${PROJECTS.length} โครงการ`;
  renderProjects();
}

function skeletonCards(n){
  return Array(n).fill(0).map(()=>`<div class="proj-card" style="pointer-events:none">
    <div class="proj-top">
      <div style="flex:1">
        <div class="skel skel-badge" style="width:80px;margin-bottom:8px"></div>
        <div class="skel skel-text" style="width:70%;margin-bottom:6px"></div>
        <div class="skel skel-text" style="width:40%"></div>
      </div>
      <div style="text-align:right"><div class="skel skel-text" style="width:80px"></div></div>
    </div>
  </div>`).join('');
}

function renderProjects(){
  const q    = document.getElementById('search').value.toLowerCase();
  const dept = document.getElementById('filter-dept')?.value||'';
  const sort = document.getElementById('filter-sort')?.value||'newest';
  let f = PROJECTS.filter(p=>
    (STATUS_F==='all'||p.status===STATUS_F) &&
    (!dept||p.dept===dept) &&
    (!q||(p.title||'').toLowerCase().includes(q)||(p.owner_name||'').toLowerCase().includes(q)||(p.dept||'').toLowerCase().includes(q))
  );
  // sort
  if(sort==='newest')      f.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  else if(sort==='oldest') f.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if(sort==='budget-high') f.sort((a,b)=>Number(b.budget_requested)-Number(a.budget_requested));
  else if(sort==='budget-low')  f.sort((a,b)=>Number(a.budget_requested)-Number(b.budget_requested));
  else if(sort==='name')        f.sort((a,b)=>(a.title||'').localeCompare(b.title||'','th'));

  const res = document.getElementById('filter-result');
  if(res) res.textContent = f.length !== PROJECTS.length ? `แสดง ${f.length} / ${PROJECTS.length} รายการ` : '';

  const wrap=document.getElementById('proj-list');
  if(!f.length){wrap.innerHTML='<div class="empty"><div class="empty-icon">📋</div>ไม่พบโครงการที่ตรงเงื่อนไข</div>';return;}
  wrap.innerHTML=f.map(p=>{
    const pct=p.budget_approved>0?Math.round((p.spent||0)/p.budget_approved*100):0;
    const bar=p.status==='approved'&&p.budget_approved>0?`<div class="prog-wrap"><div class="prog-info"><span>ใช้จ่าย ${fmt(p.spent||0)} บาท</span><span>${pct}%</span></div><div class="prog-bar"><div class="prog-fill" style="width:${Math.min(pct,100)}%;background:${pct>90?'#EF4444':'#22C55E'}"></div></div></div>`:'';
    return `<div class="proj-card ${p.status}" onclick="nav('detail',{id:'${p.project_id}'})">
      <div class="proj-top">
        <div>
          <div class="proj-meta"><span class="badge badge-${p.status}">${SL[p.status]}</span><span class="proj-dept">${esc(p.dept||'')}</span></div>
          <div class="proj-name">${esc(p.title)}</div>
          <div class="proj-owner">โดย ${esc(p.owner_name||'')} · ${fdate(p.created_at)}</div>
        </div>
        <div class="proj-right"><div class="proj-bud-l">งบที่ขอ</div><div class="proj-bud">${fmt(p.budget_requested)}</div><div class="proj-bud-l">บาท</div></div>
      </div>${bar}</div>`;
  }).join('');
}

/* ================================================================ CHECKBOX HELPERS */
function getChecked(name){
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(e=>e.value);
}
function setChecked(name, raw){
  // raw อาจเป็น string "val1||val2", array, false, undefined, null
  let vals=[];
  if(Array.isArray(raw)) vals=raw;
  else if(raw && typeof raw==='string') vals=raw.split('||').map(v=>v.trim()).filter(Boolean);
  document.querySelectorAll(`input[name="${name}"]`).forEach(el=>{
    el.checked=vals.includes(el.value);
  });
}
function getRadio(name){
  const el=document.querySelector(`input[name="${name}"]:checked`);
  return el?el.value:'';
}
function setRadio(name, val){
  const v=String(val||'').trim();
  document.querySelectorAll(`input[name="${name}"]`).forEach(el=>{
    el.checked = v!=='' && el.value===v;
  });
}

/* ================================================================ FORM */
function initForm(props={}){
  const p=props.project;
  document.getElementById('form-title').textContent=p?'แก้ไขโครงการ':'เสนอโครงการใหม่';

  // helper: แปลงค่าจาก Sheets ให้เป็น string (กัน false/Date/undefined/ISO string)
  function sv(val){
    if(val===null||val===undefined||val===false) return '';
    if(val instanceof Date){
      // แปลง Date object → YYYY-MM-DD (local timezone)
      const y=val.getFullYear();
      const m=String(val.getMonth()+1).padStart(2,'0');
      const d=String(val.getDate()).padStart(2,'0');
      return `${y}-${m}-${d}`;
    }
    const s=String(val);
    // ISO string เช่น "2025-03-29T00:00:00.000Z" หรือ "2025-03-29T17:00:00+07:00"
    if(/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0,10);
    // รูปแบบ "dd/mm/yyyy" จาก Sheets locale ไทย → แปลงเป็น yyyy-mm-dd
    if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){
      const [d2,m2,y2]=s.split('/');
      return `${y2}-${m2.padStart(2,'0')}-${d2.padStart(2,'0')}`;
    }
    return s;
  }

  // simple text fields
  const map={
    'f-id':'project_id','f-title':'title','f-dept':'dept',
    'f-budget-plan':'budget_plan','f-resp-group':'resp_group',
    'f-start':'start_date','f-end':'end_date','f-place':'place',
    'f-reason':'reason','f-obj-output':'obj_output','f-obj-outcome':'obj_outcome',
    'f-goal-qty':'goal_qty','f-goal-qual':'goal_qual',
    'f-budget':'budget_requested','f-budget-src':'budget_src',
    'f-risk':'risk','f-kpi-strategy':'kpi_strategy',
    'f-result':'result',
    'f-sign1':'sign1','f-sign1-pos':'sign1_pos',
    'f-sign2':'sign2','f-sign2-pos':'sign2_pos','f-sign3':'sign3'
  };
  Object.entries(map).forEach(([id,k])=>{
    const el=document.getElementById(id);
    if(!el) return;
    const val=p ? sv(p[k]) : '';
    // ถ้าเป็น select และค่าที่บันทึกไม่มีใน option → เพิ่มชั่วคราว
    if(el.tagName==='SELECT' && val){
      const exists=[...el.options].some(o=>o.value===val);
      if(!exists){
        const opt=document.createElement('option');
        opt.value=val; opt.textContent=val;
        el.appendChild(opt);
      }
    }
    el.value=val;
  });
  if(!p){ document.getElementById('f-sign3').value='นางสาวสู่ขวัญ ตลับนาค'; }

  // checkboxes / radios — ป้องกัน false/undefined จาก Sheets
  setChecked('proj_type',    p ? sv(p.proj_type)    : '');
  setRadio('strategy',       p ? sv(p.strategy)     : '');
  setRadio('policy',         p ? sv(p.policy)       : '');
  setChecked('focus',        p ? sv(p.focus)        : '');
  setChecked('royal_goal',   p ? sv(p.royal_goal)   : '');
  setChecked('school_strategy', p ? sv(p.school_strategy) : '');

  // dynamic rows
  try{ stepRows=JSON.parse(sv(p?.steps)||'[]'); }catch(_){ stepRows=[]; }
  if(!stepRows.length) stepRows=[{no:'1',detail:'',period:'',owner:'',budget:''}];
  renderSteps();

  try{ budgetRows=JSON.parse(sv(p?.budget_items)||'[]'); }catch(_){ budgetRows=[]; }
  if(!budgetRows.length) budgetRows=[{item:'',reward:0,service:0,material:0}];
  renderBudgetRows();

  try{ evalRows=JSON.parse(sv(p?.eval_items)||'[]'); }catch(_){ evalRows=[]; }
  if(!evalRows.length) evalRows=[{indicator:'',target:'',method:'',tool:''}];
  renderEvalRows();

  // signers — ผู้รับผิดชอบโครงการ (รองรับหลายคน)
  try{ signerRows=JSON.parse(sv(p?.signers)||'[]'); }catch(_){ signerRows=[]; }
  if(!signerRows.length){
    // backward compat: ดึงจาก sign1/sign1_pos เดิม
    signerRows=[{name:p?sv(p.sign1):ME?.name||'', pos:p?sv(p.sign1_pos):''}];
  }
  renderSigners();

  document.getElementById('form-err').classList.add('hidden');
  const btn=document.getElementById('btn-save');
  btn.disabled=false; btn.textContent='💾 บันทึก';
}

/* --- Steps --- */
function renderSteps(){
  const wrap=document.getElementById('steps-wrap');
  wrap.innerHTML=`<div class="step-head"><span>#</span><span>รายละเอียด</span><span>ระยะเวลา</span><span>ผู้รับผิดชอบ</span><span>งบประมาณ</span><span></span></div>`
    +stepRows.map((r,i)=>`
    <div class="step-row">
      <input value="${esc(r.no||String(i+1))}" oninput="stepRows[${i}].no=this.value" placeholder="${i+1}">
      <textarea oninput="stepRows[${i}].detail=this.value;autoResize(this)" placeholder="รายละเอียด">${esc(r.detail||'')}</textarea>
      <input value="${esc(r.period||'')}" oninput="stepRows[${i}].period=this.value" placeholder="เช่น พ.ค. 2568">
      <textarea oninput="stepRows[${i}].owner=this.value;autoResize(this)" placeholder="ผู้รับผิดชอบ">${esc(r.owner||'')}</textarea>
      <input type="number" value="${r.budget||''}" oninput="stepRows[${i}].budget=this.value" placeholder="0">
      <button class="bud-del" onclick="stepRows.splice(${i},1);renderSteps()">×</button>
    </div>`).join('');
  // auto-resize ทุก textarea หลัง render
  wrap.querySelectorAll('textarea').forEach(autoResize);
}
function addStep(){ stepRows.push({no:String(stepRows.length+1),detail:'',period:'',owner:'',budget:''}); renderSteps(); }

/* --- Budget rows --- */
function renderBudgetRows(){
  const wrap=document.getElementById('budget-items');
  wrap.innerHTML=budgetRows.map((r,i)=>{
    const total=(Number(r.reward||0)+Number(r.service||0)+Number(r.material||0));
    return `
    <div class="bud-card">
      <!-- แถวหลัก: ชื่อกิจกรรม + รวม + ลบ -->
      <div class="bud-card-head">
        <input class="bud-name" value="${esc(r.item||'')}" oninput="budgetRows[${i}].item=this.value"
               placeholder="ชื่อกิจกรรม/รายการ เช่น กิจกรรมที่ 1 ...">
        <div class="bud-total-badge">${fmt(total)} บาท</div>
        <button class="bud-del" onclick="budgetRows.splice(${i},1);renderBudgetRows()" title="ลบรายการนี้">×</button>
      </div>
      <!-- 3 คอลัมน์: ค่าตอบแทน / ค่าใช้สอย / ค่าวัสดุ -->
      <div class="bud-sub-grid">

        <div class="bud-sub-col ${Number(r.reward||0)>0?'has-val':''}">
          <div class="bud-sub-label">
            <label class="bud-sub-cb">
              <input type="checkbox" ${Number(r.reward||0)>0?'checked':''} onchange="if(!this.checked){budgetRows[${i}].reward=0;budgetRows[${i}].reward_detail='';renderBudgetRows();}else{this.closest('.bud-sub-col').classList.add('has-val');}">
              ค่าตอบแทน
            </label>
          </div>
          <div class="bud-sub-body">
            <input type="number" class="bud-sub-amt" value="${r.reward||''}"
              oninput="budgetRows[${i}].reward=Number(this.value);calcBudget();updateBudTotalBadge(${i})"
              placeholder="จำนวนเงิน (บาท)">
            <textarea class="bud-sub-detail" rows="2"
              oninput="budgetRows[${i}].reward_detail=this.value"
              placeholder="รายละเอียด เช่น ค่าวิทยากร 2 คน × ...">${esc(r.reward_detail||'')}</textarea>
          </div>
        </div>

        <div class="bud-sub-col ${Number(r.service||0)>0?'has-val':''}">
          <div class="bud-sub-label">
            <label class="bud-sub-cb">
              <input type="checkbox" ${Number(r.service||0)>0?'checked':''} onchange="if(!this.checked){budgetRows[${i}].service=0;budgetRows[${i}].service_detail='';renderBudgetRows();}else{this.closest('.bud-sub-col').classList.add('has-val');}">
              ค่าใช้สอย
            </label>
          </div>
          <div class="bud-sub-body">
            <input type="number" class="bud-sub-amt" value="${r.service||''}"
              oninput="budgetRows[${i}].service=Number(this.value);calcBudget();updateBudTotalBadge(${i})"
              placeholder="จำนวนเงิน (บาท)">
            <textarea class="bud-sub-detail" rows="2"
              oninput="budgetRows[${i}].service_detail=this.value"
              placeholder="รายละเอียด เช่น ค่าอาหาร 30 คน × ...">${esc(r.service_detail||'')}</textarea>
          </div>
        </div>

        <div class="bud-sub-col ${Number(r.material||0)>0?'has-val':''}">
          <div class="bud-sub-label">
            <label class="bud-sub-cb">
              <input type="checkbox" ${Number(r.material||0)>0?'checked':''} onchange="if(!this.checked){budgetRows[${i}].material=0;budgetRows[${i}].material_detail='';renderBudgetRows();}else{this.closest('.bud-sub-col').classList.add('has-val');}">
              ค่าวัสดุ
            </label>
          </div>
          <div class="bud-sub-body">
            <input type="number" class="bud-sub-amt" value="${r.material||''}"
              oninput="budgetRows[${i}].material=Number(this.value);calcBudget();updateBudTotalBadge(${i})"
              placeholder="จำนวนเงิน (บาท)">
            <textarea class="bud-sub-detail" rows="2"
              oninput="budgetRows[${i}].material_detail=this.value"
              placeholder="รายละเอียด เช่น กระดาษ เข้าเล่ม ...">${esc(r.material_detail||'')}</textarea>
          </div>
        </div>

      </div>
    </div>`;
  }).join('');
  calcBudget();
}

function updateBudTotalBadge(i){
  const total=Number(budgetRows[i].reward||0)+Number(budgetRows[i].service||0)+Number(budgetRows[i].material||0);
  const cards=document.querySelectorAll('.bud-card');
  if(cards[i]) cards[i].querySelector('.bud-total-badge').textContent=fmt(total)+' บาท';
}

function addBudgetRow(){
  budgetRows.push({item:'',reward:0,service:0,material:0,reward_detail:'',service_detail:'',material_detail:''});
  renderBudgetRows();
}
function calcBudget(){
  const total=budgetRows.reduce((s,r)=>s+(Number(r.reward||0)+Number(r.service||0)+Number(r.material||0)),0);
  document.getElementById('budget-total').textContent=fmt(total)+' บาท';
}

/* --- Eval rows --- */
function renderEvalRows(){
  const wrap=document.getElementById('eval-wrap');
  const qty =evalRows.filter(r=>r.type==='qty' ||!r.type);  // backward compat
  const qual=evalRows.filter(r=>r.type==='qual');

  function rowHtml(r,i){
    return `<div class="eval-row">
      <textarea oninput="evalRows[${i}].indicator=this.value;autoResize(this)" placeholder="เช่น นักเรียนร้อยละ 80 มีส่วนร่วม..." rows="2">${esc(r.indicator||'')}</textarea>
      <input value="${esc(r.target||'')}" oninput="evalRows[${i}].target=this.value" placeholder="ร้อยละ 80">
      <input value="${esc(r.method||'')}" oninput="evalRows[${i}].method=this.value" placeholder="การสังเกต">
      <input value="${esc(r.tool||'')}" oninput="evalRows[${i}].tool=this.value" placeholder="แบบสังเกต">
      <button class="bud-del" onclick="evalRows.splice(${i},1);renderEvalRows()">×</button>
    </div>`;
  }

  const head=`<div class="eval-head">
    <span>ตัวชี้วัดความสำเร็จ</span>
    <span>ค่าเป้าหมาย</span>
    <span>วิธีการวัดและประเมิน</span>
    <span>เครื่องมือประเมิน</span>
    <span></span>
  </div>`;

  // แถว qty — หาก index ใน evalRows
  const qtyHtml=evalRows
    .map((r,i)=>({r,i}))
    .filter(({r})=>r.type==='qty'||!r.type)
    .map(({r,i})=>rowHtml(r,i))
    .join('');

  const qualHtml=evalRows
    .map((r,i)=>({r,i}))
    .filter(({r})=>r.type==='qual')
    .map(({r,i})=>rowHtml(r,i))
    .join('');

  wrap.innerHTML=`
    <div class="eval-section">
      <div class="eval-type-label qty">เชิงปริมาณ</div>
      ${head}
      <div id="eval-qty-rows">${qtyHtml}</div>
      <button class="btn-ghost" style="margin-top:6px;font-size:12px" onclick="addEvalRow('qty')">+ เพิ่มตัวชี้วัดเชิงปริมาณ</button>
    </div>
    <div class="eval-section" style="margin-top:14px">
      <div class="eval-type-label qual">เชิงคุณภาพ</div>
      ${head}
      <div id="eval-qual-rows">${qualHtml}</div>
      <button class="btn-ghost" style="margin-top:6px;font-size:12px" onclick="addEvalRow('qual')">+ เพิ่มตัวชี้วัดเชิงคุณภาพ</button>
    </div>`;
  // auto-resize ทุก textarea หลัง render
  wrap.querySelectorAll('textarea').forEach(autoResize);
}

function addEvalRow(type='qty'){
  evalRows.push({type,indicator:'',target:'',method:'',tool:''});
  renderEvalRows();
}

/* --- Signers (ผู้รับผิดชอบโครงการ) --- */
function renderSigners(){
  const wrap=document.getElementById('signers-wrap');
  if(!wrap) return;
  wrap.innerHTML=signerRows.map((r,i)=>`
    <div class="signer-row">
      <input value="${esc(r.name||'')}" oninput="signerRows[${i}].name=this.value" placeholder="ชื่อ-นามสกุล">
      <input value="${esc(r.pos||'')}" oninput="signerRows[${i}].pos=this.value" placeholder="ตำแหน่ง">
      ${signerRows.length>1?`<button class="bud-del" onclick="signerRows.splice(${i},1);renderSigners()" title="ลบ">×</button>`:'<span style="width:32px"></span>'}
    </div>`).join('');
}
function addSigner(){
  signerRows.push({name:'',pos:''});
  renderSigners();
}

/* --- Save --- */
async function saveProject(){
  const title=document.getElementById('f-title').value.trim();
  const dept=document.getElementById('f-dept').value;
  const budget=document.getElementById('f-budget').value;
  const errs=[];
  if(!title) errs.push('กรุณากรอกชื่อโครงการ');
  if(!dept)  errs.push('กรุณาเลือกกลุ่มสาระ/หน่วยงาน');
  if(!budget||Number(budget)<=0) errs.push('กรุณากรอกงบประมาณ');
  const errEl=document.getElementById('form-err');
  if(errs.length){errEl.textContent=errs.join(' · ');errEl.classList.remove('hidden');return;}
  errEl.classList.add('hidden');
  const btn=document.getElementById('btn-save');
  btn.disabled=true; btn.textContent='กำลังบันทึก...';

  const g=id=>document.getElementById(id)?.value||'';
  const payload={
    project_id:   g('f-id')||undefined,
    title, dept,
    proj_type:    getChecked('proj_type').join('||'),
    budget_plan:  g('f-budget-plan'),
    resp_group:   g('f-resp-group'),
    start_date:   g('f-start'),
    end_date:     g('f-end'),
    place:        g('f-place'),
    strategy:     getRadio('strategy'),
    policy:       getRadio('policy'),
    focus:        getChecked('focus').join('||'),
    royal_goal:   getChecked('royal_goal').join('||'),
    school_strategy: getChecked('school_strategy').join('||'),
    kpi_strategy: g('f-kpi-strategy'),
    reason:       g('f-reason'),
    obj_output:   g('f-obj-output'),
    obj_outcome:  g('f-obj-outcome'),
    goal_qty:     g('f-goal-qty'),
    goal_qual:    g('f-goal-qual'),
    budget_requested: Number(budget),
    budget_src:   g('f-budget-src'),
    risk:         g('f-risk'),
    result:       g('f-result'),
    sign1:        signerRows[0]?.name||'',
    sign1_pos:    signerRows[0]?.pos||'',
    sign2:        g('f-sign2'),
    sign2_pos:    g('f-sign2-pos'),
    sign3:        g('f-sign3'),
    signers:      JSON.stringify(signerRows),
    steps:        JSON.stringify(stepRows.filter(r=>r.detail||r.owner)),
    budget_items: JSON.stringify(budgetRows.filter(r=>r.item)),
    eval_items:   JSON.stringify(evalRows.filter(r=>r.indicator)),
  };

  const r=await apiPost('saveProject',payload);
  if(r.ok){ toast(`บันทึกสำเร็จ! รหัส ${r.project_id}`); nav('projects'); }
  else{ toast(r.message||'เกิดข้อผิดพลาด','error'); btn.disabled=false; btn.textContent='💾 บันทึก'; }
}

/* ================================================================ PRINT PDF */
function buildDocHTML(data){
  // data = object with all project fields, ถ้าไม่ส่งมาจะอ่านจาก form DOM
  const g = data
    ? (id) => {
        const fieldMap={
          'f-id':'project_id','f-title':'title','f-dept':'dept',
          'f-budget-plan':'budget_plan','f-resp-group':'resp_group',
          'f-start':'start_date','f-end':'end_date','f-place':'place',
          'f-reason':'reason','f-obj-output':'obj_output','f-obj-outcome':'obj_outcome',
          'f-goal-qty':'goal_qty','f-goal-qual':'goal_qual',
          'f-budget':'budget_requested','f-budget-src':'budget_src',
          'f-risk':'risk','f-kpi-strategy':'kpi_strategy',
          'f-result':'result',
          'f-sign1':'sign1','f-sign1-pos':'sign1_pos',
          'f-sign2':'sign2','f-sign2-pos':'sign2_pos','f-sign3':'sign3'
        };
        const k=fieldMap[id]; return k?String(data[k]||''):'';
      }
    : (id) => document.getElementById(id)?.value||'';

  // checkbox/radio values — จาก data object หรือจาก DOM
  const projTypes  = data ? (data.proj_type||'').split('||').filter(Boolean)        : getChecked('proj_type');
  const strategy   = data ? (data.strategy||'')                                      : getRadio('strategy');
  const policy     = data ? (data.policy||'')                                        : getRadio('policy');
  const focuses    = data ? (data.focus||'').split('||').filter(Boolean)             : getChecked('focus');
  const royalGoals = data ? (data.royal_goal||'').split('||').filter(Boolean)        : getChecked('royal_goal');
  const schoolStrats=data ? (data.school_strategy||'').split('||').filter(Boolean)   : getChecked('school_strategy');

  // rows — จาก data object หรือจาก globals
  const sRows = data ? (()=>{ try{ return JSON.parse(data.steps||'[]'); }catch(_){return [];} })() : stepRows;
  const bRows = data ? (()=>{ try{ return JSON.parse(data.budget_items||'[]'); }catch(_){return [];} })() : budgetRows;
  const eRows2= data ? (()=>{ try{ return JSON.parse(data.eval_items||'[]'); }catch(_){return [];} })() : evalRows;

  const yr=new Date().getFullYear()+543;

  const ALL_PROJ_TYPES=['โครงการใหม่','โครงการต่อเนื่อง','งานประจำ','งานพัฒนา'];
  const ALL_STRATEGIES=[
    'ยุทธศาสตร์ที่ 1 ด้านความมั่นคง',
    'ยุทธศาสตร์ที่ 2 ด้านการสร้างความสามารถในการแข่งขัน',
    'ยุทธศาสตร์ที่ 3 ด้านการพัฒนาและเสริมสร้างศักยภาพทรัพยากรมนุษย์',
    'ยุทธศาสตร์ที่ 4 ด้านการสร้างโอกาส ความเสมอภาคและเท่าเทียมกันทางสังคม',
    'ยุทธศาสตร์ที่ 5 ด้านการสร้างการเติบโตบนคุณภาพชีวิตที่เป็นมิตรกับสิ่งแวดล้อม',
    'ยุทธศาสตร์ที่ 6 ด้านการปรับสมดุลและพัฒนาระบบการบริหารจัดการภาครัฐ',
  ];
  const ALL_POLICIES=[
    'นโยบายที่ 1 ปลูกฝังความรักในสถาบันหลักของชาติ และน้อมนำพระบรมราโชบายด้านการศึกษาสู่การปฏิบัติ',
    'นโยบายที่ 2 จัดการเรียนรู้ประวัติศาสตร์ หน้าที่พลเมือง ศีลธรรม และประชาธิปไตย',
    'นโยบายที่ 3 ปรับกระบวนการจัดการเรียนรู้ด้วยเทคโนโลยีที่ทันสมัย',
    'นโยบายที่ 4 ส่งเสริมการอ่าน เพื่อเปิดวิถีในการค้นหาความรู้และต่อยอดองค์ความรู้สูงขึ้น',
    'นโยบายที่ 5 ส่งเสริม สนับสนุนกิจกรรมพัฒนาผู้เรียน',
    'นโยบายที่ 6 จัดการศึกษาแบบเรียนรวมสำหรับเด็กที่มีความต้องการจำเป็นพิเศษ',
    'นโยบายที่ 7 จัดการศึกษาเพื่อความเป็นเลิศสำหรับผู้มีความสามารถพิเศษ',
    'นโยบายที่ 8 เสริมสร้างความปลอดภัยของสถานศึกษา',
    'นโยบายที่ 9 เพิ่มโอกาสและสร้างความเสมอภาคทางการศึกษา',
    'นโยบายที่ 10 พัฒนาครูและบุคลากรทางการศึกษา',
    'นโยบายที่ 11 ลดภาระครูและบุคลากรทางการศึกษา',
    'นโยบายที่ 12 ลดภาระนักเรียนและผู้ปกครอง',
    'นโยบายที่ 13 พัฒนาระบบบริหารจัดการให้มีประสิทธิภาพ โปร่งใส และตรวจสอบได้ พัฒนาระบบบริหารจัดการให้มีประสิทธิภาพ ถูกต้อง',
  ];
  const ALL_FOCUS=['ยกระดับผลสัมฤทธิ์','ทักษะคิดแก้ว่าคล่อง','ว่องไวเขียนอ่าน','สื่อสารเทคโนโลยี','จัดการดีสิ่งแวดล้อม','น้อมนำศาสตร์พระราชา'];
  const ALL_ROYAL=[
    'เป้าหมายหลักที่ 1 เสริมสร้างสุขภาพของเด็กและเยาวชนตั้งแต่ในครรภ์มารดา',
    'เป้าหมายหลักที่ 2 เพิ่มโอกาสทางการศึกษา',
    'เป้าหมายหลักที่ 3 เสริมสร้างศักยภาพของเด็กและเยาวชนทางวิชาการและทางจริยธรรม',
    'เป้าหมายหลักที่ 4 เสริมสร้างศักยภาพของเด็กและเยาวชนทางการงานอาชีพ',
    'เป้าหมายหลักที่ 5 ปลูกฝังจิตสำนึกและพัฒนาคุณภาพของเด็กและเยาวชนในการอนุรักษ์ทรัพยากรธรรมชาติและสิ่งแวดล้อม',
    'เป้าหมายหลักที่ 6 เสริมสร้างศักยภาพของเด็กและเยาวชนในการอนุรักษ์และสืบทอดวัฒนธรรมภูมิปัญญาท้องถิ่นและของชาติไทย',
    'เป้าหมายหลักที่ 7 ขยายการพัฒนาจากโรงเรียนสู่ชุมชน',
    'เป้าหมายหลักที่ 8 พัฒนาสถานศึกษาเป็นศูนย์บริหารความรู้',
  ];
  const ALL_SCHOOL_STRATEGY=[
    'กลยุทธ์ที่ 1 สืบสานงานพระราชดำริของสมเด็จพระกนิษฐาธิราชเจ้า กรมสมเด็จพระเทพรัตนราชสุดาฯ สยามบรมราชกุมารี',
    'กลยุทธ์ที่ 2 ยกระดับคุณภาพผู้เรียนรอบด้าน เสริมสร้างทักษะชีวิตและทักษะอาชีพ',
    'กลยุทธ์ที่ 3 การพัฒนากระบวนการจัดการเรียนการสอนที่เน้นผู้เรียนเป็นสำคัญ',
    'กลยุทธ์ที่ 4 พัฒนาครูให้มีคุณภาพตามมาตรฐานและมีมรรยาทวิชาชีพ',
    'กลยุทธ์ที่ 5 ส่งเสริมพัฒนากระบวนการบริหารจัดการ โดยการมีส่วนร่วมจากทุกภาคส่วน',
    'กลยุทธ์ที่ 6 สร้างสภาพแวดล้อมในสถานศึกษาให้เป็นพื้นที่ปลอดภัยและเอื้อต่อการเรียนรู้',
  ];

  // SVG checkbox สำหรับ PDF — ขนาดคงที่ ไม่ล้นกรอบ
  function cbBox(checked){
    return checked
      ? `<svg width="13" height="13" viewBox="0 0 13 13" style="flex-shrink:0;margin-top:2px" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="12" height="12" rx="2" fill="#1C2333" stroke="#1C2333"/><polyline points="2.5,6.5 5.5,9.5 10.5,3.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 13 13" style="flex-shrink:0;margin-top:2px" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="12" height="12" rx="2" fill="#fff" stroke="#999"/></svg>`;
  }
  function rbBox(checked){
    return checked
      ? `<svg width="13" height="13" viewBox="0 0 13 13" style="flex-shrink:0;margin-top:2px" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="6" fill="#fff" stroke="#1C2333"/><circle cx="6.5" cy="6.5" r="3.5" fill="#1C2333"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 13 13" style="flex-shrink:0;margin-top:2px" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="6" fill="#fff" stroke="#999"/></svg>`;
  }

  function cbList(allItems, selected, useRadio=false){
    return `<div style="margin:4px 0 8px;padding-left:8px">
      ${allItems.map(v=>`
        <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px;font-size:12px">
          ${useRadio ? rbBox(selected.includes(v)) : cbBox(selected.includes(v))}
          <span style="line-height:1.5">${esc(v)}</span>
        </div>`).join('')}
    </div>`;
  }
  function cbRow(allItems, selected){
    return `<div style="display:flex;flex-wrap:wrap;gap:6px 20px;margin:4px 0 8px;padding-left:8px">
      ${allItems.map(v=>`
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px">
          ${cbBox(selected.includes(v))}
          <span>${esc(v)}</span>
        </span>`).join('')}
    </div>`;
  }

  // steps table
  const stepsHtml=sRows.filter(r=>r.detail).length
    ?`<table class="doc-table">
        <thead><tr><th style="width:36px;text-align:center">ที่</th><th>รายละเอียดในการดำเนินงาน</th><th style="width:100px">ระยะเวลาดำเนินการ</th><th style="width:120px">ผู้รับผิดชอบ</th><th style="width:80px;text-align:right">งบประมาณ</th></tr></thead>
        <tbody>${sRows.filter(r=>r.detail).map((r,i)=>`<tr><td style="text-align:center">${r.no||i+1}.</td><td>${esc(r.detail)}</td><td>${esc(r.period)}</td><td>${esc(r.owner)}</td><td style="text-align:right">${r.budget?fmt(r.budget):''}</td></tr>`).join('')}</tbody>
      </table>`:'<p style="padding-left:20px;font-size:12px">—</p>';

  // budget table
  const bItems=bRows.filter(r=>r.item);
  const bTotRew=bItems.reduce((s,r)=>s+Number(r.reward||0),0);
  const bTotSvc=bItems.reduce((s,r)=>s+Number(r.service||0),0);
  const bTotMat=bItems.reduce((s,r)=>s+Number(r.material||0),0);
  const bTotAll=bTotRew+bTotSvc+bTotMat;
  const budHtml=bItems.length
    ?`<table class="doc-table">
        <thead>
          <tr>
            <th rowspan="2">กิจกรรมและรายละเอียดในการใช้งบประมาณ</th>
            <th rowspan="2" style="width:80px;text-align:right">งบประมาณที่ใช้</th>
            <th colspan="3" style="text-align:center">งบประมาณจำแนกตามหมวดรายจ่าย</th>
          </tr>
          <tr>
            <th style="width:75px;text-align:right">ค่าตอบแทน</th>
            <th style="width:75px;text-align:right">ค่าใช้สอย</th>
            <th style="width:75px;text-align:right">ค่าวัสดุ</th>
          </tr>
        </thead>
        <tbody>
          ${bItems.map(r=>{
            const tot=Number(r.reward||0)+Number(r.service||0)+Number(r.material||0);
            // sub-detail rows
            const details=[];
            if(Number(r.reward||0)>0&&r.reward_detail) details.push(`<tr style="background:#fafbff"><td style="padding-left:20px;font-size:11px;color:#555">${esc(r.reward_detail)}</td><td></td><td style="text-align:right;font-size:11px;color:#555">${fmt(r.reward)}</td><td></td><td></td></tr>`);
            if(Number(r.service||0)>0&&r.service_detail) details.push(`<tr style="background:#fafbff"><td style="padding-left:20px;font-size:11px;color:#555">${esc(r.service_detail)}</td><td></td><td></td><td style="text-align:right;font-size:11px;color:#555">${fmt(r.service)}</td><td></td></tr>`);
            if(Number(r.material||0)>0&&r.material_detail) details.push(`<tr style="background:#fafbff"><td style="padding-left:20px;font-size:11px;color:#555">${esc(r.material_detail)}</td><td></td><td></td><td></td><td style="text-align:right;font-size:11px;color:#555">${fmt(r.material)}</td></tr>`);
            return `<tr style="font-weight:600"><td>${esc(r.item)}</td><td style="text-align:right">${fmt(tot)}</td><td style="text-align:right">${r.reward?fmt(r.reward):''}</td><td style="text-align:right">${r.service?fmt(r.service):''}</td><td style="text-align:right">${r.material?fmt(r.material):''}</td></tr>${details.join('')}`;
          }).join('')}
          <tr style="background:#ecf0f8;font-weight:700"><td>รวมงบประมาณทั้งสิ้น</td><td style="text-align:right">${fmt(bTotAll)}</td><td style="text-align:right">${bTotRew?fmt(bTotRew):''}</td><td style="text-align:right">${bTotSvc?fmt(bTotSvc):''}</td><td style="text-align:right">${bTotMat?fmt(bTotMat):''}</td></tr>
        </tbody>
      </table>`:'<p style="padding-left:20px;font-size:12px">—</p>';

  // eval table — แยก เชิงปริมาณ / เชิงคุณภาพ
  const eQty =eRows2.filter(r=>r.type==='qty'||!r.type).filter(r=>r.indicator);
  const eQual=eRows2.filter(r=>r.type==='qual').filter(r=>r.indicator);
  function evalTable(rows){
    if(!rows.length) return '<p style="padding-left:20px;font-size:12px;color:#888">ไม่มีข้อมูล</p>';
    return `<table class="doc-table">
      <thead><tr><th>ตัวชี้วัดความสำเร็จ</th><th style="width:90px">ค่าเป้าหมาย</th><th>วิธีการวัดและประเมินผล</th><th>เครื่องมือที่ใช้ในการประเมินผล</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${esc(r.indicator)}</td><td>${esc(r.target)}</td><td>${esc(r.method)}</td><td>${esc(r.tool)}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  const evalHtml=`
    <div style="font-weight:700;font-size:13px;margin:6px 0 3px">เชิงปริมาณ</div>
    ${evalTable(eQty)}
    <div style="font-weight:700;font-size:13px;margin:8px 0 3px">เชิงคุณภาพ</div>
    ${evalTable(eQual)}`;

  const sgnRows = data
    ? (()=>{ try{ return JSON.parse(data.signers||'[]'); }catch(_){return [];} })()
    : signerRows;
  // backward compat ถ้าไม่มี signers array
  const signersArr = sgnRows.length>0 ? sgnRows
    : [{name: data?(data.sign1||''):(g('f-sign1')||ME?.name||''),
        pos:  data?(data.sign1_pos||''):(g('f-sign1-pos')||'')}];

  const sign2   = data ? (data.sign2||'')    : g('f-sign2');
  const sign2pos= data ? (data.sign2_pos||''): g('f-sign2-pos');
  const sign3   = data ? (data.sign3||'นางสาวสู่ขวัญ ตลับนาค') : (g('f-sign3')||'นางสาวสู่ขวัญ ตลับนาค');

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>แบบโครงการ — ${esc(g('f-title'))}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Prompt:wght@600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Sarabun',sans-serif;font-size:13.5px;line-height:1.7;color:#000;background:#fff;padding:14mm 18mm}
  .print-toolbar{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:8px 18px;background:#1C2333;color:#fff;font-size:12px;z-index:999}
  .print-toolbar button{background:rgba(255,255,255,.18);border:none;color:#fff;padding:5px 12px;border-radius:5px;font-size:12px;cursor:pointer;font-family:'Sarabun',sans-serif;margin-left:6px}
  .print-toolbar .do-print{background:#3B82F6;font-weight:700}
  body{padding-top:52px}
  /* header */
  .doc-center{text-align:center}
  .doc-school{font-size:16px;font-weight:800;margin-bottom:2px}
  .doc-sub{font-size:13px;margin-bottom:8px}
  .doc-main-title{font-size:15px;font-weight:800;text-decoration:underline;text-underline-offset:4px;margin:8px 0 14px}
  /* meta rows */
  .meta-row{display:flex;gap:0;margin-bottom:3px;font-size:13px}
  .meta-key{font-weight:700;width:160px;flex-shrink:0}
  .meta-val{flex:1}
  /* section heading */
  .doc-h{font-size:13.5px;font-weight:800;margin:12px 0 4px;padding:3px 8px;background:#eef0f5;border-left:4px solid #1C2333}
  .doc-h-bold{font-size:13.5px;font-weight:800;margin:10px 0 3px}
  /* body */
  .doc-body{font-size:13px;line-height:1.85;white-space:pre-wrap;margin-bottom:5px}
  .indent{padding-left:24px}
  /* tables */
  .doc-table{width:100%;border-collapse:collapse;font-size:12px;margin:5px 0 10px}
  .doc-table th{background:#dce3ef;padding:5px 8px;text-align:left;border:1px solid #999;font-weight:700}
  .doc-table td{padding:5px 8px;border:1px solid #999;vertical-align:top}
  /* divider */
  hr{border:none;border-top:1.5px solid #000;margin:10px 0 6px}
  /* page break */
  .page-break{page-break-before:always;break-before:always;padding-top:0}
  /* signatures */
  .sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:36px;text-align:center;font-size:13px;line-height:1.8}
  .sign-line{border-bottom:1px solid #000;margin:40px 6px 10px}
  @media print{
    body{padding:0 18mm;background:#fff!important;color:#000!important}
    .print-toolbar{display:none!important}
    .doc-table th{background:#dce3ef!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .doc-h{background:#eef0f5!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page-break{page-break-before:always;break-before:always;padding-top:14mm}
  }
</style>
</head>
<body>
  <div class="print-toolbar">
    <span>📄 แบบโครงการ — ${esc(g('f-title'))}</span>
    <div>
      <button class="do-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
      <button onclick="window.close()">✕ ปิด</button>
    </div>
  </div>

  <div class="doc-center">
    <div class="doc-school">โรงเรียนบ้านคลอง 14</div>
    <div class="doc-sub">สำนักงานเขตพื้นที่การศึกษาประถมศึกษานครนายก</div>
    <div class="doc-main-title">แบบโครงการ/กิจกรรม ปีงบประมาณ พ.ศ.${yr}</div>
  </div>

  <!-- ข้อมูลโครงการ -->
  <div class="meta-row"><span class="meta-key">โครงการ</span><span class="meta-val"><b>${esc(g('f-title'))}</b></span></div>
  <div class="meta-row">
    <span class="meta-key">ลักษณะโครงการ</span>
    <span class="meta-val">
      ${cbRow(ALL_PROJ_TYPES, projTypes)}
    </span>
  </div>

  <hr>

  <!-- ยุทธศาสตร์ชาติ -->
  <div style="font-weight:800;font-size:13px;margin:8px 0 3px">ยุทธศาสตร์ชาติ 20 ปี  (โปรดเลือกเพียง 1 ยุทธศาสตร์ที่สอดคล้องมากที่สุด)</div>
  ${cbList(ALL_STRATEGIES, strategy?[strategy]:[], true)}

  <!-- นโยบาย สพฐ. -->
  <div style="font-weight:800;font-size:13px;margin:8px 0 3px">นโยบายสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน  (โปรดเลือกเพียง 1 นโยบายที่สอดคล้องมากที่สุด)</div>
  ${cbList(ALL_POLICIES, policy?[policy]:[], true)}

  <!-- จุดเน้น สพป.นย. -->
  <div style="font-weight:800;font-size:13px;margin:8px 0 3px">จุดเน้น สพป.นย.</div>
  ${cbRow(ALL_FOCUS, focuses)}

  <!-- เป้าหมายหลักแผนพัฒนาฯ -->
  <div style="font-weight:800;font-size:13px;margin:8px 0 3px">เป้าหมายหลักแผนพัฒนาคุณภาพกลุ่มโรงเรียนพระราชดำริ</div>
  ${cbList(ALL_ROYAL, royalGoals)}

  <!-- กลยุทธ์ -->
  <div style="font-weight:800;font-size:13px;margin:8px 0 3px">กลยุทธ์ (Strategy)</div>
  ${cbList(ALL_SCHOOL_STRATEGY, schoolStrats)}
  ${g('f-kpi-strategy')?`<div style="padding-left:8px;font-size:12px"><b>ตัวชี้วัด</b> ${esc(g('f-kpi-strategy'))}</div>`:''}

  <!-- ===== หน้าที่ 2 : แผนงาน + เนื้อหาโครงการ ===== -->
  <div class="page-break">

  <div class="doc-center" style="margin-bottom:12px">
    <div class="doc-school">โรงเรียนบ้านคลอง 14</div>
    <div class="doc-sub">สำนักงานเขตพื้นที่การศึกษาประถมศึกษานครนายก</div>
    <div class="doc-main-title">แบบโครงการ/กิจกรรม ปีงบประมาณ พ.ศ.${yr} (ต่อ)</div>
  </div>

  <!-- แผนงานงบประมาณ -->
  <div class="meta-row"><span class="meta-key" style="font-weight:700">แผนงานงบประมาณ</span><span class="meta-val">${esc(g('f-budget-plan'))||'—'}</span></div>
  <div class="meta-row"><span class="meta-key" style="font-weight:700">กลุ่มที่รับผิดชอบ</span><span class="meta-val">${esc(g('f-resp-group'))||esc(g('f-dept'))||'—'}</span></div>
  <hr>

  <!-- 1. หลักการและเหตุผล -->
  <div class="doc-h">1. หลักการและเหตุผล</div>
  <div class="doc-body indent">${esc(g('f-reason'))||'—'}</div>

  <!-- 2. วัตถุประสงค์ -->
  <div class="doc-h">2. วัตถุประสงค์</div>
  <div class="doc-h-bold">ผลผลิต (Outputs)</div>
  <div class="doc-body indent">${esc(g('f-obj-output'))||'—'}</div>
  <div class="doc-h-bold">ผลลัพธ์ (Outcomes)</div>
  <div class="doc-body indent">${esc(g('f-obj-outcome'))||'—'}</div>

  <!-- 3. เป้าหมาย -->
  <div class="doc-h">3. เป้าหมาย</div>
  <div class="doc-h-bold">เชิงปริมาณ</div>
  <div class="doc-body indent">${esc(g('f-goal-qty'))||'—'}</div>
  <div class="doc-h-bold">เชิงคุณภาพ</div>
  <div class="doc-body indent">${esc(g('f-goal-qual'))||'—'}</div>

  <!-- 4. วิธีดำเนินการ -->
  <div class="doc-h">4. วิธีดำเนินการ/ขั้นตอนการดำเนินงาน</div>
  ${stepsHtml}

  <!-- 5. ระยะเวลาและสถานที่ -->
  <div class="doc-h">5. ระยะเวลาและสถานที่ดำเนินการ</div>
  <div class="doc-body indent">
    ○ ดำเนินการ วันที่ ${g('f-start')?fdate(g('f-start'))+' ถึง วันที่ '+fdate(g('f-end')):'—'}<br>
    ○ สถานที่ดำเนินการ  ${esc(g('f-place'))||'โรงเรียนบ้านคลอง 14'}
  </div>

  <!-- 6. งบประมาณ -->
  <div class="doc-h">6. งบประมาณ</div>
  <div class="doc-body indent">
    จำนวน <b>${fmt(g('f-budget'))} บาท</b>  จากแผนงบประมาณ : ${esc(g('f-budget-src'))||'—'}
    <br>(ขอถัวจ่ายทุกรายการ) รายละเอียดตามเอกสารที่แนบ
  </div>
  ${budHtml}

  <!-- 7. การวิเคราะห์ความเสี่ยง -->
  <div class="doc-h">7. การวิเคราะห์ความเสี่ยงของโครงการ</div>
  <div class="doc-body indent">${esc(g('f-risk'))||'—'}</div>

  <!-- 8. การประเมินผล -->
  <div class="doc-h">8. การประเมินผล /ตัวชี้วัดความสำเร็จและค่าเป้าหมาย</div>
  ${evalHtml}

  <!-- 9. ผลลัพธ์ที่คาดว่าจะได้รับ -->
  <div class="doc-h">9. ผลลัพธ์ / ผลผลิต ที่เกิดจากโครงการ</div>
  <div class="doc-body indent">${esc(g('f-result'))||'—'}</div>

  <!-- ลงชื่อ -->
  <div class="sign-grid" style="grid-template-columns:repeat(${Math.min(signersArr.length+2,4)},1fr)">
    ${signersArr.map(s=>`
    <div>
      <div style="height:50px"></div>
      <div>ลงชื่อ.......................................<br>
      (${esc(s.name||'..............................')})<br>
      ${s.pos?`ตำแหน่ง ${esc(s.pos)}<br>`:''}
      ผู้รับผิดชอบโครงการ</div>
    </div>`).join('')}
    <div>
      <div style="height:50px"></div>
      <div>ลงชื่อ.......................................<br>
      (${sign2?esc(sign2):'......................................'})<br>
      ${sign2pos?`ตำแหน่ง ${esc(sign2pos)}<br>`:''}
      ผู้เสนอโครงการ</div>
    </div>
    <div>
      <div style="height:50px"></div>
      <div>ลงชื่อ.......................................<br>
      (${esc(sign3)})<br>
      ผู้อำนวยการโรงเรียนบ้านคลอง 14<br>
      ผู้อนุมัติโครงการ</div>
    </div>
  </div>

  </div><!-- end page-break -->

</body></html>`;
}

function printPreview(){
  // อ่านจาก form DOM (เรียกตอนอยู่หน้า form)
  const html=buildDocHTML(null);
  const w=window.open('','_blank','width=960,height=750,scrollbars=yes');
  if(!w){ toast('กรุณาอนุญาต popup แล้วลองใหม่','error'); return; }
  w.document.write(html);
  w.document.close();
}
function closePrint(){}

async function printFromDetail(pid){
  const email = ME ? ME.email : GUEST_EMAIL;
  const r = await apiRaw('getProject',{id:pid, userEmail:email});
  if(!r.ok){ toast('ไม่สามารถโหลดข้อมูลโครงการได้','error'); return; }
  const html=buildDocHTML(r.project);
  const w=window.open('','_blank','width=960,height=750,scrollbars=yes');
  if(!w){ toast('กรุณาอนุญาต popup แล้วลองใหม่','error'); return; }
  w.document.write(html);
  w.document.close();
}

/* ================================================================ DETAIL */
async function loadDetail(projectId){
  const wrap=document.getElementById('det-body');
  wrap.innerHTML='<div class="loading">กำลังโหลด...</div>';
  document.getElementById('det-actions').innerHTML='';
  const email = ME ? ME.email : GUEST_EMAIL;
  const [pr, ex, er] = await Promise.all([
    apiRaw('getProject',        {id:projectId, userEmail:email}),
    apiRaw('getExpenses',       {projectId, userEmail:email}),
    ME ? apiRaw('getExpenseRequests', {projectId, userEmail:email}) : Promise.resolve({ok:false})
  ]);
  if(!pr.ok){wrap.innerHTML=`<div style="color:#EF4444;padding:24px">${pr.message}</div>`;return;}
  const p        = pr.project;
  const expenses = ex.ok ? ex.expenses : [];
  const requests = er.ok ? er.requests : [];
  const pendingReqs = requests.filter(r=>r.status==='pending');

  const spent     = expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const remaining = Number(p.budget_approved||0)-spent;
  const pct       = p.budget_approved>0 ? Math.round(spent/p.budget_approved*100) : 0;

  const canAppr    = ME && (ME.role==='admin'||ME.role==='finance');
  const canAct     = canAppr && p.status!=='approved' && p.status!=='rejected';
  const canEdit    = ME && ME.email===p.owner_email && p.status==='pending';
  const isOwner    = ME && ME.email===p.owner_email;
  // ครูยื่นคำขอใหม่ได้เมื่อโครงการอนุมัติแล้ว
  const canRequest = ME && ME.role==='teacher' && p.status==='approved' && isOwner;
  // เจ้าของโครงการอัปโหลดหลักฐานได้เสมอ (แม้โครงการ approved แล้ว)
  const canUploadDoc = ME && ME.role==='teacher' && isOwner;

  document.getElementById('det-title').textContent=p.title;
  const acts=[];
  if(canEdit) acts.push(`<button class="btn-sec" onclick="editProj('${p.project_id}')">✏️ แก้ไข</button>`);
  if(ME && ME.role==='teacher') acts.push(`<button class="btn-sec" onclick="copyProject('${p.project_id}')">📋 คัดลอก</button>`);
  acts.push(`<button class="btn-sec" onclick="printFromDetail('${p.project_id}')">🖨 PDF</button>`);
  document.getElementById('det-actions').innerHTML=acts.join('');

  let bItems=[],sItems=[],eItems=[];
  try{bItems=JSON.parse(p.budget_items||'[]');}catch(_){}
  try{sItems=JSON.parse(p.steps||'[]');}catch(_){}
  try{eItems=JSON.parse(p.eval_items||'[]');}catch(_){}

  const expBadge = expenses.length + (pendingReqs.length ? ` <span class="req-badge">${pendingReqs.length} รอ</span>` : '');

  wrap.innerHTML=`
    <div class="det-header-meta">
      <span class="badge badge-${p.status}">${SL[p.status]}</span>
      <span class="det-id">${p.project_id}</span>
    </div>
    <div class="det-kpis">
      <div class="mini-kpi"><div class="mini-kpi-l">งบที่ขอ</div><div class="mini-kpi-v" style="color:#8B5CF6">${fmt(p.budget_requested)}</div><div class="mini-kpi-u">บาท</div></div>
      <div class="mini-kpi"><div class="mini-kpi-l">งบที่อนุมัติ</div><div class="mini-kpi-v" style="color:#22C55E">${p.budget_approved?fmt(p.budget_approved):'-'}</div><div class="mini-kpi-u">${p.budget_approved?'บาท':''}</div></div>
      <div class="mini-kpi"><div class="mini-kpi-l">เบิกจ่ายแล้ว</div><div class="mini-kpi-v" style="color:#F59E0B">${fmt(spent)}</div><div class="mini-kpi-u">บาท</div></div>
      <div class="mini-kpi"><div class="mini-kpi-l">คงเหลือ</div><div class="mini-kpi-v" style="color:${remaining<0?'#EF4444':'#3B82F6'}">${p.budget_approved?fmt(remaining):'-'}</div><div class="mini-kpi-u">${p.budget_approved?'บาท':''}</div></div>
    </div>
    ${p.status==='approved'&&p.budget_approved>0?`<div class="card" style="margin-bottom:14px;padding:14px 18px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#7C8FA8;margin-bottom:6px">
        <span>การใช้งบประมาณ ${pct}%</span><span>คงเหลือ ${fmt(remaining)} บาท</span>
      </div>
      <div class="prog-bar"><div class="prog-fill" style="width:${Math.min(pct,100)}%;background:${pct>90?'#EF4444':pct>70?'#F59E0B':'#22C55E'}"></div></div>
    </div>`:''}

    <div class="det-tabs">
      <button class="det-tab active" onclick="detTab('info',this)">ข้อมูล</button>
      <button class="det-tab" onclick="detTab('budget',this)">งบประมาณ</button>
      <button class="det-tab" onclick="detTab('steps',this)">ขั้นตอน</button>
      <button class="det-tab" onclick="detTab('eval',this)">ประเมินผล</button>
      <button class="det-tab" onclick="detTab('expenses',this)">เบิกจ่าย (${expBadge})</button>
    </div>

    <div id="dt-info" class="card">
      ${infoBlock('กลุ่มสาระ/หน่วยงาน',p.dept)}
      ${infoBlock('ลักษณะโครงการ',(p.proj_type||'').replace(/\|\|/g,', '))}
      ${infoBlock('ผู้รับผิดชอบ',p.owner_name+' ('+p.owner_email+')')}
      ${infoBlock('ระยะเวลา',p.start_date?fdate(p.start_date)+' — '+fdate(p.end_date):'-')}
      ${infoBlock('สถานที่',p.place||'-')}
      ${infoBlock('ยุทธศาสตร์ชาติ',p.strategy||'-')}
      ${infoBlock('นโยบาย สพฐ.',p.policy||'-')}
      ${infoBlock('จุดเน้น สพป.นย.',(p.focus||'').replace(/\|\|/g,', '))}
      ${infoBlock('หลักการและเหตุผล',p.reason||'-')}
      ${infoBlock('วัตถุประสงค์ (Outputs)',p.obj_output||'-')}
      ${infoBlock('วัตถุประสงค์ (Outcomes)',p.obj_outcome||'-')}
      ${infoBlock('เป้าหมายเชิงปริมาณ',p.goal_qty||'-')}
      ${infoBlock('เป้าหมายเชิงคุณภาพ',p.goal_qual||'-')}
      ${p.risk?infoBlock('การวิเคราะห์ความเสี่ยง',p.risk):''}
      ${p.note?infoBlock('หมายเหตุ/ผลการพิจารณา',p.note,'#DC2626'):''}
      ${canAct?`<div class="appr-panel"><div id="appr-wrap"><div class="appr-btns">
        <button class="btn-review" onclick="doAppr('reviewing','${p.project_id}',${p.budget_requested})">🔍 เริ่มตรวจสอบ</button>
        <button class="btn-approve" onclick="doAppr('approved','${p.project_id}',${p.budget_requested})">✓ อนุมัติ</button>
        <button class="btn-reject" onclick="doAppr('rejected','${p.project_id}',0)">✕ ไม่อนุมัติ</button>
      </div></div></div>`:''}
      ${!ME?`<div style="margin-top:14px;padding:10px 14px;background:#EFF6FF;border-radius:8px;font-size:12px;color:#3B82F6">🔑 <a href="javascript:openLogin()" style="color:#3B82F6;font-weight:700">เข้าสู่ระบบ</a> เพื่อดำเนินการเพิ่มเติม</div>`:''}
    </div>

    <div id="dt-budget" class="hidden">
      ${bItems.length?`<table class="data-table">
        <thead><tr><th>กิจกรรม/รายการ</th><th class="right">ค่าตอบแทน</th><th class="right">ค่าใช้สอย</th><th class="right">ค่าวัสดุ</th><th class="right">รวม (บาท)</th></tr></thead>
        <tbody>
          ${bItems.map(r=>`<tr><td>${esc(r.item)}</td><td style="text-align:right">${r.reward?fmt(r.reward):'-'}</td><td style="text-align:right">${r.service?fmt(r.service):'-'}</td><td style="text-align:right">${r.material?fmt(r.material):'-'}</td><td style="text-align:right;font-weight:700">${fmt(Number(r.reward||0)+Number(r.service||0)+Number(r.material||0))}</td></tr>`).join('')}
          <tr class="total-row"><td>รวม</td><td style="text-align:right">${fmt(bItems.reduce((s,r)=>s+Number(r.reward||0),0))}</td><td style="text-align:right">${fmt(bItems.reduce((s,r)=>s+Number(r.service||0),0))}</td><td style="text-align:right">${fmt(bItems.reduce((s,r)=>s+Number(r.material||0),0))}</td><td style="text-align:right;font-weight:800">${fmt(bItems.reduce((s,r)=>s+Number(r.reward||0)+Number(r.service||0)+Number(r.material||0),0))}</td></tr>
        </tbody></table>`:'<div class="empty">ไม่มีข้อมูล</div>'}
    </div>

    <div id="dt-steps" class="hidden">
      ${sItems.length?`<table class="data-table">
        <thead><tr><th style="width:36px">#</th><th>รายละเอียด</th><th>ระยะเวลา</th><th>ผู้รับผิดชอบ</th><th class="right">งบประมาณ</th></tr></thead>
        <tbody>${sItems.map(r=>`<tr><td style="text-align:center">${r.no||''}</td><td>${esc(r.detail)}</td><td>${esc(r.period)}</td><td>${esc(r.owner)}</td><td style="text-align:right">${r.budget?fmt(r.budget):'-'}</td></tr>`).join('')}</tbody>
      </table>`:'<div class="empty">ไม่มีข้อมูล</div>'}
    </div>

    <div id="dt-eval" class="hidden">
      ${eItems.length?`<table class="data-table">
        <thead><tr><th>ตัวชี้วัด</th><th>ค่าเป้าหมาย</th><th>วิธีวัด</th><th>เครื่องมือ</th></tr></thead>
        <tbody>${eItems.map(r=>`<tr><td>${esc(r.indicator)}</td><td>${esc(r.target)}</td><td>${esc(r.method)}</td><td>${esc(r.tool)}</td></tr>`).join('')}</tbody>
      </table>`:'<div class="empty">ไม่มีข้อมูล</div>'}
    </div>

    <div id="dt-expenses" class="hidden">
      ${renderExpenseTab(p, expenses, requests, canRequest, canAppr, canUploadDoc)}
    </div>`;
}

function renderExpenseTab(p, expenses, requests, canRequest, canAppr, canUploadDoc){
  const REQ_SL  = {pending:'รอพิจารณา', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ'};
  const REQ_SC  = {pending:'#F59E0B',   approved:'#22C55E',      rejected:'#EF4444'};
  const pendingReqs = requests.filter(r=>r.status==='pending');
  const myReqs      = requests.filter(r=>r.status!=='pending'); // ประวัติที่ดำเนินการแล้ว

  let html = '';

  // ---- ครู: ฟอร์มยื่นคำขอ ----
  if(canRequest){
    const remaining = Number(p.budget_approved||0) - expenses.reduce((s,e)=>s+Number(e.amount||0),0)
                    - requests.filter(r=>r.status==='pending').reduce((s,r)=>s+Number(r.amount||0),0);
    html += `
    <div class="exp-request-box" id="exp-req-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="card-title">ยื่นคำขอเบิกจ่าย</div>
        <button class="exp-add-btn" onclick="toggleReqForm()" id="btn-toggle-req">+ ยื่นคำขอใหม่</button>
      </div>
      <div class="budget-remain-hint">
        💰 งบคงเหลือ (รวมรอดำเนินการ): <b style="color:${remaining<=0?'#EF4444':remaining<5000?'#F59E0B':'#16A34A'}">${fmt(remaining)} บาท</b>
        ${remaining<=0?'<span class="warn-chip">งบเต็มแล้ว</span>':remaining<5000?'<span class="warn-chip yellow">ใกล้เต็ม</span>':''}
      </div>
      <div id="req-form" class="hidden" style="margin-top:10px">
        <div class="fields-2" style="margin-bottom:10px">
          <div class="field"><label>รายการที่ขอเบิก <span class="req">*</span></label><input id="ri-item" placeholder="เช่น ค่าวัสดุ, ค่าพาหนะ"></div>
          <div class="field">
            <label>จำนวนเงิน (บาท) <span class="req">*</span></label>
            <input id="ri-amt" type="number" min="0" oninput="validateReqAmt(${remaining})">
            <div id="ri-amt-warn" class="req-amt-warn hidden"></div>
          </div>
          <div class="field"><label>วันที่ดำเนินการ</label><input id="ri-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="field"><label>หมายเหตุ</label><input id="ri-note" placeholder="รายละเอียดเพิ่มเติม"></div>
        </div>
        <div class="field" style="margin-bottom:12px">
          <label>แนบเอกสาร / หลักฐาน <span style="font-size:11px;color:#7C8FA8">(รูปหรือ PDF ไม่เกิน 5MB)</span></label>
          <div class="file-upload-area" id="file-drop-area" onclick="document.getElementById('ri-file').click()" ondragover="event.preventDefault()" ondrop="handleFileDrop(event)">
            <div id="file-placeholder">📎 คลิกหรือลากไฟล์มาวางที่นี่</div>
            <div id="file-preview" class="hidden"></div>
          </div>
          <input type="file" id="ri-file" style="display:none" accept="image/*,.pdf" onchange="previewFile(this)">
        </div>
        <div class="flex-end">
          <button class="btn-sec" onclick="toggleReqForm()">ยกเลิก</button>
          <button class="btn-prim" id="btn-req-submit" onclick="submitExpenseRequest('${p.project_id}',${remaining})">📤 ส่งคำขอ</button>
        </div>
      </div>
    </div>`;
  }

  // ---- ฝ่ายงบ: รายการรอพิจารณา ----
  if(canAppr && pendingReqs.length){
    html += `
    <div class="exp-pending-box">
      <div class="exp-pending-title">🔔 คำขอรอพิจารณา (${pendingReqs.length} รายการ)</div>
      ${pendingReqs.map(r=>`
      <div class="exp-req-card pending">
        <div class="exp-req-top">
          <div>
            <div class="exp-req-name">${esc(r.item)}</div>
            <div class="exp-req-meta">โดย ${esc(r.requested_name||r.requested_by)} · ${fdate(r.created_at)}</div>
            ${r.note?`<div class="exp-req-note">${esc(r.note)}</div>`:''}
            ${r.file_url?`<a href="${esc(r.file_url)}" target="_blank" class="file-link">📎 ดูเอกสารแนบ</a>`:'<span class="no-doc-chip">ยังไม่มีเอกสาร</span>'}
          </div>
          <div class="exp-req-amt">${fmt(r.amount)}<span>บาท</span></div>
        </div>
        <div class="exp-req-actions">
          <button class="btn-approve" onclick="handleExpReq('approve','${r.request_id}','${p.project_id}')">✓ อนุมัติ</button>
          <button class="btn-cond-approve" onclick="showCondApprove('${r.request_id}','${p.project_id}')">⏳ อนุมัติ (รอหลักฐาน)</button>
          <button class="btn-reject" onclick="handleExpReq('reject','${r.request_id}','${p.project_id}')">✕ ปฏิเสธ</button>
        </div>
        <div id="cond-form-${r.request_id}" class="cond-approve-form hidden">
          <div style="font-size:12px;color:#92400E;margin-bottom:8px;font-weight:600">⏳ อนุมัติแบบมีเงื่อนไข — บันทึกเบิกทันที รอหลักฐานภายใน:</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <input type="number" id="cond-days-${r.request_id}" value="7" min="1" max="30" style="width:64px;padding:6px 8px;border-radius:6px;border:1.5px solid #E2E8F0;font-family:'Sarabun',sans-serif;font-size:13px">
            <span style="font-size:13px;color:#374151">วัน (นับจากวันนี้)</span>
          </div>
          <div class="flex-end" style="gap:6px">
            <button class="btn-sec" onclick="document.getElementById('cond-form-${r.request_id}').classList.add('hidden')">ยกเลิก</button>
            <button class="btn-cond-approve" onclick="confirmCondApprove('${r.request_id}','${p.project_id}')">✓ ยืนยัน</button>
          </div>
        </div>
        <div id="reject-form-${r.request_id}" class="hidden" style="margin-top:8px">
          <input id="reject-note-${r.request_id}" class="search" style="width:100%;margin-bottom:6px" placeholder="ระบุเหตุผลการปฏิเสธ">
          <div class="flex-end" style="gap:6px">
            <button class="btn-sec" onclick="document.getElementById('reject-form-${r.request_id}').classList.add('hidden')">ยกเลิก</button>
            <button class="btn-reject" onclick="confirmReject('${r.request_id}','${p.project_id}')">ยืนยันปฏิเสธ</button>
          </div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  const doneReqs = requests.filter(r=>r.status!=='pending');
  if(doneReqs.length){
    const DOC_SL = {pending:'รอหลักฐาน', uploaded:'ส่งหลักฐานแล้ว', complete:'ครบถ้วน'};
    const hasDocPending = canUploadDoc && doneReqs.some(r=>r.status==='approved' && !r.doc_file_url);
    html += `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:#7C8FA8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">ประวัติคำขอเบิก</div>
      ${hasDocPending ? `<div class="doc-pending-banner">
        📎 <b>ต้องดำเนินการ:</b> มีรายการที่อนุมัติแล้วแต่ยังรอหลักฐาน/ใบเสร็จจากคุณ
        กรุณาอัปโหลดไฟล์ในแต่ละรายการด้านล่าง
      </div>` : ''}
      ${doneReqs.map(r=>{
        const isOverdue = r.doc_deadline && r.doc_deadline < new Date().toISOString().slice(0,10);
        const needDoc   = r.doc_status==='pending';
        // ครูแนบหลักฐานได้ทุกรายการที่อนุมัติแล้ว (ทั้ง pending และยังไม่มีไฟล์)
        const canUpload = canUploadDoc && r.status==='approved' && !r.doc_file_url;
        const daysLeft  = r.doc_deadline ? Math.ceil((new Date(r.doc_deadline)-new Date())/(1000*60*60*24)) : null;
        return `
        <div class="exp-req-card ${r.status} ${needDoc&&canRequest?'needs-doc':''}">
          <div class="exp-req-top">
            <div style="flex:1">
              <div class="exp-req-name">${esc(r.item)}</div>
              <div class="exp-req-meta">ยื่นโดย ${esc(r.requested_name||r.requested_by)} · ${fdate(r.created_at)}</div>
              ${needDoc?`<div class="doc-deadline-chip ${isOverdue?'overdue':''}">
                ${isOverdue
                  ? `⚠️ เกินกำหนดแล้ว ${Math.abs(daysLeft||0)} วัน`
                  : `📎 รอหลักฐาน — เหลืออีก ${daysLeft} วัน (ครบ ${fdate(r.doc_deadline)})`}
              </div>`:''}
              ${r.doc_file_url?`<a href="${esc(r.doc_file_url)}" target="_blank" class="file-link">📎 ดูหลักฐานที่ส่งแล้ว →</a>`:''}
              ${r.doc_status==='uploaded'?`<div style="font-size:11px;color:#3B82F6;margin-top:4px">✓ ส่งหลักฐานแล้ว รอฝ่ายงบยืนยัน</div>`:''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span class="badge badge-${r.status==='approved'?'approved':'rejected'}">${r.status==='approved'?'อนุมัติแล้ว':'ปฏิเสธ'}</span>
              ${r.doc_status&&r.doc_status!=='complete'?`<span class="doc-status-chip ${r.doc_status}">${DOC_SL[r.doc_status]||r.doc_status}</span>`:''}
              <div class="exp-req-amt" style="font-size:14px">${fmt(r.amount)}<span>บาท</span></div>
            </div>
          </div>
          ${canUpload?`
          <div class="upload-doc-box">
            <div class="upload-doc-title">
              📎 แนบหลักฐาน / ใบเสร็จ
              ${needDoc&&r.doc_deadline?`<span class="upload-doc-deadline ${isOverdue?'overdue':''}">
                ${isOverdue?'⚠️ เกินกำหนดแล้ว':'ครบกำหนด '+fdate(r.doc_deadline)}
              </span>`:'<span class="upload-doc-deadline" style="background:#EFF6FF;color:#1D4ED8;border-color:#BFDBFE">แนบเพิ่มเติมได้</span>'}
            </div>
            <div style="font-size:12px;color:#78350F;margin-bottom:10px">
              อัปโหลดรูปถ่ายใบเสร็จ หรือไฟล์ PDF (ไม่เกิน 5MB)
            </div>
            <div class="file-upload-area"
              onclick="document.getElementById('doc-file-${r.request_id}').click()"
              ondragover="event.preventDefault()"
              ondrop="handleDocFileDrop(event,'${r.request_id}')">
              <div id="doc-ph-${r.request_id}" style="display:flex;flex-direction:column;align-items:center;gap:6px">
                <span style="font-size:28px">📸</span>
                <span style="font-size:13px;font-weight:600;color:#374151">คลิกหรือลากไฟล์มาวาง</span>
                <span style="font-size:11px;color:#9CA3AF">รูปภาพ (JPG, PNG) หรือ PDF</span>
              </div>
              <div id="doc-pv-${r.request_id}" class="hidden" style="display:flex;align-items:center;gap:10px;padding:4px;width:100%"></div>
            </div>
            <input type="file" id="doc-file-${r.request_id}" style="display:none"
              accept="image/*,.pdf" onchange="previewDocFile(this,'${r.request_id}')">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
              <button class="btn-sec" style="font-size:12px" onclick="clearDocFile('${r.request_id}')">ล้างไฟล์</button>
              <button class="btn-prim" id="btn-doc-${r.request_id}"
                onclick="submitDoc('${r.request_id}','${p.project_id}')">
                📤 ส่งหลักฐาน
              </button>
            </div>
          </div>`:''}
          ${r.doc_file_url?`
          <div style="margin-top:8px;padding:8px 12px;background:#F0FDF4;border-radius:8px;border:1px solid #BBF7D0;display:flex;align-items:center;gap:8px">
            <span style="font-size:14px">✅</span>
            <div>
              <div style="font-size:12px;font-weight:700;color:#166534">แนบหลักฐานแล้ว</div>
              <a href="${esc(r.doc_file_url)}" target="_blank" class="file-link" style="font-size:11px">📎 ดูไฟล์ที่ส่ง →</a>
            </div>
          </div>`:''}
          ${canAppr&&r.doc_status==='uploaded'?`
          <div style="margin-top:10px;padding:10px 12px;background:#EFF6FF;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div style="font-size:12px;color:#1D4ED8;font-weight:600">✓ ครูส่งหลักฐานแล้ว — ยืนยันความถูกต้อง?</div>
            <button class="btn-approve" style="font-size:12px;padding:5px 12px"
              onclick="confirmDoc('${r.request_id}','${p.project_id}')">ยืนยัน</button>
          </div>`:''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ---- รายการเบิกจ่ายจริง (อนุมัติแล้ว) ----
  html += `
  <div>
    <div style="font-size:12px;font-weight:700;color:#7C8FA8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">รายการเบิกจ่ายที่บันทึกแล้ว</div>
    ${renderExpTable(expenses, canAppr)}
  </div>`;

  return html;
}

function toggleReqForm(){
  const f = document.getElementById('req-form');
  f.classList.toggle('hidden');
  document.getElementById('btn-toggle-req').textContent = f.classList.contains('hidden') ? '+ ยื่นคำขอใหม่' : '✕ ยกเลิก';
}

function validateReqAmt(remaining){
  const amt = Number(document.getElementById('ri-amt').value||0);
  const warn = document.getElementById('ri-amt-warn');
  if(!warn) return;
  if(amt <= 0){ warn.classList.add('hidden'); return; }
  if(amt > remaining){
    warn.textContent = `⚠️ จำนวนเงินเกินงบคงเหลือ ${fmt(remaining)} บาท`;
    warn.classList.remove('hidden');
  } else if(amt > remaining*0.9){
    warn.textContent = `ℹ️ จำนวนเงินนี้จะใช้งบเกือบหมด (คงเหลือ ${fmt(remaining-amt)} บาท)`;
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

let _uploadedFile = null;

function previewFile(input){
  const file = input.files[0];
  if(!file) return;
  if(file.size > 5*1024*1024){ toast('ไฟล์ใหญ่เกิน 5MB','error'); input.value=''; return; }
  _uploadedFile = file;
  const ph = document.getElementById('file-placeholder');
  const pv = document.getElementById('file-preview');
  ph.classList.add('hidden');
  pv.classList.remove('hidden');
  if(file.type.startsWith('image/')){
    const url = URL.createObjectURL(file);
    pv.innerHTML = `<img src="${url}" style="max-height:80px;border-radius:6px;margin-right:8px">
      <span style="font-size:12px;color:#374151">${esc(file.name)}</span>
      <button onclick="clearFile()" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:16px;margin-left:8px">✕</button>`;
  } else {
    pv.innerHTML = `<span style="font-size:20px">📄</span>
      <span style="font-size:12px;color:#374151;margin-left:8px">${esc(file.name)}</span>
      <button onclick="clearFile()" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:16px;margin-left:8px">✕</button>`;
  }
}

function handleDocFileDrop(e, reqId){
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if(!file) return;
  const fakeInput = {files:[file]};
  previewDocFile(fakeInput, reqId);
}

function clearDocFile(reqId){
  delete _docFiles[reqId];
  const ph = document.getElementById(`doc-ph-${reqId}`);
  const pv = document.getElementById(`doc-pv-${reqId}`);
  if(ph){ ph.style.display='flex'; }
  if(pv){ pv.classList.add('hidden'); pv.innerHTML=''; }
  const inp = document.getElementById(`doc-file-${reqId}`);
  if(inp) inp.value='';
}

async function confirmDoc(reqId, pid){
  const r = await apiPost('confirmExpenseDoc',{requestId:reqId});
  if(r.ok){ toast('ยืนยันหลักฐานแล้ว ✓'); loadDetail(pid); }
  else toast(r.message||'เกิดข้อผิดพลาด','error');
}

function handleFileDrop(e){
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if(!file) return;
  const fakeInput = {files:[file]};
  previewFile(fakeInput);
}

function clearFile(){
  _uploadedFile = null;
  document.getElementById('ri-file').value = '';
  document.getElementById('file-placeholder').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
}

async function submitExpenseRequest(pid, remaining){
  const item = document.getElementById('ri-item').value.trim();
  const amt  = Number(document.getElementById('ri-amt').value||0);
  if(!item)    { toast('กรุณากรอกรายการ','error'); return; }
  if(amt <= 0) { toast('กรุณากรอกจำนวนเงิน','error'); return; }
  // Validation งบ
  if(amt > remaining){
    if(!confirm(`⚠️ จำนวนเงิน ${fmt(amt)} บาท เกินงบคงเหลือ ${fmt(remaining)} บาท\nต้องการส่งคำขอต่อหรือไม่?`)) return;
  }

  const btn=document.getElementById('btn-req-submit');
  btn.disabled=true; btn.textContent='กำลังส่ง...';

  // แปลงไฟล์เป็น base64
  let fileData='', fileName='', fileType='';
  if(_uploadedFile){
    try{
      fileData = await new Promise((res,rej)=>{
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(_uploadedFile);
      });
      fileName = _uploadedFile.name;
      fileType = _uploadedFile.type;
    } catch(e){ toast('อ่านไฟล์ไม่ได้','error'); btn.disabled=false; btn.textContent='📤 ส่งคำขอ'; return; }
  }

  const r = await apiPost('requestExpense',{
    project_id: pid,
    item, amount: amt,
    date:     document.getElementById('ri-date').value,
    note:     document.getElementById('ri-note').value,
    file_data: fileData, file_name: fileName, file_type: fileType
  });
  btn.disabled=false; btn.textContent='📤 ส่งคำขอ';
  if(r.ok){
    toast('ส่งคำขอแล้ว รอฝ่ายงบอนุมัติ ✓');
    _uploadedFile=null;
    loadDetail(pid);
  } else { toast(r.message||'เกิดข้อผิดพลาด','error'); }
}

function showCondApprove(reqId, pid){
  document.getElementById(`cond-form-${reqId}`)?.classList.remove('hidden');
  document.getElementById(`reject-form-${reqId}`)?.classList.add('hidden');
}

async function confirmCondApprove(reqId, pid){
  const days = Number(document.getElementById(`cond-days-${reqId}`)?.value||7);
  const btn  = document.querySelector(`#cond-form-${reqId} .btn-cond-approve`);
  if(btn){ btn.disabled=true; btn.textContent='กำลังบันทึก...'; }
  const r = await apiPost('approveExpenseCond',{requestId:reqId, doc_days:days});
  if(btn){ btn.disabled=false; btn.textContent='✓ ยืนยัน'; }
  if(r.ok){
    toast(`อนุมัติแล้ว — ครูต้องส่งหลักฐานภายใน ${r.deadline} ✓`);
    loadDetail(pid);
  } else toast(r.message||'เกิดข้อผิดพลาด','error');
}

let _docFiles = {};

function previewDocFile(input, reqId){
  const file = input.files[0];
  if(!file) return;
  if(file.size > 5*1024*1024){ toast('ไฟล์ใหญ่เกิน 5MB','error'); input.value=''; return; }
  _docFiles[reqId] = file;
  const ph = document.getElementById(`doc-ph-${reqId}`);
  const pv = document.getElementById(`doc-pv-${reqId}`);
  if(ph) ph.classList.add('hidden');
  if(pv){
    pv.classList.remove('hidden');
    pv.innerHTML = file.type.startsWith('image/')
      ? `<img src="${URL.createObjectURL(file)}" style="max-height:60px;border-radius:4px;margin-right:6px"><span style="font-size:12px">${esc(file.name)}</span>`
      : `<span style="font-size:18px">📄</span><span style="font-size:12px;margin-left:6px">${esc(file.name)}</span>`;
  }
}

async function submitDoc(reqId, pid){
  const file = _docFiles[reqId];
  if(!file){ toast('กรุณาเลือกไฟล์ก่อน','error'); return; }
  const btn = document.getElementById(`btn-doc-${reqId}`);
  if(btn){ btn.disabled=true; btn.textContent='กำลังส่ง...'; }
  let fileData='', fileName=file.name, fileType=file.type;
  try{
    fileData = await new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onload=e=>res(e.target.result.split(',')[1]);
      reader.onerror=rej;
      reader.readAsDataURL(file);
    });
  } catch(e){ toast('อ่านไฟล์ไม่ได้','error'); if(btn){btn.disabled=false;btn.textContent='📤 ส่งหลักฐาน';} return; }

  const r = await apiPost('uploadExpenseDoc',{requestId:reqId, file_data:fileData, file_name:fileName, file_type:fileType});
  if(btn){ btn.disabled=false; btn.textContent='📤 ส่งหลักฐาน'; }
  if(r.ok){
    delete _docFiles[reqId];
    toast('ส่งหลักฐานแล้ว ✓');
    loadDetail(pid);
  } else toast(r.message||'เกิดข้อผิดพลาด','error');
}

function handleExpReq(action, reqId, pid){
  if(action==='approve'){
    if(!confirm('ยืนยันอนุมัติรายการนี้?')) return;
    apiPost('approveExpense',{requestId:reqId}).then(r=>{
      if(r.ok){toast('อนุมัติและบันทึกแล้ว ✓');loadDetail(pid);}
      else toast(r.message||'error','error');
    });
  } else {
    document.getElementById(`reject-form-${reqId}`)?.classList.remove('hidden');
    document.getElementById(`cond-form-${reqId}`)?.classList.add('hidden');
  }
}

async function confirmReject(reqId, pid){
  const note = document.getElementById(`reject-note-${reqId}`).value.trim();
  if(!note){toast('กรุณาระบุเหตุผล','error');return;}
  const r = await apiPost('rejectExpense',{requestId:reqId, note});
  if(r.ok){toast('ปฏิเสธคำขอแล้ว');loadDetail(pid);}
  else toast(r.message||'error','error');
}

function renderExpTable(expenses,canDel){
  if(!expenses.length) return '<div class="empty" style="padding:24px 0">ยังไม่มีรายการ</div>';
  const total=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  return `<table class="data-table">
    <thead><tr><th>รายการ</th><th>จำนวน (บาท)</th><th>วันที่</th><th>บันทึกโดย</th><th>หมายเหตุ</th>${canDel?'<th style="width:40px"></th>':''}</tr></thead>
    <tbody>
      ${expenses.map(e=>`<tr>
        <td>${esc(e.item||'')}</td>
        <td style="font-weight:700">${fmt(e.amount)}</td>
        <td>${fdate(e.date)}</td>
        <td style="font-size:12px;color:#7C8FA8">${esc(e.added_by||'')}</td>
        <td style="font-size:12px;color:#9CA3AF;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.note||'-')}</td>
        ${canDel?`<td style="text-align:center">
          <button title="ลบรายการ" onclick="delExp('${e.expense_id}','${e.project_id}')"
            style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:16px;line-height:1;padding:2px 4px;border-radius:4px;transition:color .15s"
            onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='#9CA3AF'">🗑</button>
        </td>`:''}
      </tr>`).join('')}
      <tr class="total-row"><td>รวม</td><td style="font-weight:800">${fmt(total)}</td><td colspan="${canDel?4:3}"></td></tr>
    </tbody></table>`;
}
async function delExp(eid,pid){
  if(!confirm('ยืนยันลบ?')) return;
  const r=await apiPost('deleteExpense',{expenseId:eid});
  if(r.ok){toast('ลบแล้ว');loadDetail(pid);}else toast(r.message||'error','error');
}
function infoBlock(label,value,color=''){
  return `<div class="info-block"><div class="info-lbl">${label}</div><div class="info-val" ${color?`style="color:${color}"`:''}>${esc(value||'-')}</div></div>`;
}
function detTab(t,el){
  document.querySelectorAll('.det-tab').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  ['info','budget','steps','eval','expenses'].forEach(k=>{
    const el2=document.getElementById('dt-'+k);
    if(el2) el2.classList.toggle('hidden',k!==t);
  });
}
function renderExpTable(expenses,canDel){
  if(!expenses.length) return '<div class="empty" style="padding:32px 0">ยังไม่มีรายการเบิกจ่าย</div>';
  const total=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  return `<table class="data-table">
    <thead><tr><th>รายการ</th><th>จำนวน (บาท)</th><th>วันที่</th><th>บันทึกโดย</th><th>หมายเหตุ</th>${canDel?'<th></th>':''}</tr></thead>
    <tbody>
      ${expenses.map(e=>`<tr><td>${esc(e.item||'')}</td><td style="font-weight:700">${fmt(e.amount)}</td><td>${fdate(e.date)}</td><td>${esc(e.added_by||'')}</td><td style="color:#7C8FA8">${esc(e.note||'-')}</td>${canDel?`<td><button class="edit-btn" style="color:#EF4444" onclick="delExp('${e.expense_id}','${e.project_id}')">ลบ</button></td>`:''}</tr>`).join('')}
      <tr class="total-row"><td>รวม</td><td style="font-weight:800">${fmt(total)}</td><td colspan="${canDel?4:3}"></td></tr>
    </tbody></table>`;
}

function doAppr(status,pid,budReq){
  const lb={reviewing:'🔍 ตรวจสอบ',approved:'✅ อนุมัติ',rejected:'❌ ไม่อนุมัติ'};
  document.getElementById('appr-wrap').innerHTML=`
    <div style="font-size:13px;font-weight:700;color:${SC[status]};margin-bottom:10px">${lb[status]}</div>
    ${status==='approved'?`<div class="field" style="max-width:260px;margin-bottom:10px"><label>งบที่อนุมัติ (บาท)</label><input id="ap-bud" type="number" value="${budReq}"></div>`:''}
    <div class="field" style="margin-bottom:10px"><label>หมายเหตุ</label><textarea id="ap-note" rows="2"></textarea></div>
    <div style="display:flex;gap:8px">
      <button class="btn-sec" onclick="loadDetail('${pid}')">ยกเลิก</button>
      <button class="btn-prim" id="ap-ok" onclick="confirmAppr('${status}','${pid}')">ยืนยัน</button>
    </div>`;
}
async function confirmAppr(status,pid){
  const btn=document.getElementById('ap-ok');btn.disabled=true;btn.textContent='กำลังบันทึก...';
  const r=await apiPost('updateStatus',{project_id:pid,status,note:(document.getElementById('ap-note')||{}).value||'',budget_approved:document.getElementById('ap-bud')?Number(document.getElementById('ap-bud').value):undefined});
  if(r.ok){toast('อัปเดตสถานะแล้ว');loadDetail(pid);}
  else{toast(r.message||'error','error');btn.disabled=false;btn.textContent='ยืนยัน';}
}
async function editProj(pid){ const r=await apiGet('getProject',{id:pid}); if(r.ok) nav('form',{project:r.project}); }

/* ================================================================ USERS */
async function loadUsers(){
  if(!ME){document.getElementById('users-table').innerHTML=`<div style="color:#EF4444;padding:16px">กรุณาเข้าสู่ระบบก่อน</div>`;return;}
  const r=await apiGet('getUsers',{});
  if(!r.ok){document.getElementById('users-table').innerHTML=`<div style="color:#EF4444;padding:16px">${r.message}</div>`;return;}
  document.getElementById('users-count').textContent=`${r.users.length} บัญชี`;
  document.getElementById('users-table').innerHTML=`<table class="data-table">
    <thead><tr><th>อีเมล</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th><th>บทบาท</th><th></th></tr></thead>
    <tbody>${r.users.map(u=>`<tr>
      <td style="color:#3B82F6">${esc(u.email)}</td><td>${esc(u.name||'')}</td><td>${esc(u.dept||'-')}</td>
      <td><span class="role-badge" style="background:${RC[u.role]||'#eee'}20;color:${RC[u.role]||'#555'}">${RL[u.role]||u.role}</span></td>
      <td>${ME.role==='admin'&&u.email!==ME.email?`<button class="edit-btn" onclick="promptEditUser(${JSON.stringify(JSON.stringify(u))})">แก้ไข</button>`:''}</td>
    </tr>`).join('')}</tbody></table>`;
}
function toggleAddUser(){ document.getElementById('add-user-box').classList.toggle('hidden'); }
async function addUser(){
  const r=await apiPost('saveUser',{email:document.getElementById('u-email').value,name:document.getElementById('u-name').value,dept:document.getElementById('u-dept').value,role:document.getElementById('u-role').value});
  if(r.ok){toast('เพิ่มผู้ใช้แล้ว');toggleAddUser();loadUsers();}else toast(r.message||'error','error');
}
function promptEditUser(uJson){
  const u=JSON.parse(uJson);
  const newRole=prompt(`เปลี่ยนบทบาทของ ${u.name}\n(teacher / finance / admin)`,u.role);
  if(!newRole) return;
  apiPost('saveUser',{...u,role:newRole}).then(r=>{ if(r.ok){toast('บันทึกแล้ว');loadUsers();}else toast(r.message||'error','error'); });
}

/* ================================================================ EXPORT CSV */
function exportCSV(){
  if(!PROJECTS.length){ toast('ไม่มีข้อมูล','error'); return; }
  const headers=['รหัส','ชื่อโครงการ','หน่วยงาน','ผู้รับผิดชอบ','งบที่ขอ','งบที่อนุมัติ','เบิกจ่าย','สถานะ','วันที่สร้าง'];
  const rows = PROJECTS.map(p=>[
    p.project_id, p.title, p.dept, p.owner_name,
    p.budget_requested, p.budget_approved||0, p.spent||0,
    SL[p.status]||p.status, p.created_at?p.created_at.slice(0,10):''
  ]);
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel Thai
  const csv = BOM + [headers,...rows].map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`โครงการ_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('Export สำเร็จ ✓');
}

/* ================================================================ LOG */
async function loadLog(){
  if(!ME||ME.role!=='admin'){ document.getElementById('log-body').innerHTML=`<div style="color:#EF4444;padding:16px">ไม่มีสิทธิ์เข้าถึง</div>`; return; }
  document.getElementById('log-body').innerHTML='<div class="loading">กำลังโหลด...</div>';
  const r = await apiGet('getLog',{});
  if(!r.ok){ document.getElementById('log-body').innerHTML=`<div style="color:#EF4444;padding:16px">${r.message}</div>`; return; }
  const logs = r.logs||[];
  document.getElementById('log-count').textContent = `${logs.length} รายการ`;
  const ACTION_ICON={create:'➕',edit:'✏️',pending:'⏳',reviewing:'🔍',approved:'✅',rejected:'❌',delete:'🗑️'};
  document.getElementById('log-body').innerHTML = logs.length
    ? `<div class="log-list">${logs.slice().reverse().map(l=>`
        <div class="log-item">
          <div class="log-icon">${ACTION_ICON[l.action]||'📝'}</div>
          <div class="log-content">
            <div class="log-title">${esc(l.actor||'')} <span class="log-action ${l.action}">${esc(l.action||'')}</span></div>
            <div class="log-proj">${esc(l.project_id||'')}${l.note?` · ${esc(l.note)}`:''}</div>
            <div class="log-time">${fdate(l.ts)}</div>
          </div>
        </div>`).join('')}</div>`
    : '<div class="empty"><div class="empty-icon">📋</div>ยังไม่มีประวัติ</div>';
}

/* ================================================================ BUDGET CONFIG */
async function loadBudgetConfig(){
  if(!ME||!(ME.role==='finance'||ME.role==='admin')){
    document.getElementById('page-budget-config').innerHTML=`<div style="padding:32px;color:#EF4444">ไม่มีสิทธิ์เข้าถึง</div>`;
    return;
  }
  document.getElementById('cfg-year').textContent = new Date().getFullYear()+543;
  const r = await apiGet('getBudgetConfig',{});
  const cur = document.getElementById('cfg-current');
  if(r.ok && Number(r.config.total_budget||0)>0){
    const tb = Number(r.config.total_budget);
    cur.innerHTML=`<div class="cfg-current-box">
      <div class="cfg-cur-label">วงเงินที่กำหนดปัจจุบัน</div>
      <div class="cfg-cur-val">${fmt(tb)} <span style="font-size:14px;font-weight:400">บาท</span></div>
      <div class="cfg-cur-note">อัปเดตล่าสุด: ${r.config.updated_at ? fdate(r.config.updated_at) : '-'} โดย ${esc(r.config.updated_by||'-')}</div>
    </div>`;
    document.getElementById('cfg-budget').value = tb;
  } else {
    cur.innerHTML=`<div style="font-size:13px;color:#7C8FA8;padding:8px 0">ยังไม่ได้กำหนดวงเงิน</div>`;
  }
}

async function saveBudgetConfig(){
  const val = Number(document.getElementById('cfg-budget').value);
  const errEl = document.getElementById('cfg-err');
  if(!val||val<=0){ errEl.textContent='กรุณากรอกวงเงินที่ถูกต้อง'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  const btn = document.getElementById('btn-cfg-save');
  btn.disabled=true; btn.textContent='กำลังบันทึก...';
  const r = await apiPost('saveBudgetConfig',{total_budget:val});
  btn.disabled=false; btn.textContent='💾 บันทึกวงเงิน';
  if(r.ok){ toast('บันทึกวงเงินแล้ว ✓'); loadBudgetConfig(); }
  else toast(r.message||'เกิดข้อผิดพลาด','error');
}

/* ================================================================ API */
async function apiRaw(action, params){
  const qs=new URLSearchParams({action,...params});
  try{ return await (await fetch(`${API_URL}?${qs}`)).json(); }
  catch(e){ return {ok:false,message:e.message}; }
}
async function apiGet(action,params){
  return apiRaw(action,{userEmail:USER_EMAIL,...params});
}
async function apiPost(action,body){
  const payload=JSON.stringify({action,userEmail:USER_EMAIL,...body});
  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'_json='+encodeURIComponent(payload)});
    const data = await res.json();
    // clear cache after any mutation
    if(data.ok) cacheClear();
    return data;
  }catch(e){ return {ok:false,message:e.message}; }
}

/* ================================================================ UTILS */
function autoResize(el){
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}
function fmt(n){ return Number(n||0).toLocaleString('th-TH'); }
function fdate(d){ if(!d) return '-'; try{ return new Date(d).toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'}); }catch(_){return d;} }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
let _t;
function toast(msg,type='success'){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className=`toast ${type}`; el.classList.remove('hidden');
  clearTimeout(_t); _t=setTimeout(()=>el.classList.add('hidden'),3500);
}
