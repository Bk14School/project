// ================================================================
//  ระบบบริหารโครงการงบประมาณ — โรงเรียนบ้านคลอง 14
//  Google Apps Script | Execute as: Me | Access: Anyone
//  v3 — อัปเดตฟิลด์ตามแบบฟอร์มใหม่
// ================================================================

const SHEET_ID = '1uMBsGe6zAMlOEYcpDaJ-wHZa-WE8f3PZQKC27cgZ8fA';
const S = { P:'Projects', E:'Expenses', ER:'ExpenseRequests', U:'Users', L:'Log', C:'Config' };

function doGet(e)  { return run(e); }
function doPost(e) { return run(e); }

function run(e) {
  try {
    const p = e.parameter || {};
    let   b = {};

    if (e.postData && e.postData.contents) {
      const ct      = (e.postData.type || '').toLowerCase();
      const content = e.postData.contents;

      if (ct.includes('application/json')) {
        try { b = JSON.parse(content); } catch(_) {}
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const pairs = content.split('&');
        const map   = {};
        pairs.forEach(pair => {
          const idx = pair.indexOf('=');
          if (idx > 0) {
            const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g,' '));
            const v = decodeURIComponent(pair.slice(idx+1).replace(/\+/g,' '));
            map[k] = v;
          }
        });
        if (map._json) {
          try { b = JSON.parse(map._json); } catch(_) {}
        }
      }
    }

    if (!b.action && p._json) {
      try { b = JSON.parse(decodeURIComponent(p._json)); } catch(_) {}
    }

    const all = Object.assign({}, p, b);
    const act = all.action;
    const who = getUser(all.userEmail);

    if (act === 'getMe')   return j(who ? {ok:true,user:who} : {ok:false,message:'ไม่พบผู้ใช้'});
    if (!who)              return j({ok:false,message:'ไม่พบผู้ใช้ '+all.userEmail});

    switch(act) {
      case 'getProjects':   return j(getProjects(who, all));
      case 'getProject':    return j(getProject(all.id));
      case 'saveProject':   return j(saveProject(all, who));
      case 'updateStatus':  return j(updateStatus(all, who));
      case 'getExpenses':        return j(getExpenses(all.projectId));
      case 'addExpense':          return j(addExpense(all, who));
      case 'deleteExpense':       return j(deleteExpense(all.expenseId, who));
      case 'requestExpense':      return j(requestExpense(all, who));
      case 'getExpenseRequests':  return j(getExpenseRequests(all, who));
      case 'approveExpense':      return j(approveExpense(all, who));
      case 'rejectExpense':       return j(rejectExpense(all, who));
      case 'getDashboard':      return j(getDashboard(who));
      case 'getBudgetConfig':   return j(getBudgetConfig(who));
      case 'saveBudgetConfig':  return j(saveBudgetConfig(all, who));
      case 'getLog':            return j(getLog(who));
      case 'getUsers':          return j(getUsers(who));
      case 'saveUser':      return j(saveUser(all, who));
      default:              return j({ok:false,message:'unknown action: '+act});
    }
  } catch(err) {
    return j({ok:false,message:err.message});
  }
}

// ---- Auth ----
function getUser(email) {
  if (!email) return null;
  const rows = sheet(S.U).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === email.toLowerCase())
      return { email:rows[i][0], name:rows[i][1], dept:rows[i][2], role:rows[i][3] };
  }
  return null;
}

// ---- Projects ----
function getProjects(who, p) {
  const rows = sheet(S.P).getDataRange().getValues();
  const h    = rows[0];
  let   list = rows.slice(1).map(r => toObj(h,r));
  if (who.role === 'teacher') list = list.filter(x => x.owner_email === who.email);
  if (p.status && p.status !== 'all') list = list.filter(x => x.status === p.status);

  const eRows = sheet(S.E).getDataRange().getValues().slice(1);
  const spent = {};
  eRows.forEach(r => { spent[r[1]] = (spent[r[1]]||0) + Number(r[3]); });
  list.forEach(x => x.spent = spent[x.project_id]||0);
  return {ok:true, projects:list};
}

