import copy,json,unittest,urllib.error
from unittest.mock import patch
from pathlib import Path
from runtime import GeminiClient,ContractError,ProviderError,provider_schema
PACK=json.loads((Path(__file__).parent/'prompt_pack.json').read_text(encoding='utf-8'))
class Response:
 def __init__(self,value):self.body=value if isinstance(value,bytes) else json.dumps(value).encode()
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def read(self,size):return self.body[:size]
class ProviderTests(unittest.TestCase):
 def setUp(self):
  self.client=GeminiClient(PACK,'synthetic-test-key','test-model',attempts=2)
  self.input=PACK['synthetic_samples']['02_input'];self.output=PACK['synthetic_samples']['02_output']
 def valid(self):return {'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':json.dumps(self.output)}]}}]}
 def test_valid_mocked_response(self):
  with patch('urllib.request.urlopen',return_value=Response(self.valid())) as request:
   out,meta=self.client.call('02',self.input);self.assertEqual(out,self.output);self.assertEqual(meta['attempts'],1)
   body=json.loads(request.call_args.args[0].data);self.assertEqual(json.loads(body['contents'][0]['parts'][0]['text']),self.input)
 def test_generation_schema_reduction_preserves_original(self):
  full=copy.deepcopy(PACK['schemas']['02_output']);reduced=provider_schema(full)
  self.assertEqual(full,PACK['schemas']['02_output']);self.assertNotIn('additionalProperties',reduced)
  self.assertEqual(reduced['required'],full['required']);self.assertEqual(reduced['properties']['status']['enum'],['ok','needs_review'])
 def test_invalid_input_prevents_network(self):
  with patch('urllib.request.urlopen') as request:
   with self.assertRaises(ContractError):self.client.call('02',dict(self.input,gaze=5))
   request.assert_not_called()
 def test_http_400_not_retried(self):
  with patch('urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://example.invalid',400,'invalid',{},None)) as request:
   with self.assertRaises(ProviderError):self.client.call('02',self.input)
   self.assertEqual(request.call_count,1)
 def test_transient_retried_once(self):
  error=urllib.error.HTTPError('https://example.invalid',503,'busy',{},None)
  with patch('urllib.request.urlopen',side_effect=[error,Response(self.valid())]) as request,patch('runtime.time.sleep'):
   _,meta=self.client.call('02',self.input);self.assertEqual(request.call_count,2);self.assertEqual(meta['attempts'],2)
 def test_retry_limit_stops(self):
  with patch('urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://example.invalid',429,'busy',{},None)) as request,patch('runtime.time.sleep'):
   with self.assertRaises(ProviderError):self.client.call('02',self.input)
   self.assertEqual(request.call_count,2)
 def test_long_retry_hint_stops(self):
  with patch('urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://example.invalid',429,'busy',{'Retry-After':'90'},None)) as request:
   with self.assertRaises(ProviderError):self.client.call('02',self.input)
   self.assertEqual(request.call_count,1)
 def test_max_tokens_rejected(self):
  raw=self.valid();raw['candidates'][0]['finishReason']='MAX_TOKENS'
  with patch('urllib.request.urlopen',return_value=Response(raw)):
   with self.assertRaises(ProviderError):self.client.call('02',self.input)
 def test_safety_block_rejected(self):
  with patch('urllib.request.urlopen',return_value=Response({'promptFeedback':{'blockReason':'SAFETY'}})):
   with self.assertRaises(ProviderError):self.client.call('02',self.input)
 def test_thought_not_parsed(self):
  raw=self.valid();raw['candidates'][0]['content']['parts'].insert(0,{'thought':True,'text':'private reasoning'})
  with patch('urllib.request.urlopen',return_value=Response(raw)):
   out,_=self.client.call('02',self.input);self.assertEqual(out,self.output)
 def test_markdown_not_repaired(self):
  raw=self.valid();raw['candidates'][0]['content']['parts'][0]['text']='```json\n{}\n```'
  with patch('urllib.request.urlopen',return_value=Response(raw)):
   with self.assertRaises(ProviderError):self.client.call('02',self.input)
 def test_large_response_rejected(self):
  with patch('urllib.request.urlopen',return_value=Response(b' '*2_000_001)):
   with self.assertRaises(ContractError):self.client.call('02',self.input)
 def test_validation_regeneration_is_bounded(self):
  bad=self.valid();bad['candidates'][0]['content']['parts'][0]['text']=json.dumps(dict(self.output,request_id='wrong'))
  with patch('urllib.request.urlopen',side_effect=[Response(bad),Response(self.valid())]) as request:
   out,meta=self.client.call('02',self.input);self.assertEqual(out,self.output);self.assertEqual(meta['validation_regenerations'],1);self.assertEqual(request.call_count,2)
 def test_invalid_output_cannot_loop_regenerations(self):
  bad=self.valid();bad['candidates'][0]['content']['parts'][0]['text']=json.dumps(dict(self.output,request_id='wrong'))
  with patch('urllib.request.urlopen',side_effect=lambda *a,**k:Response(bad)) as request:
   with self.assertRaises(ContractError):self.client.call('02',self.input)
   self.assertEqual(request.call_count,2)
 def test_daily_quota_not_retried(self):
  import io
  body={'error':{'details':[{'violations':[{'quotaId':'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}}
  error=urllib.error.HTTPError('https://example.invalid',429,'quota',{},io.BytesIO(json.dumps(body).encode()))
  with patch('urllib.request.urlopen',side_effect=error) as request:
   with self.assertRaises(ProviderError) as raised:self.client.call('02',self.input)
   self.assertEqual(raised.exception.code,'provider_daily_quota_exhausted');self.assertEqual(request.call_count,1)
if __name__=='__main__':unittest.main(verbosity=2)
