"""Server-side interview primitives. No public HTTP server or browser credentials."""
from __future__ import annotations
import contextlib, copy, hashlib, json, os, random, re, sqlite3, time
import urllib.request, urllib.error
from pathlib import Path
from jsonschema import Draft202012Validator

class ContractError(ValueError):
    def __init__(self,code,diagnostics=None): self.code=code;self.diagnostics=diagnostics or [];super().__init__(code)
class ProviderError(RuntimeError):
    def __init__(self,code,status=None):self.code=code;self.status=status;super().__init__(code)
def require(condition,code):
    if not condition:raise ContractError(code)
def unique(values,code):require(len(values)==len(set(values)),code)
def validate_schema(schema,value):
    error=next(Draft202012Validator(schema).iter_errors(value),None)
    if error:
        context=error.context or [error]
        raise ContractError('schema:'+str(error.validator),[{'path':list(e.absolute_path),'rule':e.validator} for e in context[:10]])

def provider_schema(schema):
    """Conservative generation schema; complete restrictions stay in backend validation."""
    if isinstance(schema,list):return [provider_schema(x) for x in schema]
    if not isinstance(schema,dict):return schema
    unsupported={'maxLength','minLength','minItems','maxItems','minimum','maximum','additionalProperties'}
    return {k:provider_schema(v) for k,v in schema.items() if k not in unsupported}

def validate_input(pack,stage,inp):
    require(stage in ['01','02','03','04'],'unknown_stage')
    validate_schema(pack['schemas'][stage+'_input'],inp)
    if stage=='01':
        unique([s['source_id'] for s in inp['sources']],'duplicate_sources')
        require(any(s['kind']=='jd' and s['text'].strip() for s in inp['sources']),'missing_jd')
    if stage=='02':
        mode=inp['mode'];q=inp['question']
        if mode in ['ask_main','probe','reframe','clarify_transcript']:require(q is not None,'missing_question')
        else:require(q is None,'non_assessment_question_id')
        if mode in ['probe','reframe']:require(bool(inp['approved_follow_up'] and inp['approved_follow_up'].strip()),'missing_approved_followup')
        else:require(inp['approved_follow_up'] is None,'unexpected_followup')
        if mode=='close':require(inp['end_reason'] is not None,'missing_end_reason')
        if mode=='answer_candidate_question':require(inp['latest_turn'] is not None and inp['latest_turn']['speaker']=='candidate','missing_candidate_question')
        require(all(s['kind']=='company_faq' for s in inp['company_faq_sources']),'invalid_faq_source')
    if stage=='03':
        q=inp['question'];turns=inp['topic_transcript'];last=turns[-1]
        unique([t['turn_id'] for t in turns+inp['relevant_prior_turns']],'duplicate_turns')
        require(last['turn_id']==inp['latest_answer_turn_id'] and last['speaker']=='candidate','invalid_latest_answer')
        require(all(t['question_id']==q['question_id'] for t in turns),'wrong_topic_transcript')
        targets=[q['primary_competency_id']]+q['secondary_competency_ids']
        require({c['competency_id'] for c in inp['competencies']}==set(targets),'wrong_input_competencies')
        if inp['prior_topic_assessment']:require(inp['prior_topic_assessment']['question_id']==q['question_id'],'wrong_prior_assessment')
    if stage=='04':
        unique([t['turn_id'] for t in inp['transcript']],'duplicate_turns')
        unique([a['question_id'] for a in inp['latest_topic_assessments']],'duplicate_final_assessments')
        questions={q['question_id']:q for q in inp['blueprint']['questions']}
        for a in inp['latest_topic_assessments']:
            require(a['assessment_status']=='assessable' and a['question_id'] in questions,'invalid_final_topic')
            q=questions[a['question_id']];targets=[q['primary_competency_id']]+q['secondary_competency_ids']
            require({s['competency_id'] for s in a['topic_scores']}==set(targets),'invalid_final_targets')
            require(any(t['turn_id']==a['latest_answer_turn_id'] and t['speaker']=='candidate' and t['question_id']==q['question_id'] for t in inp['transcript']),'invalid_final_answer_id')
            for score in a['topic_scores']:
                for ev in score['evidence']:evidence_valid(ev,inp['transcript'],q['question_id'])
        require(compute_metrics(inp['blueprint'],inp['latest_topic_assessments'],inp['session_completion'])==inp['computed_metrics'],'invalid_computed_metrics')