function getProject(id) {
  const rows = sheet(S.P).getDataRange().getValues();
  const h    = rows[0];
  const row  = rows.slice(1).find(r => r[0] === id);
  if (!row) return {ok:false,message:'ไม่พบโครงการ'};
  return {ok:true, project:toObj(h,row)};
}

function saveProject(b, who) {
  const sh = sheet(S.P);
  if (b.project_id) {
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === b.project_id) {
        const h = rows[0];
        const fields = [
          'title','dept','budget_requested','start_date','end_date',
          'proj_type','budget_plan','resp_group','place',
          'strategy','policy','focus','royal_goal','school_strategy','kpi_strategy',
          'reason','obj_output','obj_outcome',
          'goal_qty','goal_qual','budget_src','risk',
          'steps','budget_items','eval_items','result',
          'sign1','sign1_pos','sign2','sign2_pos','sign3','signers'
        ];
        fields.forEach(f => {
          const c = h.indexOf(f);
          if (c >= 0) sh.getRange(i+1, c+1).setValue(b[f]||'');
        });
        log(b.project_id, who.email, 'edit', 'แก้ไขโครงการ');
        return {ok:true, project_id:b.project_id};
      }
    }
  }
  // create
  const id  = 'PRJ-'+Utilities.getUuid().slice(0,8).toUpperCase();
  const now = new Date().toISOString();
  sh.appendRow([
    id, b.title||'', b.dept||who.dept, who.email, who.name,
    Number(b.budget_requested)||0, 0, 'pending',
    b.start_date||'', b.end_date||'', now,
    b.proj_type||'', b.budget_plan||'', b.resp_group||'', b.place||'',
    b.strategy||'', b.policy||'',
    b.focus||'', b.royal_goal||'', b.school_strategy||'', b.kpi_strategy||'',
    b.reason||'', b.obj_output||'', b.obj_outcome||'',
    b.goal_qty||'', b.goal_qual||'', b.budget_src||'', b.risk||'',
    b.steps||'', b.budget_items||'', b.eval_items||'',
    b.result||'',
    b.sign1||'', b.sign1_pos||'', b.sign2||'', b.sign2_pos||'', b.sign3||'', b.signers||'',
    ''
  ]);
  log(id, who.email, 'create', 'เสนอโครงการ');
  return {ok:true, project_id:id};
}

function updateStatus(b, who) {
  if (who.role === 'teacher') return {ok:false,message:'ไม่มีสิทธิ์'};
  const sh   = sheet(S.P);
  const rows = sh.getDataRange().getValues();
  const h    = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === b.project_id) {
      sh.getRange(i+1, h.indexOf('status')+1).setValue(b.status);
      if (b.budget_approved != null) sh.getRange(i+1, h.indexOf('budget_approved')+1).setValue(Number(b.budget_approved));
      if (b.note) sh.getRange(i+1, h.indexOf('note')+1).setValue(b.note);
      log(b.project_id, who.email, b.status, b.note||'');
      return {ok:true};
    }
  }
  return {ok:false,message:'ไม่พบโครงการ'};
}

// ---- Expenses (อ่านรายการที่อนุมัติแล้ว) ----
function getExpenses(projectId) {
  const rows = sheet(S.E).getDataRange().getValues();
  const h    = rows[0];
  return {ok:true, expenses: rows.slice(1)
    .filter(r=>!projectId||r[1]===projectId)
    .map(r=>toObj(h,r))};
}

