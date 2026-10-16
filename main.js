'use strict';
// Fallback contact shown if the form submission fails. The form posts to the Formspree endpoint in index.html.
const CONTACT_EMAIL = 'contact@dasmedhub.com';

const IDS = '"tenant_id": "<tenant-uuid>", "encounter_id": "<encounter-uuid>", "document_id": "<document-uuid>"';
const NOTE = 'DEPT: ENT. c/o: vertigo - 3 days. Tinnitus left ear, mild reduced hearing. No discharge from ear. H/o allergies: none known. O/E EAR: L -> EAC -> clear, TM -> Intact. Provisional Dx: peripheral vertigo. Rx: 1) TAB BETAHISTINE 16mg p/o twice daily 2) TAB PANTOPRAZOLE 40mg p/o once empty stomach. 5 days. Follow-up: 5 days.';
const j = o => JSON.stringify(o, null, 2);
const req = x => '{\n  ' + IDS + ',\n  ' + x + '\n}';
// Response envelope, without timing or internal model fields.
const env = (workflow, pv, result, reused = true) => ({request_id:'<request-id>',tenant_id:'<tenant-uuid>',encounter_id:'<encounter-uuid>',document_id:'<document-uuid>',workflow,result,warnings:[],ocr_reused:reused});
const sp = t => {const s = NOTE.indexOf(t); return {start:s,end:s+t.length};};
const ent = (text,type,norm,med=null) => ({text,type,normalized_text:norm,source_span:sp(text),unit:null,medication_details:med});
const entities = [
 ent('vertigo - 3 days','symptom','vertigo'),
 ent('Tinnitus left ear','symptom','tinnitus, left ear'),
 ent('mild reduced hearing','symptom','reduced hearing'),
 ent('No discharge from ear','symptom','ear discharge, absent'),
 ent('EAC -> clear','finding','external auditory canal clear'),
 ent('TM -> Intact','finding','tympanic membrane intact'),
 ent('peripheral vertigo','diagnosis','peripheral vertigo'),
 ent('TAB BETAHISTINE 16mg p/o','medication','betahistine',{dose:'16mg',frequency:'twice daily',duration:'5 days',route:'p/o'}),
 ent('TAB PANTOPRAZOLE 40mg p/o','medication','pantoprazole',{dose:'40mg',frequency:'once empty stomach',duration:'5 days',route:'p/o'})];
const nt = (src,norm,cat,sn,ic) => ({source_text:src,normalized_text:norm,category:cat,snomed_candidates:sn,icd11_candidates:ic});
const C = (code,display,source) => ({code,display,score:null,source});
const S = (c,d)=>C(c,d,'SNOMED_CT'), I = (c,d)=>C(c,d,'ICD11');
const terms = [
 ['vertigo','vertigo','symptom'],['Tinnitus left ear','tinnitus','symptom'],['mild reduced hearing','reduced hearing','symptom'],
 ['No discharge from ear','ear discharge, absent','symptom'],['EAC -> clear','external auditory canal clear','finding'],
 ['TM -> Intact','tympanic membrane intact','finding'],['peripheral vertigo','peripheral vertigo','diagnosis'],
 ['TAB BETAHISTINE 16mg p/o','betahistine','medication'],['TAB PANTOPRAZOLE 40mg p/o','pantoprazole','medication']];
const queryTerms = terms.map(t=>t[1]);
const vS=[S('399153001','Vertigo'),S('69096003','Dizziness')], tS=[S('155248003','Tinnitus'),S('60862001','Tinnitus')], pS=[S('395821003','Pantoprazole'),S('317317009','Product containing pantoprazole')];
const vI=[I('MB48.0','Vertigo'),I('MB48.0Z','Vertigo, unspecified')], tI=[I('MC41','Tinnitus')], pI=[I('XM86M3','Pantoprazole')];
const pick = (map,key) => map[key]||[];
const sMap={'vertigo':vS,'Tinnitus left ear':tS,'TAB PANTOPRAZOLE 40mg p/o':pS}, iMap={'vertigo':vI,'Tinnitus left ear':tI,'TAB PANTOPRAZOLE 40mg p/o':pI};
const flat = (m,k) => Object.values(m).flat();
const normalization = terms.map(t=>nt(t[0],t[1],t[2],[],[]));
const snomedTerms = terms.map(t=>({source_text:t[0],normalized_text:t[1],category:t[2],snomed_candidates:pick(sMap,t[0])}));
const icdTerms = terms.map(t=>({source_text:t[0],normalized_text:t[1],category:t[2],icd11_candidates:pick(iMap,t[0])}));