def evidence_valid(ev,turns,topic=None):
    t=next((t for t in turns if t['turn_id']==ev['turn_id']),None)
    require(t is not None and t['speaker']=='candidate','invalid_evidence_author')
    require(bool(ev['quote'].strip()) and ev['quote'] in t['text'],'fabricated_evidence')
    if topic:require(t['question_id']==topic,'evidence_from_wrong_topic')

def blueprint_valid(bp,inp):
    cs,qs,rs=bp['competencies'],bp['questions'],bp['claims'];ctrl=inp['controls']
    cids={c['competency_id'] for c in cs};rids={r['claim_id'] for r in rs}
    unique([c['competency_id'] for c in cs],'duplicate_competencies');unique([q['question_id'] for q in qs],'duplicate_questions');unique([r['claim_id'] for r in rs],'duplicate_claims')
    require(sum(c['weight'] for c in cs)==100 and any(c['critical'] for c in cs),'invalid_weights_or_critical')
    require(len(qs)<=ctrl['max_main_questions'],'too_many_questions')
    require([q['order'] for q in qs]==list(range(1,len(qs)+1)),'invalid_question_order')
    require(bp['reserve_seconds']==ctrl['reserve_seconds'],'reserve_mismatch')
    require(sum(q['allocated_seconds'] for q in qs)==bp['question_budget_seconds'],'budget_sum_mismatch')
    require(bp['question_budget_seconds']+ctrl['intro_seconds']+ctrl['reserve_seconds']<=ctrl['duration_seconds'],'budget_exceeded')
    sources={s['source_id']:s for s in inp['sources']};linked=set()
    def source_ref(ref,jd=False):
        source=sources.get(ref['source_id']);require(source is not None,'unknown_source')
        require(bool(ref['quote'].strip()) and ref['quote'] in source['text'],'fabricated_source_quote')
        if jd:require(source['kind']=='jd','requirement_not_from_jd')
    for q in qs:
        targets=[q['primary_competency_id']]+q['secondary_competency_ids'];unique(targets,'duplicate_question_target')
        require(set(targets)<=cids,'unknown_competency')
        require([a['score'] for a in q['anchors']]==list(range(6)),'invalid_anchors')
        require(set(q['linked_claim_ids'])<=rids,'unknown_linked_claim');linked.update(q['linked_claim_ids'])
    for c in cs:
        require(c['minimum_topics']==ctrl['minimum_topics_per_competency'],'minimum_topics_changed')
        require(sum(c['competency_id'] in [q['primary_competency_id']]+q['secondary_competency_ids'] for q in qs)>=c['minimum_topics'],'insufficient_planned_coverage')
        for ref in c['requirement_refs']:source_ref(ref,True)
    deferred=set(bp['deferred_claim_ids']);unique(bp['deferred_claim_ids'],'duplicate_deferred_claim')
    require(not deferred&linked and deferred|linked==rids,'invalid_deferred_claims')
    for r in rs:
        source_ref(r['source_ref']);require(r['status']=='untested' and not r['evidence_turn_ids'],'invalid_initial_claim')
        require(set(r['competency_ids'])<=cids,'invalid_claim_competency')