// ---- Expense Requests (คำขอเบิกจาก teacher) ----
function requestExpense(b, who) {
  if (who.role !== 'teacher') return {ok:false, message:'เฉพาะครูเท่านั้นที่ยื่นคำขอได้'};
  const id  = 'EREQ-'+Utilities.getUuid().slice(0,8).toUpperCase();
  const now = new Date().toISOString();
  sheet(S.ER).appendRow([
    id, b.project_id, b.item, Number(b.amount), b.date||'',
    who.email, who.name, now, b.note||'', 'pending', '', ''
  ]);
  log(b.project_id, who.email, 'expense_request', `ขอเบิก: ${b.item} ${b.amount} บาท`);
  return {ok:true, request_id:id};
}

function getExpenseRequests(b, who) {
  const rows = sheet(S.ER).getDataRange().getValues();
  const h    = rows[0];
  let list   = rows.slice(1).map(r=>toObj(h,r));
  // teacher เห็นแค่ของตัวเอง
  if (who.role === 'teacher') list = list.filter(r=>r.requested_by===who.email);
  // กรองตาม projectId ถ้ามี
  if (b.projectId) list = list.filter(r=>r.project_id===b.projectId);
  return {ok:true, requests:list};
}

function approveExpense(b, who) {
  if (who.role !== 'finance' && who.role !== 'admin')
    return {ok:false, message:'เฉพาะฝ่ายงบประมาณเท่านั้น'};
  const sh   = sheet(S.ER);
  const rows = sh.getDataRange().getValues();
  const h    = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === b.requestId) {
      // อัปเดต ExpenseRequests → approved
      sh.getRange(i+1, h.indexOf('status')+1).setValue('approved');
      sh.getRange(i+1, h.indexOf('approved_by')+1).setValue(who.email);
      sh.getRange(i+1, h.indexOf('approved_at')+1).setValue(new Date().toISOString());
      // บันทึกเข้า Expenses จริง
      const expId = 'EXP-'+Utilities.getUuid().slice(0,8).toUpperCase();
      sheet(S.E).appendRow([
        expId, rows[i][1], rows[i][2], Number(rows[i][3]),
        rows[i][4], rows[i][5], new Date().toISOString(), rows[i][8]
      ]);
      log(rows[i][1], who.email, 'expense_approved', `อนุมัติ: ${rows[i][2]} ${rows[i][3]} บาท`);
      return {ok:true};
    }
  }
  return {ok:false, message:'ไม่พบคำขอ'};
}

function rejectExpense(b, who) {
  if (who.role !== 'finance' && who.role !== 'admin')
    return {ok:false, message:'เฉพาะฝ่ายงบประมาณเท่านั้น'};
  const sh   = sheet(S.ER);
  const rows = sh.getDataRange().getValues();
  const h    = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === b.requestId) {
      sh.getRange(i+1, h.indexOf('status')+1).setValue('rejected');
      sh.getRange(i+1, h.indexOf('approved_by')+1).setValue(who.email);
      sh.getRange(i+1, h.indexOf('approved_at')+1).setValue(new Date().toISOString());
      if (b.note) sh.getRange(i+1, h.indexOf('note')+1).setValue(b.note);
      log(rows[i][1], who.email, 'expense_rejected', `ปฏิเสธ: ${rows[i][2]} เหตุผล: ${b.note||'-'}`);
      return {ok:true};
    }
  }
  return {ok:false, message:'ไม่พบคำขอ'};
}

function addExpense(b, who) {
  // ใช้เฉพาะ finance/admin บันทึกตรงโดยไม่ผ่านคำขอ (legacy)
  if (who.role === 'teacher') return {ok:false, message:'กรุณาใช้ระบบยื่นคำขอเบิก'};
  const id = 'EXP-'+Utilities.getUuid().slice(0,8).toUpperCase();
  sheet(S.E).appendRow([id, b.project_id, b.item, Number(b.amount), b.date||'', who.email, new Date().toISOString(), b.note||'']);
  return {ok:true, expense_id:id};
}

