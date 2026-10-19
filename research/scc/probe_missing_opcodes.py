"""Read-only original-artifact inventory for SCC_MISSING_OPCODES.md.

No Windows EXE or browser runtime is executed. Output contains source hashes,
exact excerpts, hash-dispatch checks and optional instruction-derived nav replay.
"""
from collections import Counter, defaultdict
from pathlib import Path
import argparse
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'agent-original/game-installed/Program_Executable_Files'
RES = ROOT / 'agent-original/game-resources'
TARGETS = {'Setmsk', 'Block', 'Ublock', 'Fault', 'Fclick', 'Setbck', 'Setbcr',
           'Shift', 'Setmap', 'Setzon', 'Egame', 'remStartW', 'StatrW'}


def token_hash(token):
    raw = token.encode('cp1251')
    return 0 if len(raw) >= 7 else sum(c * [1000, 100, 10, 1, 1, 1][i]
                                     for i, c in enumerate(raw))


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--navigation', action='store_true')
    parser.add_argument('--output', type=Path, help='Explicit retained JSON destination; omit to print summary only')
    args = parser.parse_args()
    digest = lambda b: hashlib.sha256(b).hexdigest()
    result = {'method': 'Original resources + original EXE bytes; not original process execution',
              'baseline': 'e08f0f05c75f96def508905aea0aff184f0bd2aa',
              'sha256': {'Agent.exe': digest((BASE / 'Agent.exe').read_bytes())},
              'hashes': {s: hex(token_hash(s)) for s in sorted(TARGETS | {'StartW'})}}
    counts, files = Counter(), defaultdict(set)
    examples, cross_scene, fault_anomalies = [], [], []
    all_words = Counter()
    for path in sorted((BASE / 'Scripts').glob('*.scc')):
        result['sha256']['Scripts/' + path.name] = digest(path.read_bytes())
        lines = path.read_text(encoding='cp1251').splitlines()
        handler, case = None, None
        for i, line in enumerate(lines):
            words = line.split()
            if not words:
                continue
            all_words[words[0]] += 1
            if words[0] == 'Click':
                handler, case = line, None
                if len(words) > 4 and words[4] != '{':
                    cross_scene.append({'file': path.name, 'line': i+1, 'source': line})
            if words[0] == 'Case':
                case = words[1]
            selected = [word for word in TARGETS if word == words[0] or
                        (word == 'Fclick' and word in words)]
            for word in selected:
                counts[word] += 1
                files[word].add(path.name)
                examples.append({'command': word, 'file': path.name, 'line': i+1,
                                 'source': line, 'handler': handler, 'case': case,
                                 'context_start': max(1, i-2),
                                 'context': lines[max(0, i-3):i+5]})
            if words[0] == 'Fault':
                if len(words) < 3 or not words[2].lstrip('-').isdigit():
                    fault_anomalies.append({'file': path.name, 'line': i+1, 'source': line,
                                            'kind': 'missing/non-integer count'})
                elif int(words[2]) != len(words)-3:
                    fault_anomalies.append({'file': path.name, 'line': i+1, 'source': line,
                                            'kind': 'count does not match same-line paths'})
            if words[0] == '}':
                handler, case = None, None
    result.update(counts={k: {'uses': v, 'files': sorted(files[k])} for k, v in sorted(counts.items())},
                  examples=examples, cross_scene_clicks=cross_scene,
                  fault_anomalies=fault_anomalies,
                  all_first_tokens=dict(sorted(all_words.items())))

    # Complete parser instruction readback, not a string-literal search.
    asm = json.loads((ROOT / 'research/scc/evidence/missing-opcodes/dispatch-assembly.json').read_text())
    text = asm['0x4066c8-asm']['normalized_result']
    comparisons = []
    import re
    for line in text.splitlines():
        m = re.search(r'CMP EAX, (0x[0-9a-f]+)', line)
        if m:
            comparisons.append(int(m[1], 16))
    result['parser_compare_immediates'] = [hex(v) for v in comparisons]
    # Borland also uses cumulative SUB/JZ chains; immediate membership alone
    # is NOT a complete recognition check. Replay only the bounded decision tree.
    instructions = {}
    for line in text.splitlines():
        m = re.match(r'(0x[0-9a-f]+): (.*)', line)
        if m:
            instructions[int(m[1], 16)] = m[2]
    order = sorted(instructions)
    following = dict(zip(order, order[1:]))
    def dispatch(value):
        address, eax, equal, greater, trace = 0x40671d, value, False, False, []
        while 0x40671d <= address <= 0x4069ee:
            ins = instructions[address]
            trace.append(hex(address) + ': ' + ins)
            op, operand = ins.split(' ', 1)
            if op in {'CMP', 'SUB'}:
                rhs = int(operand.split(', ')[1], 16)
                equal, greater = eax == rhs, eax > rhs
                if op == 'SUB':
                    eax = (eax-rhs) & 0xffffffff
                    if eax >= 0x80000000:
                        eax -= 0x100000000
            elif op in {'JG', 'JZ', 'JMP'}:
                if op == 'JMP' or (op == 'JG' and greater) or (op == 'JZ' and equal):
                    address = int(operand, 16)
                    continue
            else:
                raise RuntimeError('Unexpected decision-tree instruction: ' + ins)
            address = following[address]
        return {'target': hex(address), 'trace': trace}
    result['dispatch_readback'] = {word: dispatch(token_hash(word))
                                  for word in sorted(TARGETS | {'StartW'})}
    result['ignored_constructs'] = []
    for example in examples:
        if example['command'] in {'Setbcr', 'remStartW'}:
            tokens = example['source'].split()
            result['ignored_constructs'].append({
                **{k: example[k] for k in ('file', 'line', 'source')},
                'token_hashes': [hex(token_hash(t)) for t in tokens],
                'dispatch_targets': [dispatch(token_hash(t))['target'] for t in tokens]})

    data = json.loads((ROOT / 'research/scc/evidence/missing-opcodes/map-bytes.json').read_text())
    values = struct.unpack('<28i', bytes.fromhex(data['normalized_result']['bytes_hex'])[:112])
    result['map_banks'] = [[list(values[bank*14+i*2:bank*14+i*2+2]) for i in range(7)] for bank in range(2)]
    result['fault_rng_n2_histogram'] = dict(Counter(min((r*2+0x3fff)//0x7fff, 1) for r in range(0x8000)))
    resource_index = defaultdict(list)
    for path in RES.rglob('*'):
        if path.is_file():
            key = '/'.join(path.relative_to(RES).parts[1:]).lower()
            resource_index[key].append(path)
    sys.path.insert(0, str(ROOT / 'research/navigation'))
    from probe_navigation import tiff_tags, pe_reader
    pe_read = pe_reader((BASE / 'Agent.exe').read_bytes())
    table = pe_read(0x405ea1, 35*4)
    result['executor_dispatch'] = {'table_va': '0x405ea1', 'bytes_hex': table.hex(),
                                   'cases': {hex(i): hex(v) for i, v in
                                             enumerate(struct.unpack('<35I', table))}}
    resources = {}
    for ex in examples:
        if ex['command'] not in {'Setmsk', 'Setbck', 'Setbcr'}:
            continue
        name = ex['source'].split()[1].replace('\\', '/').lower()
        matches = resource_index.get(name, [])
        resources[name] = [{'path': str(p.relative_to(ROOT)), 'sha256': digest(p.read_bytes()),
                            'width': tiff_tags(p.read_bytes())[256][0],
                            'height': tiff_tags(p.read_bytes())[257][0]} for p in matches]
    result['resources'] = resources
    dimension_checks = []
    for ex in examples:
        if ex['command'] not in {'Setmsk', 'Setbck'}:
            continue
        source = (BASE / 'Scripts' / ex['file']).read_text(encoding='cp1251')
        background = next(line.split()[1] for line in source.splitlines()
                          if line.split() and line.split()[0] == 'Back')
        back_path = resource_index[background.replace('\\', '/').lower()][0]
        bg_tags = tiff_tags(back_path.read_bytes())
        bg_size = [bg_tags[256][0], bg_tags[257][0]]
        name = ex['source'].split()[1].replace('\\', '/').lower()
        for entry in resources[name]:
            dimension_checks.append({'file': ex['file'], 'line': ex['line'],
                                     'command': ex['command'], 'resource': name,
                                     'background_size': bg_size,
                                     'resource_size': [entry['width'], entry['height']],
                                     'matches': bg_size == [entry['width'], entry['height']]})
    result['dimension_checks'] = dimension_checks
    if args.navigation:
        from probe_navigation import decode_tiff, Scene
        nav = {}
        for name in ['masks/scn_16.tif', 'masks/scn_16_m.tif']:
            w, h, pixels = decode_tiff(resource_index[name][0])
            scene = Scene(w, h, pixels)
            route = scene.route((585, 595), (580, 565))
            path = route.pop('path', [])
            route['first_samples'] = path[:3]
            route['last_samples'] = path[-3:]
            nav[name] = {'size': [w, h], 'requested_target_q': scene.q(580, 565),
                         'start_q': scene.q(585, 595), 'route': route}
            gate = scene.route((585, 595), (581, 554))
            gate.pop('path', None)
            nav[name]['observable_probe'] = {'requested_point': [581, 554],
                                              'q': scene.q(581, 554), 'route': gate}
        result['navigation_replay'] = nav
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output) if args.output else None, 'counts': result['counts'],
                      'cross_scene_clicks': len(cross_scene), 'fault_anomalies': fault_anomalies,
                      'ignored_constructs': result['ignored_constructs'],
                      'map_banks': result['map_banks'],
                      'navigation_replay': result.get('navigation_replay')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