def assessment_valid(a,inp):
    q=inp['question'];turns=inp['topic_transcript'];counters=inp['counters']
    require(a['question_id']==q['question_id'] and a['latest_answer_turn_id']==inp['latest_answer_turn_id'],'evaluation_identity_mismatch')
    non=a['answer_kind'] in ['clarification_request','transcript_problem']
    require((a['assessment_status']=='not_assessable')==non,'assessment_status_mismatch')
    if inp['topic_transcript'][-1]['quality']!='clear':require(non,'unclear_transcript_scored')
    if non:
        require(not any(a[k] for k in ['topic_scores','claim_updates','consistency_findings','unverified_statements']),'unassessable_has_scores')
    else:
        targets=[q['primary_competency_id']]+q['secondary_competency_ids'];returned=[s['competency_id'] for s in a['topic_scores']]
        unique(returned,'duplicate_score');require(set(returned)==set(targets),'wrong_score_targets')
        for score in a['topic_scores']:
            if score['score'] is not None:require(bool(score['evidence']),'score_without_evidence')
            for ev in score['evidence']:evidence_valid(ev,turns,q['question_id'])
    action=a['next_action']
    if action in ['probe','reframe']:require(bool(a['follow_up'] and a['follow_up'].strip()),'missing_followup')
    else:require(a['follow_up'] is None,'unexpected_followup')
    if action=='probe':
        require(counters['probe_count']<2,'probe_limit');require(a['probe_type']!='none','missing_probe_type')
    else:require(a['probe_type']=='none','unexpected_probe_type')
    if action=='reframe':require(not counters['reframe_used'],'reframe_limit')
    if action in ['probe','reframe']:require(min(counters['topic_remaining_seconds'],counters['work_remaining_seconds'])>=90,'insufficient_followup_time')
    all_turns=turns+inp['relevant_prior_turns'];candidate_ids={t['turn_id'] for t in all_turns if t['speaker']=='candidate'}
    for update in a['claim_updates']:
        require(update['claim_id'] in q['linked_claim_ids'],'unlinked_claim_update')
        require(bool(update['evidence_turn_ids']) and set(update['evidence_turn_ids'])<=candidate_ids,'invalid_claim_evidence')
    refs={t['turn_id']:t['text'] for t in all_turns}
    for claim in inp['claims']:
        refs[claim['claim_id']]=claim['source_ref']['quote'];refs[claim['source_ref']['source_id']]=claim['source_ref']['quote']
    for finding in a['consistency_findings']:
        for side in ['first','second']:
            ref=finding[side+'_reference'];quote=finding[side+'_quote']
            require(ref in refs and bool(quote.strip()) and quote in refs[ref],'invalid_consistency_reference')
    for ev in a['unverified_statements']:evidence_valid(ev,all_turns)

MODE_MAP={'ask_main':('main_question','interview_answer'),'probe':('follow_up','interview_answer'),'reframe':('reframe','interview_answer'),'clarify_transcript':('transcript_clarification','interview_answer'),'invite_candidate_questions':('candidate_questions','candidate_question'),'answer_candidate_question':('candidate_answer','candidate_question'),'close':('closing','none')}
def live_valid(out,inp):
    mode=inp['mode'];kind,expected=MODE_MAP[mode]
    require(out['kind']==kind and out['expected_input']==expected,'live_mode_mismatch')
    require(out['question_id']==(inp['question']['question_id'] if inp['question'] else None),'live_question_mismatch')
    if mode in ['ask_main','probe','reframe']:
        approved=inp['question']['question'] if mode=='ask_main' else inp['approved_follow_up']
        require(out['candidate_message']==approved,'live_text_changed')

def render_approved_turn(pack,inp):
    """No model call is needed to repeat backend-approved text. None requests AI FAQ/language rendering."""
    validate_input(pack,'02',inp);mode=inp['mode']
    if mode=='ask_main':message=inp['question']['question']
    elif mode in ['probe','reframe']:message=inp['approved_follow_up']
    elif inp['language'].casefold()=='english':
        fixed={'clarify_transcript':'The last response was unclear. Could you repeat it or type your answer?',
               'invite_candidate_questions':'What would you like to ask about the role or interview process?',
               'close':'Thank you for your time. This interview session has ended.'}
        if mode=='answer_candidate_question' and not inp['company_faq_sources']:
            message='I do not have confirmed information about that. Please ask the recruiter to confirm.'
        else:message=fixed.get(mode)
        if message is None:return None
    else:return None
    kind,expected=MODE_MAP[mode]
    out=dict(schema_version=pack['version'],request_id=inp['request_id'],status='ok',issues=[],data=dict(kind=kind,question_id=inp['question']['question_id'] if inp['question'] else None,candidate_message=message,expected_input=expected))
    validate_output(pack,'02',inp,out);return out

