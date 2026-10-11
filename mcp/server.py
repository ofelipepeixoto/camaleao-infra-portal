"""Experimental MCP stdio subset with public offline data, no network or secrets.

Not a production or authenticated remote server. Real SDK/client compatibility
and full protocol conformance are pending.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from packages.core.intake import parse_intake, diagnose

TOOLS = json.loads((ROOT / 'contracts/mcp-tools.json').read_text())['tools']
CATALOG = json.loads((ROOT / 'catalog/services.json').read_text())
MAX_BYTES = 65536


def respond(request_id, *, result=None, code=None, message=None):
    out = {'jsonrpc': '2.0', 'id': request_id}
    out.update({'error': {'code': code, 'message': message}} if code is not None else {'result': result})
    print(json.dumps(out, ensure_ascii=True), flush=True)


def main():
    initialized = False
    for raw in iter(lambda: sys.stdin.buffer.readline(MAX_BYTES + 1), b''):
        if len(raw) > MAX_BYTES:
            respond(None, code=-32700, message='Request exceeds local limit')
            return
        try:
            request = json.loads(raw)
        except (ValueError, UnicodeDecodeError, RecursionError):
            respond(None, code=-32700, message='Invalid JSON')
            continue
        if not isinstance(request, dict) or request.get('jsonrpc') != '2.0':
            respond(None, code=-32600, message='Invalid request')
            continue
        if 'id' not in request:
            # Notifications do not receive JSON-RPC responses.
            continue
        rid = request['id']
        if type(rid) not in (str, int) or (isinstance(rid, str) and len(rid) > 128):
            respond(None, code=-32600, message='Invalid request id')
            continue
        method = request.get('method')
        params = request.get('params', {})
        if not isinstance(params, dict):
            respond(rid, code=-32602, message='Invalid params')
            continue
        if method == 'initialize':
            initialized = True
            respond(rid, result={
                'protocolVersion': '2025-06-18',
                'capabilities': {'tools': {'listChanged': False}},
                'serverInfo': {'name': 'camaleao-infra-offline', 'version': '0.1.0'},
                'instructions': 'Laboratório offline com catálogo público. Sem ações externas.'
            })
        elif not initialized:
            respond(rid, code=-32000, message='Initialize first')
        elif method == 'ping':
            respond(rid, result={})
        elif method == 'tools/list':
            respond(rid, result={'tools': TOOLS})
        elif method == 'tools/call':
            name, arguments = params.get('name'), params.get('arguments', {})
            try:
                if name == 'catalog_list' and arguments == {}:
                    value = CATALOG
                elif name == 'diagnostic_prepare':
                    value = diagnose(parse_intake(arguments))
                else:
                    raise ValueError('Tool or arguments not allowed')
                respond(rid, result={'content': [{'type': 'text', 'text': json.dumps(value, ensure_ascii=False)}], 'isError': False})
            except (ValueError, TypeError):
                respond(rid, result={'content': [{'type': 'text', 'text': 'Input rejected by offline policy'}], 'isError': True})
        else:
            respond(rid, code=-32601, message='Method not implemented in this offline subset')


if __name__ == '__main__':
    main()