const DEMO = [
 {id:'input', label:'Input Document', resLabel:'Example input document', ep:'POST /api/v1/ocr',
  note:'Your application submits a scan or PDF (base64 / data URI) with its file type, or plain text, which skips OCR. This stage shows the example note used throughout the walkthrough.',
  req:req('"file": "data:image/png;base64,<…>",\n  "file_type": "image/png",\n  "language": "en"'), res:NOTE},
 {id:'ocr', label:'Extracted Text', ep:'POST /api/v1/ocr',
  note:'The OCR workflow returns extracted text, which your application can show to staff for review before downstream use.',
  req:'(same request as previous stage)', res:j(env('ocr','ocr.v1',{text:NOTE},false))},
 {id:'ent', label:'Entities', ep:'POST /api/v1/entities',
  note:'Typed entities with a normalized form, a character span into the source text, and structured medication details where applicable.',
  req:req('"text": "<extracted text>"'), res:j(env('entities','entities.v1',{entities}))},
 {id:'norm', label:'Normalization', ep:'POST /api/v1/normalization',
  note:'Terms are normalized and categorized. No official codes are assigned at this step, so the candidate arrays are empty by design.',
  req:req('"text": "<extracted text>"'), res:j(env('normalization','normalization.v1',{normalized_terms:normalization}))},
 {id:'sum', label:'Clinical Summary', ep:'POST /api/v1/summary',
  note:'A structured summary organised into sections. Sections without evidence in the source are returned empty.',
  req:req('"text": "<extracted text>"'),
  res:j(env('summary','summary.v1',{
   patient_info:{name:'Example Patient',age:'38 YEARS',gender:'MALE',mrn:''},
   admission_details:{admission_date:'',discharge_date:'',ward:'',consultant:'',unit:'ENT',bed:''},
   presenting_complaints:['Vertigo - 3 days','Tinnitus, left ear','Mild reduced hearing','No discharge from ear'],
   history_of_present_illness:'Three-day history of vertigo with left-sided tinnitus and mild reduced hearing. No ear discharge.',
   examination_findings:{vitals:{},systemic:{}},
   investigations:{labs:[],imaging:[],other:[]},
   diagnosis:{primary:'Peripheral vertigo',secondary:[]},
   procedures:[],
   treatment_given:['TAB BETAHISTINE 16mg p/o twice daily','TAB PANTOPRAZOLE 40mg p/o once empty stomach'],
   discharge_medications:[{medication:'TAB BETAHISTINE',dosage:'16mg',frequency:'twice daily',route:'p/o',duration:'5 days'},{medication:'TAB PANTOPRAZOLE',dosage:'40mg',frequency:'once empty stomach',route:'p/o',duration:'5 days'}],
   follow_up:{appointment:'Review after 5 days',instructions:[]},
   patient_education:[],emergency_instructions:''}))},
 {id:'soap', label:'SOAP Note', ep:'POST /api/v1/soap',
  note:'A SOAP draft returned as four strings for clinician review and editing.',
  req:req('"text": "<extracted text>"'),
  res:j(env('soap','soap.v1',{
   subjective:'Presents with 3-day history of vertigo with left-sided tinnitus and mild reduced hearing. No ear discharge. No known allergies.',
   objective:'Left external auditory canal clear; tympanic membrane intact. Vital signs not recorded.',
   assessment:'Provisional diagnosis: peripheral vertigo.',
   plan:'Medications:\n1. Tab Betahistine 16mg p.o. twice daily\n2. Tab Pantoprazole 40mg p.o. once on empty stomach\nDuration: 5 days.\nFollow-up: in 5 days.'}))},
 {id:'snomed', label:'SNOMED CT', ep:'POST /api/v1/snomed',
  note:'Candidate lookups for normalized terms, per term and as a flat list. Candidates are for review and confirmation, not final coding, and unmapped terms return empty arrays. Arrays are abbreviated here.',
  req:req('"text": "<extracted text>"'),
  res:j(env('snomed','snomed.v1',{query_terms:queryTerms,system:'SNOMED_CT',normalized_terms:snomedTerms,ai_normalized:true,snomed_candidates:[...vS,...tS,...pS]}))},
 {id:'icd', label:'ICD-11', ep:'POST /api/v1/icd',
  note:'The same pattern for ICD-11. Candidates need clinician or coder confirmation. Arrays are abbreviated here.',
  req:req('"text": "<extracted text>"'),
  res:j(env('icd','icd.v1',{query_terms:queryTerms,system:'ICD11',normalized_terms:icdTerms,ai_normalized:true,icd_candidates:[...vI,...tI,...pI]}))},
 {id:'fhir', label:'FHIR Output', ep:'POST /api/v1/fhir',
  note:'FHIR R4 resource wrappers, validated by the engine. Abbreviated and illustrative.',
  req:req('"text": "<extracted text>"'),
  res:j(env('fhir','fhir.v1',{resources:[{resourceType:'Condition',resource:{resourceType:'Condition',code:{text:'Peripheral vertigo'},subject:{reference:'Patient/example'}}}]}))},
 {id:'med', label:'Medication Safety', ep:'POST /api/v1/pharmacovigilance/safety-analysis',
  note:'Takes a medication list (or a processed document) and returns interaction findings and an overall risk assessment for pharmacist or prescriber review. Values are placeholders.',
  req:j({medications:['betahistine','pantoprazole'],include_safety_signals:false}),
  res:j({medications_analyzed:['betahistine','pantoprazole'],drug_interactions:[],pairwise_interactions:[],safety_signals:[],overall_risk_assessment:'(illustrative)',recommendations:['Review by pharmacist or prescriber']})}
];

