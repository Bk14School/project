/* ================================================================
   ระบบบริหารโครงการงบประมาณ — โรงเรียนบ้านคลอง 14  v3
================================================================ */

const SL={pending:'รอตรวจสอบ',reviewing:'กำลังตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่อนุมัติ'};
const SC={pending:'#F59E0B',reviewing:'#3B82F6',approved:'#22C55E',rejected:'#EF4444'};
const RL={admin:'ผู้บริหาร',finance:'ฝ่ายงบประมาณ',teacher:'ครู/อาจารย์'};
const RC={admin:'#8B5CF6',finance:'#3B82F6',teacher:'#22C55E'};

let ME=null, PROJECTS=[], STATUS_F='all';
let budgetRows=[], stepRows=[], evalRows=[], signerRows=[];

/* ================================================================ BOOT */
document.addEventListener('DOMContentLoaded', async()=>{
  document.getElementById('bud-year').textContent = new Date().getFullYear()+543;
  initNav();
  const r = await apiGet('getMe',{});
  if(!r.ok){
    document.getElementById('main').innerHTML=
      `<div style="padding:48px;text-align:center;color:#EF4444;font-size:15px;line-height:2.4">
        ⚠️ ไม่พบผู้ใช้ <b>"${USER_EMAIL}"</b> ในระบบ<br>
        <span style="color:#7C8FA8;font-size:13px">กรุณารัน <b>setup()</b> ใน Apps Script ก่อน<br>
        แล้วแก้ <b>USER_EMAIL</b> ใน index.html</span></div>`;
    return;
  }
  ME=r.user;
  document.getElementById('sb-avatar').textContent = ME.name[0];
  document.getElementById('sb-name').textContent   = ME.name;
  document.getElementById('sb-role').textContent   = RL[ME.role]||ME.role;
  document.querySelectorAll('.teacher-only').forEach(el=>el.classList.toggle('hidden',ME.role!=='teacher'));
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',ME.role!=='admin'));
  nav('dashboard');
});

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
  document.getElementById('search').addEventListener('input',renderProjects);
}