function deleteExpense(expenseId, who) {
  if (who.role === 'teacher') return {ok:false,message:'ไม่มีสิทธิ์'};
  const sh   = sheet(S.E);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === expenseId) { sh.deleteRow(i+1); return {ok:true}; }
  }
  return {ok:false,message:'ไม่พบรายการ'};
}

// ---- Dashboard ----
function getDashboard(who) {
  const pRows = sheet(S.P).getDataRange().getValues().slice(1);
  const eRows = sheet(S.E).getDataRange().getValues().slice(1);
  const list  = who.role==='teacher' ? pRows.filter(r=>r[3]===who.email) : pRows;
  const totalReq  = list.reduce((s,r)=>s+Number(r[5]),0);
  const totalAppr = list.filter(r=>r[7]==='approved').reduce((s,r)=>s+Number(r[6]),0);
  const totalSpent= eRows.filter(r=>list.some(p=>p[0]===r[1])).reduce((s,r)=>s+Number(r[3]),0);
  const byStatus  = {pending:0,reviewing:0,approved:0,rejected:0};
  list.forEach(r=>{ if(byStatus[r[7]]!==undefined) byStatus[r[7]]++; });
  const byDept = {};
  list.forEach(r=>{
    const d=r[2]||'อื่นๆ';
    if(!byDept[d]) byDept[d]={requested:0,count:0};
    byDept[d].requested+=Number(r[5]); byDept[d].count++;
  });
  return {ok:true, dashboard:{totalReq,totalAppr,totalSpent,byStatus,byDept,count:list.length}};
}

// ---- Log Reader ----
function getLog(who) {
  if (who.role !== 'admin') return {ok:false, message:'ไม่มีสิทธิ์'};
  const rows = sheet(S.L).getDataRange().getValues();
  const h    = rows[0];
  return {ok:true, logs: rows.slice(1).map(r=>toObj(h,r))};
}

// ---- Budget Config ----
function getBudgetConfig(who) {
  const sh = sheet(S.C);
  const rows = sh.getDataRange().getValues();
  // หาแถวที่มี key = 'total_budget'
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'total_budget') {
      return {ok:true, config:{
        total_budget: Number(rows[i][1]||0),
        updated_at:   rows[i][2]||'',
        updated_by:   rows[i][3]||''
      }};
    }
  }
  return {ok:true, config:{total_budget:0, updated_at:'', updated_by:''}};
}

function saveBudgetConfig(b, who) {
  if (who.role !== 'finance' && who.role !== 'admin') return {ok:false,message:'ไม่มีสิทธิ์'};
  const sh = sheet(S.C);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'total_budget') {
      sh.getRange(i+1, 1, 1, 4).setValues([['total_budget', Number(b.total_budget), now, who.email]]);
      return {ok:true};
    }
  }
  sh.appendRow(['total_budget', Number(b.total_budget), now, who.email]);
  return {ok:true};
}

// ---- Users ----
function getUsers(who) {
  if (who.role==='teacher') return {ok:false,message:'ไม่มีสิทธิ์'};
  const rows = sheet(S.U).getDataRange().getValues();
  const h    = rows[0];
  return {ok:true, users:rows.slice(1).map(r=>toObj(h,r))};
}

function saveUser(b, who) {
  if (who.role!=='admin') return {ok:false,message:'ไม่มีสิทธิ์'};
  const sh   = sheet(S.U);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase()===b.email.toLowerCase()) {
      sh.getRange(i+1,1,1,5).setValues([[b.email,b.name,b.dept,b.role,b.active!==false]]);
      return {ok:true};
    }
  }
  sh.appendRow([b.email,b.name,b.dept,b.role,true]);
  return {ok:true};
}