def compute_metrics(blueprint,assessments,completion='completed'):
    require(completion in ['completed','withdrawn','technical_interruption'],'invalid_completion')
    by_q={};questions={q['question_id']:q for q in blueprint['questions']}
    for a in assessments:
        require(a['question_id'] in questions,'unknown_assessed_question')
        if a['assessment_status']=='assessable':by_q[a['question_id']]=a
    metrics=[]
    for c in blueprint['competencies']:
        eligible=[];scores=[]
        for qid,a in by_q.items():
            q=questions[qid];item=next((s for s in a['topic_scores'] if s['competency_id']==c['competency_id']),None)
            if item:
                require(c['competency_id'] in [q['primary_competency_id']]+q['secondary_competency_ids'],'score_for_unplanned_target')
            if item and item['score'] is not None and item['confidence'] in ['medium','high'] and item['evidence']:
                eligible.append(qid);scores.append(item['score'])
        enough=len(eligible)>=c['minimum_topics']
        metrics.append(dict(competency_id=c['competency_id'],weight=c['weight'],critical=c['critical'],eligible_question_ids=eligible,sufficient=enough,score=sum(scores)/len(scores) if enough else None))
    coverage=sum(m['weight'] for m in metrics if m['sufficient']);critical=[m for m in metrics if m['critical']]
    allowed=completion=='completed' and coverage>=80 and all(m['sufficient'] for m in critical)
    overall=sum(m['score']*m['weight'] for m in metrics if m['sufficient'])/coverage if allowed else None
    if not allowed:signal='insufficient_evidence'
    elif any(m['score']<2.5 for m in critical):signal='concern_signal'
    elif overall>=4.2 and all(m['score']>=4 for m in critical):signal='strong_positive_signal'
    elif overall>=3.5 and all(m['score']>=3 for m in critical):signal='positive_signal_with_follow_up'
    else:signal='mixed_signal'
    return dict(competencies=metrics,coverage_percent=coverage,overall_score=overall,signal=signal)

def final_valid(out,inp):
    metrics=inp['computed_metrics']
    for field,source in [('overall_score','overall_score'),('coverage_percent','coverage_percent'),('recommendation','signal')]:require(out[field]==metrics[source],'final_metrics_changed')
    wanted={m['competency_id']:m for m in metrics['competencies']};returned=[c['competency_id'] for c in out['competency_findings']]
    unique(returned,'duplicate_final_competency');require(set(returned)==set(wanted),'final_competencies_missing')
    for finding in out['competency_findings']:
        require(finding['score']==wanted[finding['competency_id']]['score'],'final_competency_score_changed')
        for ev in finding['evidence']:evidence_valid(ev,inp['transcript'])
    claims={c['claim_id']:c for c in inp['claim_ledger']};ids=[c['claim_id'] for c in out['claim_findings']]
    unique(ids,'duplicate_final_claim');require(set(ids)==set(claims),'final_claim_missing')
    for finding in out['claim_findings']:
        claim=claims[finding['claim_id']];require(finding['status']==claim['status'],'final_claim_status_changed')
        require(set(finding['evidence_turn_ids'])==set(claim['evidence_turn_ids']),'final_claim_evidence_changed')

def validate_output(pack,stage,inp,out):
    validate_schema(pack['schemas'][stage+'_output'],out)
    require(out['schema_version']==pack['version'] and out['request_id']==inp['request_id'],'response_identity_mismatch')
    if out['status']=='needs_review':require(out['data'] is None and bool(out['issues']),'invalid_review_envelope');return
    require(out['data'] is not None and not out['issues'],'invalid_success_envelope')
    {'01':blueprint_valid,'02':live_valid,'03':assessment_valid,'04':final_valid}[stage](out['data'],inp)

def route_next(state):
    if state['stopped']:return 'close'
    if state['paused']:return 'pause'
    if state['work_remaining_seconds']<=0:return 'candidate_questions'
    if state['quality']!='clear':return 'clarify_transcript' if state['transcript_repairs']<2 else 'pause'
    enough=min(state['work_remaining_seconds'],state['topic_remaining_seconds'])>=90
    if state['next_action']=='reframe' and not state['reframe_used'] and enough:return 'reframe'
    if state['next_action']=='probe' and state['probe_count']<min(state['max_probes'],2) and enough:return 'probe'
    if state['next_question_seconds'] is None or state['next_question_seconds']>state['work_remaining_seconds']:return 'candidate_questions'
    return 'advance'

