import collections,contextlib,copy,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import run_session
from runtime import ProviderError,ContractError,validate_input,validate_output

HERE=Path(__file__).parent
PACK=json.loads((HERE/'prompt_pack.json').read_text(encoding='utf-8'))
SESSION=json.loads((HERE/'fixtures'/'validated_session.json').read_text(encoding='utf-8'))

class SessionIntegrationTests(unittest.TestCase):
 def setup_tree(self,root):
  (root/'prompt_pack.json').write_text(json.dumps(PACK),encoding='utf-8')
  (root/'model_config.json').write_text(json.dumps({'model':'mock-model'}),encoding='utf-8')
 def fake_client(self):
  seen=collections.Counter()
  responses={i+1:c['response'] for i,c in enumerate(SESSION['calls']) if c['metadata']['provider_call']}
  class Client:
   def __init__(self,*args,**kwargs):pass
   def call(self,stage,inp):
    validate_input(PACK,stage,inp)
    op=int(inp['request_id'].rsplit('-',1)[1]);seen[op]+=1
    if op==8 and seen[op]==1:raise ProviderError('provider_daily_quota_exhausted',429)
    response=copy.deepcopy(responses[op]);response['request_id']=inp['request_id']
    validate_output(PACK,stage,inp,response)
    return response,{'provider_call':True,'usage':{},'elapsed_seconds':0,'attempts':1}
  return Client,seen
 def test_resume_preserves_answers_and_does_not_recall_completed_steps(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);self.setup_tree(root);client,seen=self.fake_client()
   with patch.object(run_session,'ROOT',root),patch.object(run_session,'GeminiClient',client),patch.object(run_session,'load_key',return_value='synthetic-key'),contextlib.redirect_stdout(io.StringIO()):
    with patch('sys.argv',['run_session.py','--model','mock-model','--local-delivery']):
     with self.assertRaises(ProviderError):run_session.main()
    checkpoint=next((root/'reports').glob('checkpoint-*.json'))
    before=json.loads(checkpoint.read_text());self.assertFalse(before['completed']);self.assertEqual(before['pending_stage'],'03');self.assertEqual(len(before['calls']),7)
    with patch('sys.argv',['run_session.py','--resume',str(checkpoint)]):run_session.main()
    self.assertEqual(seen[2],1);self.assertEqual(seen[4],1);self.assertEqual(seen[8],2)
    after=json.loads(checkpoint.read_text());self.assertTrue(after['completed'])
    report=json.loads((root/'reports'/after['final_report']).read_text());self.assertTrue(report['passed']);self.assertEqual(report['metrics']['coverage_percent'],100)
    count=sum(seen.values())
    with patch('sys.argv',['run_session.py','--resume',str(checkpoint)]):run_session.main()
    self.assertEqual(sum(seen.values()),count)
 def test_resume_rejects_model_or_prompt_changes(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);self.setup_tree(root);client,seen=self.fake_client()
   with patch.object(run_session,'ROOT',root),patch.object(run_session,'GeminiClient',client),patch.object(run_session,'load_key',return_value='synthetic-key'),contextlib.redirect_stdout(io.StringIO()):
    with patch('sys.argv',['run_session.py','--model','mock-model','--local-delivery']):
     with self.assertRaises(ProviderError):run_session.main()
    checkpoint=next((root/'reports').glob('checkpoint-*.json'));count=sum(seen.values())
    with patch('sys.argv',['run_session.py','--resume',str(checkpoint),'--model','different-model']):
     with self.assertRaises(ContractError):run_session.main()
    changed=copy.deepcopy(PACK);changed['hashes']['system_prompts']['03_topic_evaluator']='changed'
    (root/'prompt_pack.json').write_text(json.dumps(changed),encoding='utf-8')
    with patch('sys.argv',['run_session.py','--resume',str(checkpoint)]):
     with self.assertRaises(ContractError):run_session.main()
    self.assertEqual(sum(seen.values()),count)

if __name__=='__main__':unittest.main(verbosity=2)