function nav(page,props={}){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(a=>a.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.remove('hidden');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  window.scrollTo(0,0);
  if(page==='dashboard') loadDashboard();
  if(page==='projects')  loadProjects();
  if(page==='form')      initForm(props);
  if(page==='detail')    loadDetail(props.id);
  if(page==='users')     loadUsers();
}

/* ================================================================ DASHBOARD */
async function loadDashboard(){
  document.getElementById('greet').textContent=`สวัสดี, ${ME.name} 👋`;
  const r=await apiGet('getDashboard',{});
  if(!r.ok) return;
  const d=r.dashboard;
  document.getElementById('kpi-count').querySelector('.kpi-n').textContent=d.count;
  document.getElementById('kpi-req').querySelector('.kpi-n').textContent=fmt(d.totalReq);
  document.getElementById('kpi-appr').querySelector('.kpi-n').textContent=fmt(d.totalAppr);
  document.getElementById('kpi-spent').querySelector('.kpi-n').textContent=fmt(d.totalSpent);
  const tot=d.count||1;
  document.getElementById('dash-status').innerHTML=
    Object.entries(d.byStatus).map(([s,c])=>`
      <div class="s-row">
        <div class="s-dot" style="background:${SC[s]}"></div>
        <div class="s-label">${SL[s]}</div>
        <div class="s-count">${c}</div>
        <div class="s-bar-wrap"><div class="s-bar" style="width:${Math.round(c/tot*100)}%;background:${SC[s]}"></div></div>
      </div>`).join('');
  const depts=Object.entries(d.byDept||{}).sort((a,b)=>b[1].requested-a[1].requested).slice(0,6);
  const tr=d.totalReq||1;
  document.getElementById('dash-dept').innerHTML=depts.length
    ?depts.map(([dn,dd])=>`<div class="dept-row"><div class="dept-head"><span class="dept-name">${esc(dn)}</span><span class="dept-amt">${fmt(dd.requested)} บาท</span></div><div class="mini-bar"><div class="mini-fill" style="width:${Math.round(dd.requested/tr*100)}%"></div></div></div>`).join('')
    :'<div style="color:#7C8FA8;font-size:13px">ยังไม่มีข้อมูล</div>';
}

/* ================================================================ PROJECTS */
async function loadProjects(){
  document.getElementById('proj-list').innerHTML='<div class="loading">กำลังโหลด...</div>';
  const r=await apiGet('getProjects',{});
  if(!r.ok){document.getElementById('proj-list').innerHTML=`<div class="loading" style="color:#EF4444">${r.message}</div>`;return;}
  PROJECTS=r.projects;
  document.getElementById('proj-count').textContent=`${PROJECTS.length} โครงการ`;
  renderProjects();
}

function renderProjects(){
  const q=document.getElementById('search').value.toLowerCase();
  const f=PROJECTS.filter(p=>(STATUS_F==='all'||p.status===STATUS_F)&&(!q||(p.title||'').toLowerCase().includes(q)||(p.owner_name||'').toLowerCase().includes(q)||(p.dept||'').toLowerCase().includes(q)));
  const wrap=document.getElementById('proj-list');
  if(!f.length){wrap.innerHTML='<div class="empty"><div class="empty-icon">📋</div>ไม่พบโครงการ</div>';return;}
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
  const r=await apiGet('getProject',{id:pid});
  if(!r.ok){ toast('ไม่สามารถโหลดข้อมูลโครงการได้','error'); return; }
  // ส่งข้อมูลโปรเจกต์โดยตรง ไม่ต้องพึ่ง DOM
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
  const [pr,ex]=await Promise.all([apiGet('getProject',{id:projectId}),apiGet('getExpenses',{projectId})]);
  if(!pr.ok){wrap.innerHTML=`<div style="color:#EF4444;padding:24px">${pr.message}</div>`;return;}
  const p=pr.project, expenses=ex.ok?ex.expenses:[];
  const spent=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const remaining=Number(p.budget_approved||0)-spent;
  const pct=p.budget_approved>0?Math.round(spent/p.budget_approved*100):0;
  const canAppr=ME.role==='admin'||ME.role==='finance';
  const canExp=ME.role!=='finance'&&p.status==='approved';
  const canAct=canAppr&&p.status!=='approved'&&p.status!=='rejected';
  const canEdit=ME.email===p.owner_email&&p.status==='pending';

  document.getElementById('det-title').textContent=p.title;
  const acts=[];
  if(canEdit) acts.push(`<button class="btn-sec" onclick="editProj('${p.project_id}')">✏️ แก้ไข</button>`);
  acts.push(`<button class="btn-sec" onclick="printFromDetail('${p.project_id}')">🖨 PDF</button>`);
  document.getElementById('det-actions').innerHTML=acts.join('');

  let bItems=[],sItems=[],eItems=[];
  try{bItems=JSON.parse(p.budget_items||'[]');}catch(_){}
  try{sItems=JSON.parse(p.steps||'[]');}catch(_){}
  try{eItems=JSON.parse(p.eval_items||'[]');}catch(_){}

  wrap.innerHTML=`
    <div class="det-header-meta">
      <span class="badge badge-${p.status}">${SL[p.status]}</span>
      <span class="det-id">${p.project_id}</span>
    </div>
    <div class="det-kpis">
      <div class="mini-kpi"><div class="mini-kpi-l">งบที่ขอ</div><div class="mini-kpi-v" style="color:#8B5CF6">${fmt(p.budget_requested)}</div><div class="mini-kpi-u">บาท</div></div>
      <div class="mini-kpi"><div class="mini-kpi-l">งบที่อนุมัติ</div><div class="mini-kpi-v" style="color:#22C55E">${p.budget_approved?fmt(p.budget_approved):'-'}</div><div class="mini-kpi-u">${p.budget_approved?'บาท':''}</div></div>
      <div class="mini-kpi"><div class="mini-kpi-l">เบิกจ่ายแล้ว</div><div class="mini-kpi-v" style="color:#F59E0B">${fmt(spent)}</div><div class="mini-kpi-u">บาท</div></div>
    </div>
    ${p.status==='approved'&&p.budget_approved>0?`<div class="card" style="margin-bottom:14px;padding:14px 18px"><div style="display:flex;justify-content:space-between;font-size:12px;color:#7C8FA8;margin-bottom:6px"><span>การใช้งบประมาณ ${pct}%</span><span>คงเหลือ ${fmt(remaining)} บาท</span></div><div class="prog-bar"><div class="prog-fill" style="width:${Math.min(pct,100)}%;background:${pct>90?'#EF4444':'#22C55E'}"></div></div></div>`:''}

    <div class="det-tabs">
      <button class="det-tab active" onclick="detTab('info',this)">ข้อมูล</button>
      <button class="det-tab" onclick="detTab('budget',this)">งบประมาณ</button>
      <button class="det-tab" onclick="detTab('steps',this)">ขั้นตอน</button>
      <button class="det-tab" onclick="detTab('eval',this)">ประเมินผล</button>
      <button class="det-tab" onclick="detTab('expenses',this)">เบิกจ่าย (${expenses.length})</button>
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
      ${canExp?`<button class="exp-add-btn" onclick="toggleExpForm()">+ บันทึกการเบิกจ่าย</button>`:''}
      <div id="exp-form" class="card hidden" style="margin-bottom:12px">
        <div class="card-title mb-14">บันทึกการเบิกจ่าย</div>
        <div class="fields-2" style="margin-bottom:10px">
          <div class="field"><label>รายการ</label><input id="ei-item" placeholder="เช่น ค่าวัสดุ"></div>
          <div class="field"><label>จำนวนเงิน (บาท)</label><input id="ei-amt" type="number"></div>
          <div class="field"><label>วันที่</label><input id="ei-date" type="date"></div>
          <div class="field"><label>หมายเหตุ</label><input id="ei-note"></div>
        </div>
        <div class="flex-end">
          <button class="btn-sec" onclick="toggleExpForm()">ยกเลิก</button>
          <button class="btn-prim" id="btn-exp" onclick="saveExp('${p.project_id}')">บันทึก</button>
        </div>
      </div>
      ${renderExpTable(expenses,canAppr)}
    </div>`;
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
function toggleExpForm(){ document.getElementById('exp-form')?.classList.toggle('hidden'); }
async function saveExp(pid){
  const item=document.getElementById('ei-item').value.trim(),amt=document.getElementById('ei-amt').value;
  if(!item||!amt){toast('กรุณากรอกรายการและจำนวนเงิน','error');return;}
  const btn=document.getElementById('btn-exp');btn.disabled=true;btn.textContent='กำลังบันทึก...';
  const r=await apiPost('addExpense',{project_id:pid,item,amount:Number(amt),date:document.getElementById('ei-date').value,note:document.getElementById('ei-note').value});
  if(r.ok){toast('บันทึกแล้ว');loadDetail(pid);}
  else{toast(r.message||'error','error');btn.disabled=false;btn.textContent='บันทึก';}
}
async function delExp(eid,pid){ if(!confirm('ยืนยันลบ?')) return; const r=await apiPost('deleteExpense',{expenseId:eid}); if(r.ok){toast('ลบแล้ว');loadDetail(pid);}else toast(r.message||'error','error'); }

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

/* ================================================================ API */
async function apiGet(action,params){
  const qs=new URLSearchParams({action,userEmail:USER_EMAIL,...params});
  try{ return await (await fetch(`${API_URL}?${qs}`)).json(); }
  catch(e){ return {ok:false,message:e.message}; }
}
async function apiPost(action,body){
  const payload=JSON.stringify({action,userEmail:USER_EMAIL,...body});
  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'_json='+encodeURIComponent(payload)});
    return await res.json();
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