class SessionStore:
    """Private storage primitive. Tenant ID must come from authenticated server context."""
    def __init__(self,path):
        self.path=str(path)
        with self.connection() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS sessions(tenant TEXT,id TEXT,revision INTEGER,state TEXT,PRIMARY KEY(tenant,id))')
            db.execute('CREATE TABLE IF NOT EXISTS events(tenant TEXT,session TEXT,event TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(tenant,session,event))')
            db.execute('CREATE TABLE IF NOT EXISTS reports(tenant TEXT,session TEXT,revision INTEGER,body TEXT,PRIMARY KEY(tenant,session,revision))')
    @contextlib.contextmanager
    def connection(self):
        db=sqlite3.connect(self.path,timeout=10);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()
    def create(self,tenant,session,state):
        with self.connection() as db:db.execute('INSERT INTO sessions VALUES(?,?,?,?)',(tenant,session,0,json.dumps(state)))
    def read(self,tenant,session):
        with self.connection() as db:row=db.execute('SELECT revision,state FROM sessions WHERE tenant=? AND id=?',(tenant,session)).fetchone()
        require(row is not None,'session_not_found');return dict(revision=row['revision'],state=json.loads(row['state']))
    def transition(self,tenant,session,expected_revision,event_id,new_state,result):
        # Transaction, persisted event result and state revision change are atomic.
        fingerprint=hashlib.sha256(json.dumps([new_state,result],sort_keys=True).encode()).hexdigest()
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT fingerprint,result FROM events WHERE tenant=? AND session=? AND event=?',(tenant,session,event_id)).fetchone()
            if old:
                require(old['fingerprint']==fingerprint,'event_id_reused_with_different_payload');return json.loads(old['result'])
            row=db.execute('SELECT revision,state FROM sessions WHERE tenant=? AND id=?',(tenant,session)).fetchone()
            require(row is not None,'session_not_found');require(row['revision']==expected_revision,'stale_revision')
            current=json.loads(row['state']);require(current.get('status') not in ['closed','complete'],'session_closed')
            next_state={**current,**new_state}
            db.execute('UPDATE sessions SET revision=?,state=? WHERE tenant=? AND id=?',(expected_revision+1,json.dumps(next_state),tenant,session))
            db.execute('INSERT INTO events VALUES(?,?,?,?,?)',(tenant,session,event_id,fingerprint,json.dumps(result)))
        return result

    def save_report(self,tenant,session,revision,report):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT state FROM sessions WHERE tenant=? AND id=?',(tenant,session)).fetchone()
            require(row is not None,'session_not_found');require(json.loads(row['state']).get('status')=='closed','report_before_close')
            old=db.execute('SELECT body FROM reports WHERE tenant=? AND session=? AND revision=?',(tenant,session,revision)).fetchone()
            if old:
                require(json.loads(old['body'])==report,'report_revision_conflict');return
            db.execute('INSERT INTO reports VALUES(?,?,?,?)',(tenant,session,revision,json.dumps(report)))
    def read_report(self,tenant,session,revision):
        with self.connection() as db:row=db.execute('SELECT body FROM reports WHERE tenant=? AND session=? AND revision=?',(tenant,session,revision)).fetchone()
        require(row is not None,'report_not_found');return json.loads(row['body'])

def load_key(env_path):
    key=os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if key:return key
    path=Path(env_path)
    if path.is_file():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            match=re.match(r'\s*(?:export\s+)?(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.*)',line)
            if match:
                value=match.group(2).strip()
                if value.startswith(('"',"'")) and value[-1:]==value[:1]:value=value[1:-1]
                else:value=value.split(' #',1)[0].strip()
                if value:return value
    raise ProviderError('api_key_not_configured')

