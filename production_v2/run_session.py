"""Live synthetic full session over a frozen, pre-approved fixture blueprint.
This tests integration, not human candidate behavior or predictive validity.
"""
import argparse,copy,json,time,uuid
from pathlib import Path
from runtime import GeminiClient,SessionStore,load_key,compute_metrics,route_next,ContractError,render_approved_turn,validate_input,validate_output,require

ROOT=Path(__file__).parent
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model');parser.add_argument('--resume',type=Path);parser.add_argument('--local-delivery',action='store_true',help='Render approved questions and fixed scripts locally; Gemini still evaluates/reports.');args=parser.parse_args()
    saved=json.loads(args.resume.read_text(encoding='utf-8')) if args.resume else None
    if saved and saved.get('completed'):
        print(json.dumps({'completed':True,'final_report':saved['final_report'],'provider_calls':0}));return
    pack=json.loads((ROOT/'prompt_pack.json').read_text(encoding='utf-8'));fixture=pack['synthetic_session'];model=args.model or (saved['model'] if saved else json.loads((ROOT/'model_config.json').read_text())['model'])
    if saved:
        require(saved.get('prompt_hashes')==pack['hashes']['system_prompts'],'resume_prompt_version_changed')
        require(model==saved['model'],'resume_model_changed');args.local_delivery=saved['local_delivery']
    cached_calls=saved['calls'] if saved else []
    client=GeminiClient(pack,load_key(ROOT.parent/'.env'),model)
    session_id=saved['session_id'] if saved else 'synthetic-'+uuid.uuid4().hex[:12];tenant='local-synthetic';(ROOT/'reports').mkdir(exist_ok=True);store=SessionStore(ROOT/'reports'/'synthetic.sqlite')
    blueprint=copy.deepcopy(fixture['blueprint']);role=pack['synthetic_samples']['01_input']['role'];claims=copy.deepcopy(blueprint['claims']);transcript=[];latest={};calls=[];completed=[];probes=0;reframe=False
    if not saved:store.create(tenant,session_id,{'status':'choosing_next','question_id':None,'active_turn_id':None,'probe_count':0,'completed_question_ids':[]})
    def persist(event,state,result):
        revision=store.read(tenant,session_id)['revision'];return store.transition(tenant,session_id,revision,event,state,result)
    def invoke(stage,data):
        data['request_id']=session_id+'-'+stage+'-'+str(len(calls)+1)
        checkpoint=dict(session_id=session_id,model=model,prompt_hashes=pack['hashes']['system_prompts'],local_delivery=args.local_delivery,completed=False,calls=calls+cached_calls[len(calls):],transcript=transcript,latest_topic_assessments=list(latest.values()),claim_ledger=claims,pending_stage=stage,pending_input=data)
        (ROOT/'reports'/('checkpoint-'+session_id+'.json')).write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2),encoding='utf-8')
        if len(calls)<len(cached_calls):
            cache=cached_calls[len(calls)];require(cache['stage']==stage,'resume_stage_changed');response=cache['response'];validate_input(pack,stage,data);validate_output(pack,stage,data,response);metadata=dict(cache['metadata'],replayed=True)
        else:
            response=render_approved_turn(pack,data) if stage=='02' and args.local_delivery else None
            if response is not None:metadata={'provider_call':False,'renderer':'approved_text','elapsed_seconds':0,'usage':{}}
            else:response,metadata=client.call(stage,data);metadata['provider_call']=True
        calls.append(dict(stage=stage,metadata=metadata,response=response))
        if response['status']!='ok':raise ContractError('live_needs_review')
        print(json.dumps({'stage':stage,'call':len(calls),'status':'validated'}),flush=True)
        return response['data']
    def add_turn(speaker,text,qid):
        turn=dict(turn_id='T'+str(len(transcript)+1),question_id=qid,speaker=speaker,text=text,quality='clear');transcript.append(turn);return turn
    def live(mode,q=None,follow=None,last=None,end=None):
        data=dict(language=role['language'],mode=mode,question={k:q[k] for k in ['question_id','question','scenario_facts']} if q else None,approved_follow_up=follow,latest_turn=last,company_faq_sources=[],end_reason=end)
        out=invoke('02',data);turn=add_turn('interviewer',out['candidate_message'],out['question_id'])
        persist('show-'+turn['turn_id'],{'status':'awaiting_answer' if out['expected_input']=='interview_answer' else ('candidate_questions' if out['expected_input']=='candidate_question' else 'closing'),'active_turn_id':turn['turn_id'],'question_id':out['question_id'],'probe_count':probes if q else 0,'reframe_used':reframe if q else False},out)
        return turn
    follow_answers={
        'Q1':'I cannot confirm the metric denominator or measurement window from memory. I would check an anonymized rollout log before claiming a causal 30 percent result. My implementation scope was the retry worker.',
        'Q2':'I would use a durable operation identity, atomic state updates and a reconciliation path. Provider guarantees must be verified, and an ambiguous result cannot safely be treated as a failed charge.',
        'Q3':'If provider status remains unavailable, I would stop automated retries and keep affected operations pending for reconciliation, while coordinating impact review rather than risking more duplicate charges.',
        'Q4':'My decision concerned the initial release architecture, not all platform work. Independent release pressure and measured coupling costs would trigger review of the service boundary.',
        'Q5':'I would use a controlled reconciliation owner or lock, preserve the original audit history and verify the correction is repeatable under concurrent workers before enabling automatic repair.'}
    for index,q in enumerate(blueprint['questions']):
        qid=q['question_id'];probes=0;reframe=False;live('ask_main',q)
        answers=[t['text'] for t in fixture['transcript'] if t['speaker']=='candidate' and t['question_id']==qid]
        answer_text=answers[0] if qid=='Q1' else answers[-1]
        for round_index in range(4):
            turn=add_turn('candidate',answer_text,qid);persist('answer-'+turn['turn_id'],{'status':'evaluating'},turn)
            topic=[t for t in transcript if t['question_id']==qid]
            inp=dict(role=role,question=q,competencies=[c for c in blueprint['competencies'] if c['competency_id'] in [q['primary_competency_id']]+q['secondary_competency_ids']],topic_transcript=topic,relevant_prior_turns=[t for t in transcript if t['question_id']!=qid],latest_answer_turn_id=turn['turn_id'],prior_topic_assessment=latest.get(qid),claims=claims,counters=dict(probe_count=probes,reframe_used=reframe,topic_remaining_seconds=max(0,q['allocated_seconds']-60*(round_index+1)),work_remaining_seconds=sum(x['allocated_seconds'] for x in blueprint['questions'][index:])-60*(round_index+1)))
            assessed=invoke('03',inp)
            if assessed['assessment_status']=='assessable':latest[qid]=assessed
            for update in assessed['claim_updates']:
                claim=next(c for c in claims if c['claim_id']==update['claim_id']);claim.update(status=update['status'],evidence_turn_ids=update['evidence_turn_ids'])
            persist('evaluation-'+turn['turn_id'],{'status':'choosing_next'},assessed)
            decision=route_next(dict(stopped=False,paused=False,work_remaining_seconds=inp['counters']['work_remaining_seconds'],topic_remaining_seconds=inp['counters']['topic_remaining_seconds'],probe_count=probes,max_probes=2,reframe_used=reframe,transcript_repairs=0,quality='clear',next_action=assessed['next_action'],next_question_seconds=blueprint['questions'][index+1]['allocated_seconds'] if index+1<len(blueprint['questions']) else None))
            if decision in ['probe','reframe']:
                if decision=='probe':probes+=1
                else:reframe=True
                live(decision,q,assessed['follow_up'],turn)
                answer_text=answers[-1] if qid=='Q1' and round_index==0 else follow_answers[qid]
            else:break
        else:raise ContractError('synthetic_turn_cap_exceeded')
        completed.append(qid)
        persist('complete-'+qid,{'status':'choosing_next','completed_question_ids':completed,'question_id':None},{'completed_question_id':qid})
        if decision=='candidate_questions':break
    live('invite_candidate_questions')
    faq=add_turn('candidate','What is the next step after this interview?',None)
    live('answer_candidate_question',last=faq)
    live('close',end='completed')
    persist('close',{'status':'closed'},dict(reason='completed'))
    assessments=list(latest.values());metrics=compute_metrics(blueprint,assessments,'completed')
    report=invoke('04',dict(role=role,blueprint=blueprint,latest_topic_assessments=assessments,transcript=transcript,claim_ledger=claims,computed_metrics=metrics,session_completion='completed'))
    store.save_report(tenant,session_id,1,report)
    artifact=dict(session_id=session_id,model=model,synthetic=True,timing='Controlled synthetic answer timing; provider wait excluded. Not a human usability study.',blueprint_origin='Frozen author-designed synthetic fixture; live planner separately smoke-tested.',calls=calls,transcript=transcript,latest_topic_assessments=assessments,claim_ledger=claims,metrics=metrics,report=report,passed=True)
    target=ROOT/'reports'/('full-session-'+session_id+'.json');target.write_text(json.dumps(artifact,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'reports'/('checkpoint-'+session_id+'.json')).write_text(json.dumps({'session_id':session_id,'model':model,'completed':True,'final_report':target.name},indent=2),encoding='utf-8')
    print(json.dumps({'passed':True,'model':model,'calls':len(calls),'provider_calls':sum(c['metadata']['provider_call'] for c in calls),'topics':len(assessments),'coverage':metrics['coverage_percent'],'report':str(target)}),flush=True)
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'passed':False,'error':getattr(error,'code',type(error).__name__),'http_status':getattr(error,'status',None)}),flush=True)
        raise SystemExit(1)