const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const hl=t=>esc(t).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,(m,str,colon,kw)=>str?(colon?'<span class="k">'+str+'</span>'+colon:'<span class="s">'+str+'</span>'):kw?'<span class="b">'+m+'</span>':'<span class="n">'+m+'</span>');
(function nav(){
  const b=document.getElementById('menuBtn'), m=document.getElementById('menu');
  const set=o=>{m.classList.toggle('open',o);b.setAttribute('aria-expanded',String(o));};
  b.addEventListener('click',()=>set(!m.classList.contains('open')));
  m.addEventListener('click',e=>{if(e.target.closest('a'))set(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){set(false);b.focus();}});
})();

(function demo(){
  const tabs=document.getElementById('tabs'), panel=document.getElementById('panel');
  const btns=DEMO.map((d,i)=>{
    const t=document.createElement('button');
    t.type='button';t.role='tab';t.id='tab-'+d.id;t.textContent=d.label;
    t.setAttribute('aria-controls','panel');
    t.addEventListener('click',()=>show(i,false));
    tabs.appendChild(t);return t;
  });
  function show(i,focus){
    const d=DEMO[i];
    btns.forEach((t,k)=>{t.setAttribute('aria-selected',String(k===i));t.tabIndex=k===i?0:-1;});
    panel.setAttribute('aria-labelledby','tab-'+d.id);
    document.getElementById('dEp').textContent=d.ep;
    document.getElementById('dNote').textContent=d.note;
    document.getElementById('dReq').innerHTML=hl(d.req);
    const rs=document.getElementById('dRes');d.resLabel?rs.textContent=d.res:rs.innerHTML=hl(d.res);document.getElementById('dResL').textContent=d.resLabel||'Response (illustrative)';
    if(focus)btns[i].focus();
  }
  tabs.addEventListener('keydown',e=>{
    const i=btns.indexOf(document.activeElement);if(i<0)return;
    const k={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:btns.length-1}[e.key];
    if(k===undefined)return;e.preventDefault();show((k+btns.length)%btns.length,true);
  });
  show(0,false);
})();

(function form(){
  const f=document.getElementById('form'), s=document.getElementById('fStatus'), btn=f.querySelector('button[type=submit]');
  f.addEventListener('submit',async e=>{
    e.preventDefault();
    let ok=true;
    ['fn','fe','fo'].forEach(id=>{
      const el=document.getElementById(id);
      const bad=!el.value.trim()||(el.type==='email'&&!/^\S+@\S+\.\S+$/.test(el.value));
      el.setAttribute('aria-invalid',String(bad));if(bad)ok=false;
    });
    if(!ok){s.textContent='Please complete name, a valid work email and organization.';return;}
    btn.disabled=true;s.textContent='Sending…';
    try{
      const r=await fetch(f.action,{method:'POST',body:new FormData(f),headers:{Accept:'application/json'}});
      if(r.ok){f.reset();s.textContent='Thank you. Your enquiry has been sent and the DAS Medhub team will be in touch.';}
      else{const d=await r.json().catch(()=>({}));s.textContent=(d.errors&&d.errors.map(x=>x.message).join(' '))||'Your enquiry could not be sent. Please email '+CONTACT_EMAIL+' instead.';}
    }catch(_){s.textContent='Your enquiry could not be sent. Please check your connection or email '+CONTACT_EMAIL+' instead.';}
    btn.disabled=false;
  });
})();


// Sample request in the technical section (placeholder IDs, example text).
document.getElementById('sample').innerHTML=hl('POST https://YOUR-CLINOVA-HOST/api/v1/normalization\n'+req('"text": "HTN, diabetes mellitus, metformin 500 mg twice daily",\n  "language": "en"'));
document.getElementById('yr').textContent=new Date().getFullYear();
// Scroll reveal (lightweight; content stays visible without IntersectionObserver).
(function reveal(){
  const els=document.querySelectorAll('.rv');
  if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return;}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.08});
  els.forEach(e=>io.observe(e));
})();
