"""Read-only SCC/Mask probe for the Level1 <-> Level39 transition.

This checks resource relationships and portal mask correction independently of
the EXE analysis. It does not execute Agent.exe or validate the game loop.
Requires Python 3 and libtiff's tiffcp (through probe_navigation).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "agent-original/game-installed/Program_Executable_Files/Scripts"
MASKS = ROOT / "agent-original/game-resources/block0/Masks"
sys.path.insert(0, str(ROOT / "research/navigation"))
from probe_navigation import Scene, decode_tiff  # noqa: E402


def read_scene(number: int) -> dict:
    path = SCRIPTS / f"Level{number}.scc"
    raw = path.read_bytes()
    lines = raw.decode("cp1251").splitlines()
    portals = []
    mask_name = None
    handlers = []
    current = None
    for lineno, line in enumerate(lines, 1):
        tokens = line.strip().split()
        if not tokens:
            continue
        if tokens[0] == "Portal":
            portals.append({"index": len(portals), "direction": int(tokens[1]),
                            "xy": [int(tokens[2]), int(tokens[3])], "line": lineno})
        elif tokens[0] == "Mask":
            mask_name = tokens[1].replace("\\", "/").split("/")[-1]
        elif tokens[0] == "Click":
            current = {"item": int(tokens[1]), "event": tokens[2],
                       "state_object": tokens[3], "line": lineno,
                       "cases": [], "commands": []}
            handlers.append(current)
        elif current is not None:
            if tokens[0] == "Case":
                current["cases"].append(int(tokens[1]))
            elif tokens[0] in {"Level", "Goport", "Goto", "StartW", "State", "Lstate"}:
                current["commands"].append({"name": tokens[0], "args": tokens[1:], "line": lineno})
    assert mask_name is not None
    mask_path = next(p for p in MASKS.iterdir() if p.name.lower() == mask_name.lower())
    width, height, pixels = decode_tiff(mask_path)
    scene = Scene(width, height, pixels)
    for portal in portals:
        x, y = portal["xy"]
        portal["mask_q"] = scene.q(x, y)
        hit = scene.snap((x, y))
        portal["corrected_xy"] = list(hit[0]) if hit else None
        portal["snap_radius"] = hit[1] if hit else None
        portal["snap_angle_index"] = hit[2] if hit else None
    return {"scene": number, "scc_sha256": hashlib.sha256(raw).hexdigest(),
            "mask": str(mask_path.relative_to(ROOT)), "mask_size": [width, height],
            "mask_sha256": hashlib.sha256(mask_path.read_bytes()).hexdigest(),
            "portals": portals, "handlers": handlers}


def transition(scene: dict, event: str, target: int) -> dict:
    matches = []
    for handler in scene["handlers"]:
        if handler["event"] != event:
            continue
        commands = handler["commands"]
        for command in commands:
            if command["name"] != "Level" or int(command["args"][0]) != target:
                continue
            index = int(command["args"][1])
            matches.append({"source_scene": scene["scene"], "event": event,
                            "handler_line": handler["line"], "item": handler["item"],
                            "state_object": handler["state_object"],
                            "cases": handler["cases"], "commands": commands,
                            "target_scene": target, "target_portal_index": index})
    if len(matches) != 1:
        raise ValueError(f"Expected one {scene['scene']}:{event} -> {target}; found {len(matches)}")
    return matches[0]


def main() -> None:
    first, other = read_scene(1), read_scene(39)
    forward = transition(first, "Goto_5", 39)
    reverse = transition(other, "Goto_11", 1)
    forward["destination_portal"] = other["portals"][forward["target_portal_index"]]
    reverse["destination_portal"] = first["portals"][reverse["target_portal_index"]]
    out = {"method": "SCC parse + original TIFF mask offline correction; no game execution",
           "forward": forward, "reverse": reverse,
           "scenes": [{k: v for k, v in s.items() if k != "handlers"} for s in (first, other)]}
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
