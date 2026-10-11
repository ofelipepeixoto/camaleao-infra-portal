"""Build an OFFLINE Responses example. Does not import a client or call APIs."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_request(model: str) -> dict:
    if not model or len(model) > 100 or not all(c.isalnum() or c in '._-' for c in model):
        raise ValueError('Supply an approved model identifier')
    return {
        'model': model,
        'store': False,
        'max_output_tokens': 1024,
        'instructions': (ROOT / 'prompts/camaleao-infra-system.md').read_text(),
        'input': [{'role': 'user', 'content': [{
            'type': 'input_text',
            'text': 'EXEMPLO FICTÍCIO: equipe de 5 pessoas quer pesquisar documentos públicos. '
                    'Não há inventário ou preço confirmado. Prepare um rascunho.'
        }]}],
        'text': {'format': {
            'type': 'json_schema', 'name': 'camaleao_diagnostic_draft', 'strict': True,
            'schema': json.loads((ROOT / 'contracts/diagnostic-draft.schema.json').read_text())
        }}
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, help='Identifier selected and approved for future API use')
    args = parser.parse_args()
    print(json.dumps(build_request(args.model), ensure_ascii=False, indent=2))