// ---- Helpers ----
function sheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let   s  = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    const headers = {
      Projects: [
        'project_id','title','dept','owner_email','owner_name',
        'budget_requested','budget_approved','status',
        'start_date','end_date','created_at',
        'proj_type','budget_plan','resp_group','place',
        'strategy','policy',
        'focus','royal_goal','school_strategy','kpi_strategy',
        'reason','obj_output','obj_outcome',
        'goal_qty','goal_qual','budget_src','risk',
        'steps','budget_items','eval_items','result',
        'sign1','sign1_pos','sign2','sign2_pos','sign3','signers','note'
      ],
      Expenses: ['expense_id','project_id','item','amount','date','added_by','created_at','note'],
      ExpenseRequests: ['request_id','project_id','item','amount','date','requested_by','requested_name','created_at','note','status','approved_by','approved_at'],
      Users:    ['email','name','dept','role','active'],
      Log:      ['log_id','project_id','actor','action','note','ts'],
      Config:   ['key','value','updated_at','updated_by']
    };
    if (headers[name]) s.appendRow(headers[name]);
  }
  return s;
}
function toObj(h,r) {
  const o={};
  h.forEach((k,i)=>{
    let v=r[i];
    // แปลง Date object เป็น string YYYY-MM-DD ก่อนส่งออก
    if(v instanceof Date){
      const yr=v.getFullYear();
      const mo=String(v.getMonth()+1).padStart(2,'0');
      const dy=String(v.getDate()).padStart(2,'0');
      v=`${yr}-${mo}-${dy}`;
    }
    o[k]=v;
  });
  return o;
}
function log(pid,actor,action,note) {
  sheet(S.L).appendRow(['LOG-'+Utilities.getUuid().slice(0,6),pid,actor,action,note,new Date().toISOString()]);
}
function j(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
//  SETUP — รันครั้งแรกเพื่อสร้าง Sheets + ผู้ใช้ตัวอย่าง
// ================================================================
function setup() {
  Object.values(S).forEach(n => sheet(n));  // รวม Config แล้ว
  const u = sheet(S.U);
  if (u.getLastRow() <= 1) {
    u.appendRow(['admin@school.ac.th',   'ผู้อำนวยการ',           'ฝ่ายบริหาร',  'admin',   true]);
    u.appendRow(['finance@school.ac.th', 'หัวหน้าฝ่ายงบประมาณ',  'งานแผนงาน',   'finance', true]);
    u.appendRow(['teacher@school.ac.th', 'ครูตัวอย่าง',           'กลุ่มสาระฯ',  'teacher', true]);
  }
  Logger.log('✅ Setup complete');
}

// ================================================================
//  MIGRATE — รันครั้งเดียวเพื่อเพิ่ม column ใหม่ใน Sheet เก่า
//  ถ้ามี Projects sheet อยู่แล้วแต่ยังไม่มี column ใหม่
// ================================================================
function migrate() {
  const sh = sheet(S.P);
  const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // column ที่ต้องมีทั้งหมด (ตามลำดับที่ต้องการ)
  const required = [
    'project_id','title','dept','owner_email','owner_name',
    'budget_requested','budget_approved','status',
    'start_date','end_date','created_at',
    'proj_type','budget_plan','resp_group','place',
    'strategy','policy',
    'focus','royal_goal','school_strategy','kpi_strategy',
    'reason','obj_output','obj_outcome',
    'goal_qty','goal_qual','budget_src','risk',
    'steps','budget_items','eval_items','result',
    'sign1','sign1_pos','sign2','sign2_pos','sign3','note'
  ];

  let added = 0;
  required.forEach(col => {
    if (!headerRow.includes(col)) {
      const newCol = sh.getLastColumn() + 1;
      sh.getRange(1, newCol).setValue(col);
      added++;
      Logger.log('✅ เพิ่ม column: ' + col);
    }
  });

  if (added === 0) {
    Logger.log('✅ ทุก column ครบแล้ว ไม่ต้องเพิ่ม');
  } else {
    Logger.log('✅ Migrate เสร็จ เพิ่ม ' + added + ' column(s)');
  }
}
