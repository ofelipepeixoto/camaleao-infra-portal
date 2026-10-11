import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.build_openai_request import build_request


def message(method, rid=1, params=None):
    item = {'jsonrpc': '2.0', 'method': method, 'params': params or {}}
    if rid is not None:
        item['id'] = rid
    return item


def run_server(messages):
    process = subprocess.run([sys.executable, str(ROOT/'mcp/server.py')],
        input=''.join(json.dumps(m)+'\n' for m in messages),
        capture_output=True, text=True, timeout=5)
    if process.returncode:
        raise AssertionError(process.stderr)
    return [json.loads(line) for line in process.stdout.splitlines()]


class IntegrationContracts(unittest.TestCase):
    def test_stdio_lifecycle_and_public_catalog(self):
        out = run_server([message('tools/list'), message('initialize',2),
                          message('notifications/initialized',None),message('tools/list',3)])
        self.assertEqual(out[0]['error']['code'],-32000)
        self.assertEqual(out[1]['result']['protocolVersion'],'2025-06-18')
        self.assertEqual([x['name'] for x in out[2]['result']['tools']],['catalog_list','diagnostic_prepare'])
        self.assertEqual(len(out),3)

    def test_restricted_data_stays_blocked_even_if_external_selected(self):
        intake = json.loads((ROOT/'examples/intake.json').read_text())
        intake.update(sensitivity='restricted',external_processing_allowed=True)
        out = run_server([message('initialize'),message('tools/call',2,{'name':'diagnostic_prepare','arguments':intake})])
        data = json.loads(out[1]['result']['content'][0]['text'])
        self.assertEqual(data['external_processing'],'blocked')
        self.assertIsNone(data['estimated_cost_brl'])

    def test_unknown_fields_and_mutation_tools_rejected(self):
        intake=json.loads((ROOT/'examples/intake.json').read_text())
        intake['api_key']='SYNTHETIC_TEST_VALUE'
        out=run_server([message('initialize'),message('tools/call',2,{'name':'diagnostic_prepare','arguments':intake}),message('tools/call',3,{'name':'execute_shell','arguments':{}})])
        self.assertTrue(out[1]['result']['isError'])
        self.assertTrue(out[2]['result']['isError'])
        self.assertNotIn('SYNTHETIC_TEST_VALUE',json.dumps(out))

    def test_malformed_params_rejected_without_crash(self):
        item=message('tools/call',2);item['params']=[]
        out=run_server([message('initialize'),item,message('ping',3)])
        self.assertEqual(out[1]['error']['code'],-32602)
        self.assertEqual(out[2]['result'],{})

    def test_nested_json_error_does_not_end_stdio_session(self):
        payload = '[' * 2000 + '0' + ']' * 2000 + '\n'
        payload += json.dumps(message('initialize',2))+'\n'
        proc = subprocess.run([sys.executable,str(ROOT/'mcp/server.py')],
                              input=payload,capture_output=True,text=True,timeout=5)
        self.assertEqual(proc.returncode,0,proc.stderr)
        out=[json.loads(x) for x in proc.stdout.splitlines()]
        # Parser depth differs by runtime; either invalid JSON or non-object
        # request is rejected, and the next valid request must still succeed.
        self.assertIn(out[0]['error']['code'],(-32700,-32600))
        self.assertEqual(out[1]['id'],2)

    def test_unicode_and_invalid_ids_keep_session_alive(self):
        out=run_server([message('initialize','\ud800'),message('ping',True),message('ping',3)])
        self.assertEqual(out[0]['id'],'\ud800')
        self.assertEqual(out[1]['error']['code'],-32600)
        self.assertEqual(out[2]['result'],{})

    def test_mcp_and_intake_contracts_agree(self):
        intake=json.loads((ROOT/'contracts/intake.schema.json').read_text())
        tools=json.loads((ROOT/'contracts/mcp-tools.json').read_text())['tools']
        declared=tools[1]['inputSchema']
        self.assertEqual(declared,{k:v for k,v in intake.items() if k not in ('$schema','title')})

    def test_openai_example_is_bounded_unstored_draft(self):
        request=build_request('APPROVED_MODEL_PLACEHOLDER')
        self.assertFalse(request['store'])
        self.assertEqual(request['max_output_tokens'],1024)
        self.assertNotIn('tools',request)
        fmt=request['text']['format']
        self.assertTrue(fmt['strict'])
        self.assertEqual(fmt['schema']['properties']['status']['enum'],['draft'])
        self.assertEqual(fmt['schema']['properties']['human_review']['enum'],[True])


if __name__ == '__main__':
    unittest.main()