class GeminiClient:
    def __init__(self,pack,key,model,timeout=60,attempts=2):
        require(isinstance(model,str) and re.fullmatch(r'[A-Za-z0-9._-]+',model),'invalid_model')
        require(1<=attempts<=3 and 1<=timeout<=120,'invalid_request_limits')
        self.pack=pack;self.key=key;self.model=model;self.timeout=timeout;self.attempts=attempts
    def call(self,stage,inp):
        validate_input(self.pack,stage,inp)
        feedback=None;started=time.monotonic();previous_usage=[];previous_attempts=0
        retryable={'fabricated_source_quote','fabricated_evidence','live_text_changed','invalid_weights_or_critical','budget_sum_mismatch','budget_exceeded','invalid_anchors','invalid_deferred_claims','invalid_question_order','insufficient_planned_coverage','response_identity_mismatch','final_metrics_changed','final_competency_score_changed','invalid_evidence_author','wrong_score_targets'}
        for generation in range(2):
            try:
                output,metadata=self._call_once(stage,inp,feedback)
                metadata.update(validation_regenerations=generation,total_elapsed_seconds=round(time.monotonic()-started,3),validation_feedback=feedback,usage_records=previous_usage+[metadata['usage']],total_provider_attempts=previous_attempts+metadata['attempts'])
                return output,metadata
            except ContractError as error:
                if generation or not (error.code.startswith('schema:') or error.code in retryable):raise
                feedback={'code':error.code,'diagnostics':error.diagnostics}
                if hasattr(error,'provider_usage'):previous_usage.append(error.provider_usage)
                previous_attempts+=getattr(error,'provider_attempts',0)
        raise ProviderError('validation_regeneration_limit')

    def _call_once(self,stage,inp,feedback=None):
        validate_input(self.pack,stage,inp)
        names={'01':'01_blueprint','02':'02_live_interviewer','03':'03_topic_evaluator','04':'04_final_report'}
        instruction=self.pack['system_prompts'][names[stage]]
        if feedback:
            instruction+='\nBACKEND VALIDATION RETRY (one permitted regeneration): '+json.dumps(feedback)+'\nRegenerate a full compliant object using the SAME source data. Copy quotations as exact contiguous substrings with identical case and punctuation; a full original sentence is safer than reconstructing a fragment. Include every required field and obey all full-schema bounds. Do not repair, invent or improve candidate evidence. Do not change a score just to seek acceptance. If inputs are genuinely inconsistent, use needs_review.'
        payload=dict(systemInstruction=dict(parts=[dict(text=instruction)]),contents=[dict(role='user',parts=[dict(text=json.dumps(inp,ensure_ascii=False))])],generationConfig=dict(candidateCount=1,responseMimeType='application/json',responseJsonSchema=provider_schema(self.pack['schemas'][stage+'_output']),maxOutputTokens=16384 if stage in ['01','04'] else 8192))
        data=json.dumps(payload).encode();start=time.monotonic()
        for attempt in range(self.attempts):
            request=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/'+self.model+':generateContent',data=data,headers={'Content-Type':'application/json','x-goog-api-key':self.key},method='POST')
            try:
                with urllib.request.urlopen(request,timeout=self.timeout) as response:
                    body=response.read(2_000_001)
                require(len(body)<=2_000_000,'provider_response_too_large');raw=json.loads(body);break
            except urllib.error.HTTPError as e:
                try:
                    details=json.loads(e.read()).get('error',{}).get('details',[])
                    daily=any('PerDay' in str(v.get('quotaId','')) for d in details for v in d.get('violations',[]))
                except (ValueError,TypeError,AttributeError):daily=False
                if e.code==429 and daily:raise ProviderError('provider_daily_quota_exhausted',429) from None
                retry=e.code in [408,429,500,502,503,504] and attempt+1<self.attempts
                if not retry:raise ProviderError('provider_http_error',e.code) from None
                hint=e.headers.get('Retry-After','');delay=float(hint) if re.fullmatch(r'\d+(?:\.\d+)?',hint) else 2**attempt+random.random()
                if delay>10:raise ProviderError('provider_retry_delay_exceeds_budget',e.code) from None
                time.sleep(delay)
            except (urllib.error.URLError,TimeoutError):
                if attempt+1>=self.attempts:raise ProviderError('provider_network_error') from None
                time.sleep(2**attempt+random.random())
        candidates=raw.get('candidates',[])
        if raw.get('promptFeedback',{}).get('blockReason') or not candidates:raise ProviderError('provider_blocked_or_empty')
        candidate=candidates[0]
        if candidate.get('finishReason')!='STOP':raise ProviderError('provider_incomplete_'+str(candidate.get('finishReason')))
        content=''.join(p['text'] for p in candidate.get('content',{}).get('parts',[]) if isinstance(p.get('text'),str) and not p.get('thought'))
        try:out=json.loads(content)
        except (ValueError,TypeError):raise ProviderError('provider_invalid_json') from None
        try:validate_output(self.pack,stage,inp,out)
        except ContractError as error:
            error.provider_usage=raw.get('usageMetadata',{});error.provider_attempts=attempt+1;raise
        return out,dict(elapsed_seconds=round(time.monotonic()-start,3),attempts=attempt+1,usage=raw.get('usageMetadata',{}),system_instruction_sha256=hashlib.sha256(instruction.encode()).hexdigest())
