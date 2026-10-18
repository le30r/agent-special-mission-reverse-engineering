"""Read-only SCC/MULT evidence probe; does not implement or run the game."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'research/mult'))
from mult_probe import read_mult

OUT = Path(__file__).resolve().parent / 'evidence'
COMMANDS = ['Click', 'Case', 'Break', 'Goto', 'StartW', 'Start', 'Setxy', 'Addtol', 'State']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    base = ROOT / 'agent-original/game-installed/Program_Executable_Files'
    sources = [base / 'Agent.exe', *sorted((base / 'Scripts').glob('*.scc'))]
    manifest = {str(p.relative_to(ROOT)): digest(p) for p in sources}
    result = []
    for name in ['start.MULT', 'Step_02.MULT']:
        path = ROOT / 'agent-original/game-resources/block9/Xsh/Scn_37' / name
        data, palette, rows, resolve, field4 = read_mult(path)
        manifest[str(path.relative_to(ROOT))] = digest(path)
        frames = []
        for i, row in enumerate(rows, 1):
            objects = []
            for j, record in enumerate(row):
                resolved = resolve(i, j)
                objects.append(dict(name=record['name'], offset=hex(record['offset']),
                                    tag=record['tag'], position=record['position'],
                                    resolved_size=[resolved['a'], resolved['b']]))
            frames.append(dict(frame=i, objects=objects))
        result.append(dict(path=str(path.relative_to(ROOT)), sha256=digest(path),
                           frame_count=len(rows), frames=frames))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'bottle_mult.json').write_text(json.dumps(result, indent=2) + '\n')
    level = (base / 'Scripts/Level1.scc').read_text()
    lines = level.splitlines()
    at = lines.index('Click 0 Botl Botl')
    end = next(i for i in range(at, len(lines)) if lines[i] == '}')
    weights = [1000, 100, 10, 1, 1, 1]
    hashes = {s: hex(sum(c * weights[i] for i, c in enumerate(s.encode('ascii'))))
              for s in COMMANDS}
    facts = dict(source_sha256=manifest, command_hashes=hashes,
                 bottle_scc=[dict(line=i + 1, text=lines[i]) for i in range(at, end + 1)],
                 method='Offline artifact inspection, not original-process execution')
    (OUT / 'source_facts.json').write_text(json.dumps(facts, indent=2) + '\n')
    assert result[1]['frame_count'] == 52
    bottle = next(r for r in result[1]['frames'][9]['objects'] if r['name'] == 'Botl')
    assert bottle['offset'] == '0x1074a' and bottle['resolved_size'] == [0, 0]
    print(json.dumps(dict(command_hashes=hashes, bottle_scc=facts['bottle_scc'],
                          animation_frames=52, bottle_empty_frame=10), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
