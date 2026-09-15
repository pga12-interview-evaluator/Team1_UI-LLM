import copy, json, tempfile, unittest
from pathlib import Path
from runtime import ContractError, validate_input, validate_output, compute_metrics, route_next, SessionStore,render_approved_turn

PACK=json.loads((Path(__file__).parent/'prompt_pack.json').read_text(encoding='utf-8'))
S=PACK['synthetic_samples']
class RuntimeTests(unittest.TestCase):
 def test_all_sample_contracts(self):
  for stage in ['01','02','03','04']:
   validate_input(PACK,stage,S[stage+'_input'])
   validate_output(PACK,stage,S[stage+'_input'],S[stage+'_output'])
 def test_reject_unknown_signal(self):
  with self.assertRaises(ContractError):validate_input(PACK,'03',dict(S['03_input'],gaze_score=.9))
 def test_reject_weights(self):
  v=copy.deepcopy(S['01_output']);v['data']['competencies'][0]['weight']=29
  with self.assertRaises(ContractError):validate_output(PACK,'01',S['01_input'],v)
 def test_reject_fabricated_evidence(self):
  v=copy.deepcopy(S['03_output']);v['data']['topic_scores'][0]['evidence'][0]['quote']='invented experience'
  with self.assertRaises(ContractError):validate_output(PACK,'03',S['03_input'],v)
 def test_reject_quote_from_interviewer(self):
  v=copy.deepcopy(S['03_output']);v['data']['topic_scores'][0]['evidence'][0].update(turn_id='T1',quote=S['03_input']['topic_transcript'][0]['text'])
  with self.assertRaises(ContractError):validate_output(PACK,'03',S['03_input'],v)
 def test_wrong_request(self):
  v=dict(S['02_output'],request_id='old')
  with self.assertRaises(ContractError):validate_output(PACK,'02',S['02_input'],v)
 def test_no_live_rewording(self):
  v=copy.deepcopy(S['02_output']);v['data']['candidate_message']+=' Also tell me your age.'
  with self.assertRaises(ContractError):validate_output(PACK,'02',S['02_input'],v)
 def test_faq_expects_input(self):
  inp=dict(S['02_input'],mode='invite_candidate_questions',question=None,approved_follow_up=None,latest_turn=None)
  out=copy.deepcopy(S['02_output']);out['data'].update(kind='candidate_questions',question_id=None,candidate_message='What would you like to know about the role?',expected_input='candidate_question')
  validate_output(PACK,'02',inp,out)
 def test_local_probe_exactly_matches_approved(self):
  out=render_approved_turn(PACK,S['02_input']);self.assertEqual(out['data']['candidate_message'],S['02_input']['approved_follow_up'])
 def test_local_unknown_faq_uses_fixed_safe_reply(self):
  inp=dict(S['02_input'],mode='answer_candidate_question',question=None,approved_follow_up=None)
  out=render_approved_turn(PACK,inp);self.assertIn('recruiter',out['data']['candidate_message']);self.assertEqual(out['data']['expected_input'],'candidate_question')
 def test_other_language_fixed_text_requests_model(self):
  inp=dict(S['02_input'],language='Hindi',mode='invite_candidate_questions',question=None,approved_follow_up=None,latest_turn=None)
  self.assertIsNone(render_approved_turn(PACK,inp))
 def test_third_probe_rejected(self):
  inp=copy.deepcopy(S['03_input']);inp['counters']['probe_count']=2
  with self.assertRaises(ContractError):validate_output(PACK,'03',inp,S['03_output'])
 def test_reframe_limit(self):
  inp=copy.deepcopy(S['03_input']);inp['counters']['reframe_used']=True
  out=copy.deepcopy(S['03_output']);out['data']['next_action']='reframe';out['data']['probe_type']='none'
  with self.assertRaises(ContractError):validate_output(PACK,'03',inp,out)
 def test_unassessable_does_not_score(self):
  v=copy.deepcopy(S['03_output']);v['data']['assessment_status']='not_assessable'
  with self.assertRaises(ContractError):validate_output(PACK,'03',S['03_input'],v)
 def test_final_arithmetic_drift(self):
  v=copy.deepcopy(S['04_output']);v['data']['overall_score']=4.2
  with self.assertRaises(ContractError):validate_output(PACK,'04',S['04_input'],v)
 def test_full_metrics(self):
  v=compute_metrics(S['04_input']['blueprint'],S['04_input']['latest_topic_assessments'],'completed')
  self.assertAlmostEqual(v['overall_score'],3.7);self.assertEqual(v['coverage_percent'],100)
 def test_probe_revision_is_one_vote(self):
  inp=S['04_input'];v=compute_metrics(inp['blueprint'],[S['03_output']['data']]+inp['latest_topic_assessments'],'completed')
  self.assertAlmostEqual(v['overall_score'],3.7)
 def test_interruption_null(self):
  inp=S['04_input'];v=compute_metrics(inp['blueprint'],inp['latest_topic_assessments'],'technical_interruption')
  self.assertIsNone(v['overall_score']);self.assertEqual(v['signal'],'insufficient_evidence')
 def test_missing_topic_is_not_zero(self):
  inp=S['04_input'];v=compute_metrics(inp['blueprint'],inp['latest_topic_assessments'][:-1],'completed')
  self.assertEqual(v['coverage_percent'],75);self.assertIsNone(v['overall_score'])
 def base_route(self):return dict(stopped=False,paused=False,work_remaining_seconds=300,topic_remaining_seconds=180,probe_count=0,max_probes=2,reframe_used=False,transcript_repairs=0,quality='clear',next_action='probe',next_question_seconds=120)
 def test_stop_priority(self):self.assertEqual(route_next(dict(self.base_route(),stopped=True)),'close')
 def test_pause_priority(self):self.assertEqual(route_next(dict(self.base_route(),paused=True)),'pause')
 def test_reserve_priority(self):self.assertEqual(route_next(dict(self.base_route(),work_remaining_seconds=0)),'candidate_questions')
 def test_probe_cap(self):self.assertEqual(route_next(dict(self.base_route(),probe_count=2)),'advance')
 def test_configured_zero_probes(self):self.assertEqual(route_next(dict(self.base_route(),max_probes=0)),'advance')
 def test_audio_repairs_bounded(self):self.assertEqual(route_next(dict(self.base_route(),quality='unusable',transcript_repairs=2)),'pause')
 def test_question_does_not_fit(self):self.assertEqual(route_next(dict(self.base_route(),next_action='advance',next_question_seconds=500)),'candidate_questions')
 def test_probe_allowed(self):self.assertEqual(route_next(self.base_route()),'probe')
 def test_empty_session_metrics(self):
  v=compute_metrics(S['04_input']['blueprint'],[],'technical_interruption');self.assertEqual(v['coverage_percent'],0)
 def store(self,root):
  store=SessionStore(Path(root)/'test.sqlite');store.create('tenant-a','session-1',{'status':'awaiting_answer','active_turn_id':'T1','question_id':'Q1'});return store
 def test_duplicate_event_commits_once(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root);first=st.transition('tenant-a','session-1',0,'event-1',{'status':'evaluating'},{'turn_id':'T2'})
   again=st.transition('tenant-a','session-1',0,'event-1',{'status':'evaluating'},{'turn_id':'T2'})
   self.assertEqual(first,again);self.assertEqual(st.read('tenant-a','session-1')['revision'],1)
 def test_stale_transition_rejected(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root);st.transition('tenant-a','session-1',0,'event-1',{'status':'evaluating'},{})
   with self.assertRaises(ContractError):st.transition('tenant-a','session-1',0,'event-2',{'status':'evaluating'},{})
 def test_cross_tenant_read_rejected(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root)
   with self.assertRaises(ContractError):st.read('tenant-b','session-1')
 def test_reused_event_payload_rejected(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root);st.transition('tenant-a','session-1',0,'event-1',{'status':'evaluating'},{'turn_id':'T2'})
   with self.assertRaises(ContractError):st.transition('tenant-a','session-1',0,'event-1',{'status':'evaluating'},{'turn_id':'T3'})
 def test_parallel_transitions_commit_once(self):
  import concurrent.futures
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root)
   def attempt(i):
    try:st.transition('tenant-a','session-1',0,'event-'+str(i),{'status':'evaluating'},{'result':i});return True
    except ContractError:return False
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,[1,2]))
   self.assertEqual(sum(results),1);self.assertEqual(st.read('tenant-a','session-1')['revision'],1)
 def test_bad_final_input_quote_rejected_before_api(self):
  inp=copy.deepcopy(S['04_input']);inp['latest_topic_assessments'][0]['topic_scores'][0]['evidence'][0]['quote']='not present'
  with self.assertRaises(ContractError):validate_input(PACK,'04',inp)
 def test_closed_session_rejects_mutation(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root);st.transition('tenant-a','session-1',0,'close-1',{'status':'closed'},{})
   with self.assertRaises(ContractError):st.transition('tenant-a','session-1',1,'event-2',{'status':'awaiting_answer'},{})
 def test_report_requires_closed_session(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root)
   with self.assertRaises(ContractError):st.save_report('tenant-a','session-1',1,{})
 def test_report_is_tenant_scoped(self):
  with tempfile.TemporaryDirectory() as root:
   st=self.store(root);st.transition('tenant-a','session-1',0,'close',{'status':'closed'},{});st.save_report('tenant-a','session-1',1,{'summary':'synthetic'})
   self.assertEqual(st.read_report('tenant-a','session-1',1)['summary'],'synthetic')
   with self.assertRaises(ContractError):st.read_report('tenant-b','session-1',1)

if __name__=='__main__':unittest.main(verbosity=2)
